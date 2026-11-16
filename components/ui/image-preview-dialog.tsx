import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "./dialog";

export interface ImagePreview {
  url: string;
  alt: string;
}

/**
 * Full-size image preview over a dark backdrop, closed by its close button,
 * Escape, or a click anywhere outside the image.
 *
 * Built as a Radix dialog so it nests safely inside another dialog or sheet
 * (the product editor, the order details modal): Escape and outside clicks
 * close only this preview and leave the parent open. The image is shown at
 * its natural size, capped to the viewport on desktop and mobile alike.
 *
 * Stacked at z-[10002], above the Sheet layer (z-[10001]): the mobile order
 * details are a Sheet, and at the dialog default (z-50) the preview opened
 * invisibly behind it.
 */
export function ImagePreviewDialog({
  preview,
  onClose,
}: {
  preview: ImagePreview | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/80 z-[10002]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[10002] flex items-center justify-center p-4 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <DialogTitle className="sr-only">Image preview</DialogTitle>
          {preview && (
            <div className="relative">
              <img
                src={preview.url}
                alt={preview.alt}
                className="block w-auto h-auto max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/placeholder.svg";
                }}
              />
              <DialogClose
                type="button"
                className="absolute top-2 right-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </DialogClose>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
