import { createWriteStream } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { v7 } from "uuid";
import {
  HERO_VIDEO_FORMATS,
  HERO_VIDEO_MAX_BYTES,
  type HeroVideoFormat,
  heroVideoFormatFromFilename,
  heroVideoFormatFromMime,
} from "#root/shared/homepage/hero-video";

export class HeroVideoUploadError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 413 | 415 | 500,
  ) {
    super(message);
    this.name = "HeroVideoUploadError";
  }
}

/**
 * ISO-BMFF brands browsers play as MP4. Checked against the major brand and
 * the compatible-brand list, so a QuickTime `.mov` renamed to `.mp4`, or an
 * HEIC/AVIF still (also ISO-BMFF), is rejected while ordinary H.264 exports
 * (`isom`, `mp42`, `avc1`, …) pass.
 */
const MP4_BRANDS = new Set([
  "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "iso7", "iso8", "iso9",
  "mp41", "mp42", "avc1", "av01", "dash", "mmp4", "M4V ", "M4VH", "M4VP",
  "MSNV", "cmfc", "cmf2",
]);

/** Bytes read from the start of the file for content sniffing. */
export const HERO_VIDEO_SNIFF_BYTES = 256;

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/**
 * Identifies a hero video from its leading bytes, ignoring whatever the
 * client claimed. Returns null for anything that isn't a playable MP4 or WebM.
 */
export function detectHeroVideoFormat(head: Uint8Array): HeroVideoFormat | null {
  // MP4: [size:4]["ftyp"][major brand:4][minor version:4][compatible brands:4n]
  if (head.length >= 12 && ascii(head, 4, 8) === "ftyp") {
    const boxSize =
      ((head[0] ?? 0) << 24) | ((head[1] ?? 0) << 16) | ((head[2] ?? 0) << 8) | (head[3] ?? 0);
    const end = Math.min(boxSize >>> 0, head.length);
    const brands = [ascii(head, 8, 12)];
    for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(head, i, i + 4));
    return brands.some((b) => MP4_BRANDS.has(b)) ? "mp4" : null;
  }

  // WebM: EBML magic, then a DocType of "webm" (plain Matroska is "matroska").
  if (
    head.length >= 4 &&
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3
  ) {
    return ascii(head, 4, Math.min(head.length, 64)).includes("webm") ? "webm" : null;
  }

  return null;
}

/**
 * Checks the declared name and MIME type before any bytes are written. The
 * MIME type may be missing or generic (some OS/browser pairs send
 * application/octet-stream for .webm); the extension may not. The file's own
 * bytes are checked against this after the upload — see saveHeroVideoUpload.
 */
export function validateDeclaredHeroVideo(filename: string, mimeType: string): HeroVideoFormat {
  const byExtension = heroVideoFormatFromFilename(filename);
  if (!byExtension) {
    throw new HeroVideoUploadError("Invalid file type. Only MP4 and WebM videos are allowed.", 415);
  }
  const mime = mimeType.toLowerCase().trim();
  if (mime && mime !== "application/octet-stream") {
    const byMime = heroVideoFormatFromMime(mime);
    if (byMime !== byExtension) {
      throw new HeroVideoUploadError("Invalid file type. Only MP4 and WebM videos are allowed.", 415);
    }
  }
  return byExtension;
}

export type HeroVideoVariant = "desktop" | "mobile";

export interface SaveHeroVideoInput {
  stream: Readable;
  filename: string;
  mimeType: string;
  variant: HeroVideoVariant;
  /** Absolute path of the app's uploads/ directory. */
  uploadsDir: string;
}

export interface SaveHeroVideoResult {
  url: string;
  filename: string;
}

/**
 * Streams an uploaded hero video to uploads/homepage/ and returns its public URL.
 *
 * The file is written under a temporary name and only renamed into place once
 * the size cap and the content sniff have both passed, so a rejected upload
 * never becomes a servable file. Videos are stored as uploaded — no
 * transcoding — under a server-generated name with the extension of the
 * detected format, never the client's filename.
 */
export async function saveHeroVideoUpload({
  stream,
  filename,
  mimeType,
  variant,
  uploadsDir,
}: SaveHeroVideoInput): Promise<SaveHeroVideoResult> {
  let declared: HeroVideoFormat;
  try {
    declared = validateDeclaredHeroVideo(filename, mimeType);
  } catch (err) {
    // Drain the unread body so the client receives the error instead of a reset.
    // The listener keeps a size-limit error on the drained stream from going unhandled.
    stream.on("error", () => {});
    stream.resume();
    throw err;
  }

  const homepageDir = path.join(uploadsDir, "homepage");
  await mkdir(homepageDir, { recursive: true });

  const fileId = v7();
  const tempPath = path.join(homepageDir, `.upload-${fileId}.tmp`);
  let moved = false;

  try {
    try {
      await pipeline(stream, createWriteStream(tempPath));
    } catch (err) {
      if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        throw tooLarge();
      }
      throw err;
    }
    // Belt and braces for multipart configs that truncate instead of throwing.
    if ((stream as Readable & { truncated?: boolean }).truncated) {
      throw tooLarge();
    }

    const head = await readHead(tempPath, HERO_VIDEO_SNIFF_BYTES);
    if (head.length === 0) {
      throw new HeroVideoUploadError("The uploaded file is empty.", 400);
    }
    const detected = detectHeroVideoFormat(head);
    if (!detected || detected !== declared) {
      throw new HeroVideoUploadError(
        "This file isn't a valid MP4 or WebM video.",
        415,
      );
    }

    const prefix = variant === "mobile" ? "hero-video-mobile" : "hero-video";
    const finalName = `${prefix}-${fileId}.${HERO_VIDEO_FORMATS[detected].extension}`;
    await rename(tempPath, path.join(homepageDir, finalName));
    moved = true;

    return { url: `/uploads/homepage/${finalName}`, filename: finalName };
  } finally {
    if (!moved) {
      await unlink(tempPath).catch(() => {});
    }
  }
}

function tooLarge() {
  return new HeroVideoUploadError(
    `File too large. Maximum size is ${HERO_VIDEO_MAX_BYTES / (1024 * 1024)}MB.`,
    413,
  );
}

async function readHead(filePath: string, bytes: number): Promise<Uint8Array> {
  const handle = await open(filePath, "r");
  try {
    const buffer = new Uint8Array(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
