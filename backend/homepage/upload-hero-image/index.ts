import { Effect } from "effect";
import { writeFile, mkdir } from "node:fs/promises";
import { v7 } from "uuid";
import sharp from "sharp";
import { existsSync } from "node:fs";

export interface UploadHeroImageInput {
  buffer: Uint8Array;
  mimeType: string;
  preserveAspect?: boolean; // If true, doesn't crop to 1920x1080
  /** Filename prefix, defaults to "hero" */
  filenamePrefix?: string;
}

export interface UploadHeroImageResult {
  url: string;
  filename: string;
}

/**
 * Upload homepage hero background image
 * - Validates image type (jpg, png, webp)
 * - Validates size (max 5MB)
 * - Saves to uploads/homepage/ (served at /uploads/homepage/)
 * - Returns public URL
 */
export const uploadHeroImage = ({
  buffer,
  mimeType,
  preserveAspect = false,
  filenamePrefix = "hero",
}: UploadHeroImageInput): Effect.Effect<UploadHeroImageResult, Error> => {
  return Effect.gen(function* () {
    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(mimeType.toLowerCase())) {
      yield* Effect.fail(
        new Error("Invalid file type. Only JPG, PNG, and WebP are allowed."),
      );
    }

    // Validate file size (5MB = 5 * 1024 * 1024 bytes)
    const maxSize = 5 * 1024 * 1024;
    if (buffer.length > maxSize) {
      yield* Effect.fail(new Error("File too large. Maximum size is 5MB."));
    }

    // Ensure uploads/homepage directory exists
    const uploadsDir = "./uploads/homepage";
    if (!existsSync(uploadsDir)) {
      yield* Effect.tryPromise({
        try: () => mkdir(uploadsDir, { recursive: true }),
        catch: (err) => new Error(`Failed to create uploads directory: ${err}`),
      });
    }

    // Generate unique filename
    const fileId = v7();
    const filename = `${filenamePrefix}-${fileId}.webp`;
    const filePath = `${uploadsDir}/${filename}`;

    // Process and save image using sharp
    yield* Effect.tryPromise({
      try: async () => {
        const sharpInstance = sharp(Buffer.from(buffer));

        if (preserveAspect) {
          // For brand statement: preserve aspect ratio, max width 1200px
          await sharpInstance
            .resize({
              width: 1200,
              fit: "inside", // Preserve aspect ratio
              withoutEnlargement: true,
            })
            .webp({
              quality: 90,
              effort: 6,
            })
            .toFile(filePath);
        } else {
          // Preserve original aspect ratio, only cap the width at 1920px
          await sharpInstance
            .resize({
              width: 1920,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({
              quality: 90,
              effort: 6,
            })
            .toFile(filePath);
        }
      },
      catch: (err) => new Error(`Failed to process image: ${err}`),
    });

    // Return public URL
    const publicUrl = `/uploads/homepage/${filename}`;

    return {
      url: publicUrl,
      filename,
    };
  });
};
