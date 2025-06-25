import { PdfConversionApiClient } from '@/data/client/pdf-conversion-api-client';
import { DatabaseContext } from '@/contexts/db-context';
import { SaaSContext } from '@/contexts/saas-context';
import { isIOS } from './utils';

const MAX_CANVAS_PIXELS = 16_777_216;


/**
 * Validates if the provided data is a valid PDF by checking the file header
 * @param pdfData - PDF data as Uint8Array
 * @returns boolean indicating if the data is a valid PDF
 */
function isValidPDF(pdfData: Uint8Array): boolean {
  // PDF files start with "%PDF-" (0x25, 0x50, 0x44, 0x46, 0x2D)
  if (pdfData.length < 5) return false;
  
  const header = [0x25, 0x50, 0x44, 0x46, 0x2D]; // "%PDF-"
  for (let i = 0; i < 5; i++) {
    if (pdfData[i] !== header[i]) return false;
  }
  return true;
}

/**
 * Converts a PDF (base64 string or ArrayBuffer) to an array of image data URLs (one per page).
 * @param {string|ArrayBuffer|Uint8Array} pdf - The PDF data (base64 string or ArrayBuffer or Uint8Array)
 * @param {object} conversion_config - { image_format: 'image/jpeg'|'image/png', height?: number, width?: number, base64?: boolean }
 * @param {object} contexts - { dbContext?: DatabaseContextType, saasContext?: SaaSContextType }
 * @returns {Promise<string[]>} Array of image data URLs
 */
export async function convert(
  pdf: string | ArrayBuffer | Uint8Array, 
  conversion_config: { image_format?: string, height?: number, scale?: number, width?: number, base64?: boolean } = {},
  contexts?: { dbContext?: any, saasContext?: any }
): Promise<string[]> {
  // Ensure we're in the browser environment
  if (typeof window === 'undefined') {
    throw new Error('PDF conversion is only available in the browser environment');
  }

  // On iOS, use server-side conversion
  if ((isIOS() && process.env.NEXT_PUBLIC_OPTIONAL_CONVERT_PDF_SERVERSIDE) || process.env.NEXT_PUBLIC_CONVERT_PDF_SERVERSIDE) {
    console.log('PDF processing server-side');
    let pdfBase64: string;
    
    if (typeof pdf === 'string') {
      if (/data:([a-zA-Z]*)\/([a-zA-Z]*);base64,([^"]*)/.test(pdf)) {
        pdfBase64 = pdf;
      } else {
        throw new Error('Only base64-encoded PDF strings are supported on iOS');
      }
    } else if (pdf instanceof ArrayBuffer) {
      const uint8Array = new Uint8Array(pdf);
      pdfBase64 = 'data:application/pdf;base64,' + btoa(String.fromCharCode(...Array.from(uint8Array)));
    } else if (pdf instanceof Uint8Array) {
      pdfBase64 = 'data:application/pdf;base64,' + btoa(String.fromCharCode(...Array.from(pdf)));
    } else {
      throw new Error('Unsupported PDF input type');
    }

    try {
      const apiClient = new PdfConversionApiClient('', contexts?.dbContext, contexts?.saasContext);
      const result = await apiClient.convertPdf({
        pdfBase64,
        conversion_config
      });

      if (result.success) {
        return result.images;
      } else {
        throw new Error(result.error || 'Server conversion failed');
      }
    } catch (error) {
      console.warn('Server-side conversion failed, falling back to client-side:', error);
      // Continue to client-side conversion below
    }
  }

  // Client-side conversion (non-iOS or fallback)
  const pdfjsLib = await import('pdfjs-dist');
  
  // Set up the worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

  let pdfData: Uint8Array;

  if (typeof pdf === 'string') {
    // Support for URL input
    if (pdf.startsWith('http') || pdf.startsWith('moz-extension://') || pdf.startsWith('chrome-extension://') || pdf.startsWith('file://')) {
      const resp = await fetch(pdf);
      pdfData = new Uint8Array(await resp.arrayBuffer());
    }
    // Support for base64 encoded pdf input
    else if (/data:([a-zA-Z]*)\/([a-zA-Z]*);base64,([^"]*)/.test(pdf)) {
      pdfData = new Uint8Array(Buffer.from(pdf.split(',')[1], 'base64'));
    }
    // Support for filepath input
    else {
      // pdfData = new Uint8Array(await readFile(pdf));
      throw new Error('File paths are not supported!')
    }
  }
  // Support for buffer input
  else if (Buffer.isBuffer(pdf)) {
    pdfData = new Uint8Array(pdf);
  }
  // Support for Uint8Array input
  else throw new Error('Unsupported PDF input type');

  // Validate that the file is actually a PDF
  if (!isValidPDF(pdfData)) {
    throw new Error('Invalid PDF file: File does not contain valid PDF header');
  }

  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdfDocument = await loadingTask.promise;
  const numPages = pdfDocument.numPages;
  const outputPages: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDocument.getPage(i);
    let scale = conversion_config.scale || 1.5;
    let viewport = page.getViewport({ scale });
    
    // Scale it up / down dependent on the sizes given in the config (if there are any)
    if (conversion_config.width) {
      scale = conversion_config.width / viewport.width;
      viewport = page.getViewport({ scale });
    } else if (conversion_config.height) {
      scale = conversion_config.height / viewport.height;
      viewport = page.getViewport({ scale });
    }

    // iOS-fix — przytnij skalę gdy przekroczysz limit Safari
    const ratio = (window.devicePixelRatio || 1);
    const area = viewport.width * viewport.height * ratio * ratio;
    if (area > MAX_CANVAS_PIXELS) {
      scale *= Math.sqrt(MAX_CANVAS_PIXELS / area);
      viewport = page.getViewport({ scale });
    }

    // Create a canvas element
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get canvas context');
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    await page.render(renderContext).promise;
    const image = canvas.toDataURL(conversion_config.image_format || 'image/png');
    outputPages.push(image);
    
    // Clean up
    await page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  }
  return outputPages;
} 