import { Effect } from "effect";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { v7 } from "uuid";
import { ServerError } from "#root/shared/error/server";

const MAX_FONT_SIZE = 2 * 1024 * 1024; // 2MB

const EXTENSION_FORMAT: Record<string, "woff2" | "woff" | "ttf"> = {
  woff2: "woff2",
  woff: "woff",
  ttf: "ttf",
};

/**
 * Browsers send inconsistent (often generic) Content-Types for font
 * uploads — validate by file extension instead, same reasoning as any
 * upload endpoint that can't trust the client-declared mimetype.
 */
function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "font";
}

export interface UploadFontFileInput {
  buffer: Uint8Array;
  filename: string;
  familyName: string;
  weight: number;
  style: "normal" | "italic";
}

export interface UploadFontFileResult {
  fileUrl: string;
  format: "woff2" | "woff" | "ttf";
}

export const uploadFontFile = ({
  buffer,
  filename,
  familyName,
  weight,
  style,
}: UploadFontFileInput): Effect.Effect<UploadFontFileResult, ServerError<string>> => {
  return Effect.gen(function* ($) {
    const ext = extensionOf(filename);
    const format = EXTENSION_FORMAT[ext];
    if (!format) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "InvalidFontFileType",
            statusCode: 400,
            clientMessage: "Invalid file type. Only WOFF2, WOFF, and TTF are allowed.",
          }),
        ),
      );
    }

    if (buffer.length > MAX_FONT_SIZE) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "FontFileTooLarge",
            statusCode: 400,
            clientMessage: "File too large. Maximum size is 2MB.",
          }),
        ),
      );
    }

    if (!Number.isInteger(weight) || weight < 100 || weight > 900) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "InvalidFontWeight",
            statusCode: 400,
            clientMessage: "Weight must be an integer between 100 and 900.",
          }),
        ),
      );
    }

    const uploadsDir = "./uploads/fonts";
    if (!existsSync(uploadsDir)) {
      yield* $(
        Effect.tryPromise({
          try: () => mkdir(uploadsDir, { recursive: true }),
          catch: () =>
            new ServerError({
              tag: "FailedToCreateFontUploadsDir",
              statusCode: 500,
              clientMessage: "Failed to prepare font storage",
            }),
        }),
      );
    }

    const fileId = v7();
    const filenameOnDisk = `${slugify(familyName)}-${weight}-${style}-${fileId}.${ext}`;
    const filePath = `${uploadsDir}/${filenameOnDisk}`;

    yield* $(
      Effect.tryPromise({
        try: () => writeFile(filePath, Buffer.from(buffer)),
        catch: () =>
          new ServerError({
            tag: "FailedToSaveFontFile",
            statusCode: 500,
            clientMessage: "Failed to save font file",
          }),
      }),
    );

    return {
      fileUrl: `/uploads/fonts/${filenameOnDisk}`,
      format,
    };
  });
};

/** Best-effort delete of the on-disk font file — a missing file is not an error, the DB row is the source of truth. */
export async function deleteFontFileFromDisk(fileUrl: string): Promise<void> {
  try {
    const bare = fileUrl.replace(/^\/?uploads\//, "");
    const filePath = `./uploads/${bare}`;
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  } catch {
    // Non-fatal — the DB row is what the app actually reads from.
  }
}
