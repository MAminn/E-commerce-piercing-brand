import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HeroVideoUploadError,
  detectHeroVideoFormat,
  saveHeroVideoUpload,
  validateDeclaredHeroVideo,
} from "../index";

const bytes = (...parts: (string | number[] | Uint8Array)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : [...p])),
  );

/** ftyp box: size, "ftyp", major brand, minor version, compatible brands. */
const ftyp = (major: string, ...compatible: string[]) =>
  bytes([0, 0, 0, 16 + compatible.length * 4], "ftyp", major, [0, 0, 2, 0], ...compatible);

// Header of the real launch reel: isom / isomiso2avc1mp41.
const MP4_HEAD = bytes(ftyp("isom", "isom", "iso2", "avc1", "mp41"), [0, 0, 0, 8], "free");
// EBML header with DocType "webm" (0x4282, length 4).
const WEBM_HEAD = bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84], "webm");

describe("detectHeroVideoFormat", () => {
  it("recognises an H.264 MP4 and a WebM", () => {
    expect(detectHeroVideoFormat(MP4_HEAD)).toBe("mp4");
    expect(detectHeroVideoFormat(bytes(ftyp("mp42", "mp42", "isom")))).toBe("mp4");
    expect(detectHeroVideoFormat(WEBM_HEAD)).toBe("webm");
  });

  it("rejects QuickTime, HEIC/AVIF stills and plain Matroska", () => {
    expect(detectHeroVideoFormat(bytes(ftyp("qt  ", "qt  ")))).toBeNull();
    expect(detectHeroVideoFormat(bytes(ftyp("heic", "mif1", "heic")))).toBeNull();
    expect(detectHeroVideoFormat(bytes(ftyp("avif", "mif1", "miaf")))).toBeNull();
    expect(
      detectHeroVideoFormat(
        bytes([0x1a, 0x45, 0xdf, 0xa3, 0xa3, 0x42, 0x82, 0x88], "matroska"),
      ),
    ).toBeNull();
  });

  it("rejects executables, images and scripts", () => {
    expect(detectHeroVideoFormat(bytes("MZ", [0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]))).toBeNull();
    expect(detectHeroVideoFormat(bytes([0x7f], "ELF", [2, 1, 1, 0, 0, 0, 0, 0]))).toBeNull();
    expect(detectHeroVideoFormat(bytes([0x89], "PNG", [13, 10, 26, 10, 0, 0, 0, 13]))).toBeNull();
    expect(detectHeroVideoFormat(bytes("<script>alert(1)</script>"))).toBeNull();
    expect(detectHeroVideoFormat(new Uint8Array())).toBeNull();
  });
});

describe("validateDeclaredHeroVideo", () => {
  it("accepts matching extension and MIME type", () => {
    expect(validateDeclaredHeroVideo("reel.mp4", "video/mp4")).toBe("mp4");
    expect(validateDeclaredHeroVideo("loop.webm", "video/webm")).toBe("webm");
  });

  it("accepts a missing or generic MIME type, relying on the extension and content sniff", () => {
    expect(validateDeclaredHeroVideo("loop.webm", "")).toBe("webm");
    expect(validateDeclaredHeroVideo("reel.mp4", "application/octet-stream")).toBe("mp4");
  });

  it.each([
    ["reel.mov", "video/quicktime"],
    ["reel.mp4", "video/webm"],
    ["reel.exe", "video/mp4"],
    ["reel", "video/mp4"],
    ["reel.mp4", "text/html"],
  ])("rejects %s (%s)", (name, mime) => {
    expect(() => validateDeclaredHeroVideo(name, mime)).toThrow(HeroVideoUploadError);
  });
});

describe("saveHeroVideoUpload", () => {
  // A throwaway uploads dir, never the app's real ./uploads.
  let uploadsDir: string;
  beforeEach(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), "hero-video-test-"));
  });
  afterEach(async () => {
    await rm(uploadsDir, { recursive: true, force: true });
  });

  const homepageFiles = () => readdir(path.join(uploadsDir, "homepage")).catch(() => []);
  const body = (head: Uint8Array) =>
    Readable.from([Buffer.from(head), Buffer.alloc(4096, 0)]);

  it("stores a valid MP4 under a generated name and returns its public URL", async () => {
    const result = await saveHeroVideoUpload({
      stream: body(MP4_HEAD),
      filename: "hf_20261010_091758_launch.mp4",
      mimeType: "video/mp4",
      variant: "desktop",
      uploadsDir,
    });
    expect(result.filename).toMatch(/^hero-video-[0-9a-f-]+\.mp4$/);
    expect(result.url).toBe(`/uploads/homepage/${result.filename}`);
    expect(await homepageFiles()).toEqual([result.filename]);
  });

  it("prefixes mobile uploads separately", async () => {
    const result = await saveHeroVideoUpload({
      stream: body(WEBM_HEAD),
      filename: "loop.webm",
      mimeType: "video/webm",
      variant: "mobile",
      uploadsDir,
    });
    expect(result.filename).toMatch(/^hero-video-mobile-[0-9a-f-]+\.webm$/);
  });

  it("rejects a renamed non-video and leaves nothing on disk", async () => {
    await expect(
      saveHeroVideoUpload({
        stream: body(bytes("MZ", [0x90, 0, 3, 0])),
        filename: "reel.mp4",
        mimeType: "video/mp4",
        variant: "desktop",
        uploadsDir,
      }),
    ).rejects.toMatchObject({ statusCode: 415 });
    expect(await homepageFiles()).toEqual([]);
  });

  it("rejects a WebM disguised as MP4", async () => {
    await expect(
      saveHeroVideoUpload({
        stream: body(WEBM_HEAD),
        filename: "reel.mp4",
        mimeType: "video/mp4",
        variant: "desktop",
        uploadsDir,
      }),
    ).rejects.toMatchObject({ statusCode: 415 });
    expect(await homepageFiles()).toEqual([]);
  });

  it("maps the multipart size-limit error to 413 and removes the partial file", async () => {
    const stream = new Readable({
      read() {
        this.push(Buffer.from(MP4_HEAD));
        this.destroy(Object.assign(new Error("too large"), { code: "FST_REQ_FILE_TOO_LARGE" }));
      },
    });
    await expect(
      saveHeroVideoUpload({
        stream,
        filename: "reel.mp4",
        mimeType: "video/mp4",
        variant: "desktop",
        uploadsDir,
      }),
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(await homepageFiles()).toEqual([]);
  });

  it("rejects a disallowed type before writing anything", async () => {
    await expect(
      saveHeroVideoUpload({
        stream: body(MP4_HEAD),
        filename: "shell.php",
        mimeType: "application/x-php",
        variant: "desktop",
        uploadsDir,
      }),
    ).rejects.toMatchObject({ statusCode: 415 });
    expect(await homepageFiles()).toEqual([]);
  });
});
