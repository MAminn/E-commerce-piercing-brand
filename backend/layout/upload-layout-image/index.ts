import { Effect } from "effect";
import { writeFile, mkdir } from "node:fs/promises";
import { v7 } from "uuid";
import sharp from "sharp";
import { existsSync } from "node:fs";

export interface UploadLayoutImageInput {
  buffer: Uint8Array;
  mimeType: string;
  /** "header-logo" | "footer-logo" */
  prefix: string;
}

export interface UploadLayoutImageResult {
  url: string;
  filename: string;
}

/**
 * Upload a layout image (header logo or footer logo).
 * - Validates image type (jpg, png, webp, svg)
 * - Validates size (max 2MB)
 * - Preserves aspect ratio, max 600px wide
 * - Saves to uploads/layout/
 */
export const uploadLayoutImage = ({
  buffer,
  mimeType,
  prefix,
}: UploadLayoutImageInput): Effect.Effect<UploadLayoutImageResult, Error> => {
  return Effect.gen(function* () {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/svg+xml",
      "image/x-icon",
      "image/vnd.microsoft.icon",
    ];
    if (!allowedTypes.includes(mimeType.toLowerCase())) {
      yield* Effect.fail(
        new Error(
          "Invalid file type. Only JPG, PNG, WebP, and SVG are allowed.",
        ),
      );
    }

    const maxSize = 2 * 1024 * 1024;
    if (buffer.length > maxSize) {
      yield* Effect.fail(new Error("File too large. Maximum size is 2MB."));
    }

    const uploadsDir = "./uploads/layout";
    if (!existsSync(uploadsDir)) {
      yield* Effect.tryPromise({
        try: () => mkdir(uploadsDir, { recursive: true }),
        catch: (err) => new Error(`Failed to create uploads directory: ${err}`),
      });
    }

    const fileId = v7();

    // SVG and ICO files are stored as-is
    if (mimeType === "image/svg+xml") {
      const filename = `${prefix}-${fileId}.svg`;
      const filePath = `${uploadsDir}/${filename}`;

      yield* Effect.tryPromise({
        try: () => writeFile(filePath, Buffer.from(buffer)),
        catch: (err) => new Error(`Failed to save SVG: ${err}`),
      });

      return { url: `/uploads/layout/${filename}`, filename };
    }

    if (mimeType === "image/x-icon" || mimeType === "image/vnd.microsoft.icon") {
      const filename = `${prefix}-${fileId}.ico`;
      const filePath = `${uploadsDir}/${filename}`;

      yield* Effect.tryPromise({
        try: () => writeFile(filePath, Buffer.from(buffer)),
        catch: (err) => new Error(`Failed to save ICO: ${err}`),
      });

      return { url: `/uploads/layout/${filename}`, filename };
    }

    // Raster images are processed with sharp
    const filename = `${prefix}-${fileId}.webp`;
    const filePath = `${uploadsDir}/${filename}`;

    if (prefix === "share-image") {
      // The frontend declares this image as exactly 1200x630 in og:image
      // meta tags, so it must actually BE 1200x630 — "fit: inside" would
      // preserve the source aspect ratio instead and silently invalidate
      // that declaration, reproducing the WhatsApp/Instagram crop bug this
      // field exists to fix. "cover" crops to fill the exact box instead.
      yield* Effect.tryPromise({
        try: async () => {
          await sharp(Buffer.from(buffer))
            .flatten({ background: "#ffffff" })
            .resize({ width: 1200, height: 630, fit: "cover" })
            .webp({ quality: 90, effort: 6 })
            .toFile(filePath);
        },
        catch: (err) => new Error(`Failed to process image: ${err}`),
      });

      return { url: `/uploads/layout/${filename}`, filename };
    }

    if (prefix === "email-logo") {
      // Marketing emails render at a fixed 40px display height (see
      // MarketingEmailLayout.tsx) — 400px wide covers retina displays with
      // plenty of headroom without bloating a message that's mostly text.
      yield* Effect.tryPromise({
        try: async () => {
          await sharp(Buffer.from(buffer))
            .resize({ width: 400, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 90, effort: 6 })
            .toFile(filePath);
        },
        catch: (err) => new Error(`Failed to process image: ${err}`),
      });

      return { url: `/uploads/layout/${filename}`, filename };
    }

    if (prefix === "popup") {
      // Popup hero image is a portrait-ish lifestyle photo filling the top
      // of a modal card, not a small icon — needs more resolution than the
      // 600px logo cap, but (unlike share-image) has no fixed aspect ratio
      // to enforce, so "inside" (preserve ratio) is correct here.
      yield* Effect.tryPromise({
        try: async () => {
          await sharp(Buffer.from(buffer))
            .resize({ width: 800, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 90, effort: 6 })
            .toFile(filePath);
        },
        catch: (err) => new Error(`Failed to process image: ${err}`),
      });

      return { url: `/uploads/layout/${filename}`, filename };
    }

    yield* Effect.tryPromise({
      try: async () => {
        await sharp(Buffer.from(buffer))
          .resize({
            width: 600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 90, effort: 6 })
          .toFile(filePath);
      },
      catch: (err) => new Error(`Failed to process image: ${err}`),
    });

    return { url: `/uploads/layout/${filename}`, filename };
  });
};
