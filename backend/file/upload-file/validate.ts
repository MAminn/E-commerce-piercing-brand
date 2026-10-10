/**
 * Rules for POST /file — the dashboard's generic image upload (category
 * images, bundle images, the category-type image field). Kept free of
 * Fastify/DB imports so the rules can be unit-tested directly.
 */

/** Matches the largest limit any caller enforces client-side (FileUploadInput: 20MB). */
export const FILE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export const FILE_UPLOAD_IMAGE_FORMATS = {
  jpeg: { extensions: ["jpg", "jpeg"], mimeTypes: ["image/jpeg", "image/jpg", "image/pjpeg"] },
  png: { extensions: ["png"], mimeTypes: ["image/png"] },
  webp: { extensions: ["webp"], mimeTypes: ["image/webp"] },
  gif: { extensions: ["gif"], mimeTypes: ["image/gif"] },
  avif: { extensions: ["avif"], mimeTypes: ["image/avif"] },
} as const;

export type FileUploadImageFormat = keyof typeof FILE_UPLOAD_IMAGE_FORMATS;
export class FileUploadError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 401 | 403 | 413 | 415 | 500,
  ) {
    super(message);
    this.name = "FileUploadError";
  }
}

const INVALID_TYPE_MESSAGE = "Invalid file type. Only JPG, PNG, WebP, GIF and AVIF images are allowed.";

/**
 * Who may upload through /file. Mirrors the dashboard route guard
 * (pages/dashboard/+guard.ts), since every caller is a dashboard page:
 * admins and superadmins always; vendors only in multi-vendor mode.
 */
export function canUploadFiles(role: string | undefined, singleShopMode: boolean): boolean {
  if (role === "admin" || role === "superadmin") return true;
  return !singleShopMode && role === "vendor";
}

function formatFromExtension(filename: string): FileUploadImageFormat | null {
  if (!filename.includes(".")) return null;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  for (const [format, spec] of Object.entries(FILE_UPLOAD_IMAGE_FORMATS)) {
    if ((spec.extensions as readonly string[]).includes(ext)) return format as FileUploadImageFormat;
  }
  return null;
}

function formatFromMime(mimeType: string): FileUploadImageFormat | null {
  for (const [format, spec] of Object.entries(FILE_UPLOAD_IMAGE_FORMATS)) {
    if ((spec.mimeTypes as readonly string[]).includes(mimeType)) return format as FileUploadImageFormat;
  }
  return null;
}

/**
 * Checks the declared filename and MIME type before anything is written.
 * The extension must be an allowed image type, and a specific MIME type must
 * agree with it. A missing or generic MIME type (some OS/browser pairs send
 * application/octet-stream for .avif) is tolerated because the file's own
 * bytes are checked next — see detectImageFormat.
 */
export function validateDeclaredImage(filename: string, mimeType: string): FileUploadImageFormat {
  const byExtension = formatFromExtension(filename);
  if (!byExtension) throw new FileUploadError(INVALID_TYPE_MESSAGE, 415);

  const mime = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (mime && mime !== "application/octet-stream" && formatFromMime(mime) !== byExtension) {
    throw new FileUploadError(INVALID_TYPE_MESSAGE, 415);
  }
  return byExtension;
}

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/** Identifies an allowed image from its leading bytes, ignoring what the client claimed. */
export function detectImageFormat(head: Uint8Array): FileUploadImageFormat | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (
    head.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => head[i] === b)
  ) {
    return "png";
  }
  if (head.length >= 6 && /^GIF8[79]a$/.test(ascii(head, 0, 6))) return "gif";
  if (head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "webp";
  // AVIF: ISO-BMFF ftyp box whose major or compatible brands include avif/avis.
  if (head.length >= 12 && ascii(head, 4, 8) === "ftyp") {
    const boxSize = (((head[0] ?? 0) << 24) | ((head[1] ?? 0) << 16) | ((head[2] ?? 0) << 8) | (head[3] ?? 0)) >>> 0;
    const end = Math.min(boxSize, head.length);
    const brands = [ascii(head, 8, 12)];
    for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(head, i, i + 4));
    if (brands.includes("avif") || brands.includes("avis")) return "avif";
  }
  return null;
}

/** The file's bytes must be the format its name and MIME type claimed. */
export function assertContentMatches(declared: FileUploadImageFormat, head: Uint8Array): FileUploadImageFormat {
  const detected = detectImageFormat(head);
  if (!detected || detected !== declared) {
    throw new FileUploadError("This file isn't a valid image of the type its name claims.", 415);
  }
  return detected;
}
