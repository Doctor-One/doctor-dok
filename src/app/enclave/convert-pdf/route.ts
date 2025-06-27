import { NextRequest, NextResponse } from 'next/server';
import { convertServerSide } from '@/lib/pdf2js-server';
import { authorizeRequestContext, AuthorizedRequestContext, AuthorizationError } from '@/lib/generic-api';
import { StorageService } from '@/lib/storage-service';
import { EncryptionUtils } from '@/lib/crypto';
import { rmdirSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { deleteTemporaryServerKey } from '@/data/server/server-key-helpers';
import { KeyAuthorizationZone } from '@/data/dto';
import { getErrorMessage } from '@/lib/utils';

export async function POST(request: NextRequest, response: NextResponse) {
  let tempDir: string = '';
  let context: AuthorizedRequestContext | null = null;
  try {

    context = await authorizeRequestContext(request, response, KeyAuthorizationZone.Enclave); // we need to authorize the request to get the temporary server key
    const storageService = new StorageService(context.databaseIdHash);
    tempDir = join(storageService.getTempDir(), nanoid());


    const body = await request.json();
    let { pdfBase64, conversion_config, storageKey } = body;

    if (storageKey) {
      const attachment = await storageService.readAttachment(storageKey);
      if (context.masterKey) { // if the encryption key is provided, we need to decrypt the attachment
        const attachmentEncryptionUtils = new EncryptionUtils(context.masterKey as string);
        const decryptedAttachment = await attachmentEncryptionUtils.decryptArrayBuffer(attachment as ArrayBuffer);
        pdfBase64 = Buffer.from(decryptedAttachment).toString('base64');
      }

      if (!attachment) {
        return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
      }
    }

    if (!pdfBase64) {
      return NextResponse.json(
        { error: 'PDF base64 data is required' },
        { status: 400 }
      );
    }

    const images = await convertServerSide(pdfBase64, conversion_config || {}, tempDir);

    return NextResponse.json({
      success: true,
      images: images
    });

  } catch (error) {
    console.error('PDF conversion error:', error);

    if (error instanceof AuthorizationError)
      return new Response(getErrorMessage(error), { status: 401 });
    else
      return new Response(getErrorMessage(error), { status: 500 });



  } finally {
    if (context) {
      context.deleteTemporaryServerKey();
    }
    if (tempDir) {
      rmdirSync(tempDir, { recursive: true });
    }
  }
} 