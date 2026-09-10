import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { z } from "zod";
import { createFile } from "#root/backend/file/upload-file/createFile";
import { writeFile, unlink } from "node:fs/promises";
import { v7 } from "uuid";
import sharp from "sharp";

// Public endpoint — anyone can attach a photo to a review, no login required.
// Kept deliberately narrow: small size cap, image-only allowlist, and the
// upload is always re-encoded through sharp (strips EXIF/metadata and
// normalizes format), same as the admin upload pipeline.
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const uploadReviewImageProcedure = publicProcedure
  .input(
    z.object({
      file: z.object({
        name: z.string(),
        type: z.string(),
        buffer: z.instanceof(Uint8Array),
      }),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const mimeType = input.file.type.toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return {
        success: false as const,
        error: "Only JPEG, PNG, or WebP images are allowed",
      };
    }
    if (input.file.buffer.byteLength > MAX_BYTES) {
      return {
        success: false as const,
        error: "Image must be smaller than 5MB",
      };
    }

    try {
      const fileId = v7();
      const filename = `${fileId}.webp`;
      const tempFilePath = `./uploads/temp_${fileId}`;
      const finalFilePath = `./uploads/${filename}`;

      await writeFile(tempFilePath, Buffer.from(input.file.buffer));

      try {
        await sharp(tempFilePath)
          .rotate()
          .withMetadata({ orientation: undefined })
          .resize({
            height: 1200,
            width: 1200,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 82, effort: 6 })
          .toFile(finalFilePath);
      } finally {
        try {
          await unlink(tempFilePath);
        } catch {
          // Best-effort cleanup; a stray temp file isn't fatal.
        }
      }

      const result = await runBackendEffect(
        createFile({ diskname: filename }).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);

      return result;
    } catch (error) {
      console.error("Review image upload error:", error);
      return {
        success: false as const,
        error: "Failed to upload image",
      };
    }
  });
