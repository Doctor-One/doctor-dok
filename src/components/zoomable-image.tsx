import Image from 'next/image'
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog'
import { DetailedHTMLProps, ImgHTMLAttributes, useState } from 'react'

interface ZoomableImageProps extends Omit<DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>, 'width' | 'height'> {
  width?: number;
  height?: number;
}

export default function ZoomableImage({
  src,
  alt,
  width,
  height,
  className,
  id,
}: ZoomableImageProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Add this component to a global registry when mounted
  if (typeof window !== 'undefined' && id) {
    (window as any).zoomableImages = (window as any).zoomableImages || {};
    (window as any).zoomableImages[id] = {
      open: () => setIsOpen(true)
    };
  }

  if (!src) return null
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Image
          src={src}
          alt={alt || ''}
          sizes="100vw"
          className={className}
          width={width}
          height={height}
          id={id}
        />
      </DialogTrigger>
      <DialogContent 
        className="max-w-7xl border-0 bg-transparent p-0" 
        onClick={() => {
          // Close popup when clicking anywhere in the dialog
          setIsOpen(false);
        }}
      >
        <div className="relative h-[calc(100vh-220px)] w-full overflow-clip rounded-md bg-transparent shadow-md">
          <Image src={src} fill alt={alt || ''} className="h-full w-full object-contain" />
        </div>
      </DialogContent>
    </Dialog>
  )
}