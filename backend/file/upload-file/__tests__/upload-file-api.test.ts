import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { Effect } from "effect";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the DB insert is faked; validation, streaming and sharp all run for real.
const createdRows: string[] = [];
vi.mock("../createFile", () => ({
  createFile: ({ diskname }: { diskname: string }) =>
    Effect.sync(() => {
      createdRows.push(diskname);
      return { id: "01a12537-0000-7000-8000-000000000000", diskname, createdAt: new Date() };
    }),
}));

let singleShop = true;
vi.mock("#root/shared/config/app", () => ({ isSingleShopMode: () => singleShop }));

import { uploadFileApiPlugin } from "../api";
import { canUploadFiles, detectImageFormat, validateDeclaredImage } from "../validate";

// ── Fixtures ────────────────────────────────────────────────────────────────

const solid = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 120, g: 40, b: 40 } } });
const jpeg = () => solid().jpeg().toBuffer();
const png = () => solid().png().toBuffer();
const webp = () => solid().webp().toBuffer();
const gif = () => solid().gif().toBuffer();
const HTML = Buffer.from("<!doctype html><script>alert(document.cookie)</script>");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const EXE = Buffer.concat([Buffer.from("MZ\x90\x00\x03\x00\x00\x00"), Buffer.alloc(512)]);

// ── Harness ─────────────────────────────────────────────────────────────────

let app: FastifyInstance;
let uploadsDir: string;

beforeEach(async () => {
  createdRows.length = 0;
  singleShop = true;
  uploadsDir = await mkdtemp(path.join(tmpdir(), "file-upload-test-"));
  app = Fastify();
  await app.register(import("@fastify/multipart"));
  // Stand-in for authFasitfyMiddleware: the role comes from a test header.
  app.decorateRequest("clientSession", undefined);
  app.decorateRequest("db", null as never); // createFile is mocked; no DB is touched
  app.addHook("onRequest", async (req) => {
    const role = req.headers["x-test-role"];
    req.clientSession =
      typeof role === "string"
        ? ({ id: "u1", role } as unknown as typeof req.clientSession)
        : undefined;
  });
  await app.register(uploadFileApiPlugin, { uploadsDir });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await rm(uploadsDir, { recursive: true, force: true });
});

async function upload(
  file: { name: string; type: string; body: Buffer } | null,
  role: string | null = "admin",
) {
  const form = new FormData();
  if (file) form.append("file", new Blob([new Uint8Array(file.body)], { type: file.type }), file.name);
  const encoded = new Request("http://localhost/file", { method: "POST", body: form });
  const res = await app.inject({
    method: "POST",
    url: "/file",
    headers: {
      "content-type": encoded.headers.get("content-type") ?? "",
      ...(role ? { "x-test-role": role } : {}),
    },
    payload: Buffer.from(await encoded.arrayBuffer()),
  });
  return { status: res.statusCode, body: res.json() as { success: boolean; error?: string; result?: { diskname: string } } };
}

const stored = () => readdir(uploadsDir);

// ── Route ───────────────────────────────────────────────────────────────────

describe("POST /file — authentication", () => {
  it("rejects an unauthenticated upload with 401 and stores nothing", async () => {
    const res = await upload({ name: "cat.jpg", type: "image/jpeg", body: await jpeg() }, null);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(await stored()).toEqual([]);
    expect(createdRows).toEqual([]);
  });

  it("rejects a signed-in customer with 403", async () => {
    const res = await upload({ name: "cat.jpg", type: "image/jpeg", body: await jpeg() }, "user");
    expect(res.status).toBe(403);
    expect(await stored()).toEqual([]);
  });

  it("rejects a vendor in single-shop mode (production config)", async () => {
    const res = await upload({ name: "cat.jpg", type: "image/jpeg", body: await jpeg() }, "vendor");
    expect(res.status).toBe(403);
  });

  it("allows a vendor in multi-vendor mode, matching the dashboard guard", async () => {
    singleShop = false;
    const res = await upload({ name: "cat.jpg", type: "image/jpeg", body: await jpeg() }, "vendor");
    expect(res.status).toBe(200);
  });
});

describe("POST /file — expected dashboard uploads", () => {
  it.each([
    ["category image (JPEG)", "category.jpg", "image/jpeg", jpeg, /\.webp$/],
    ["bundle image (PNG)", "bundle.png", "image/png", png, /\.webp$/],
    ["category-type image (WebP)", "type.webp", "image/webp", webp, /\.webp$/],
    ["animated-capable GIF", "loop.gif", "image/gif", gif, /\.gif$/],
  ])("stores a %s as a re-encoded file", async (_label, name, type, make, ext) => {
    const res = await upload({ name, type, body: await make() }, "admin");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Response shape the callers read: result.id + result.diskname.
    const diskname = res.body.result?.diskname ?? "";
    expect(diskname).toMatch(ext);
    expect(diskname).not.toContain(name.split(".")[0]);
    expect(await stored()).toEqual([diskname]);
    expect(createdRows).toEqual([diskname]);
    // What's on disk is a real image of the advertised format.
    // Read via a buffer: sharp holding the path open blocks cleanup on Windows.
    const meta = await sharp(await readFile(path.join(uploadsDir, diskname))).metadata();
    expect(meta.format).toBe(ext.source.includes("gif") ? "gif" : "webp");
  });

  it("allows superadmins", async () => {
    const res = await upload({ name: "a.png", type: "image/png", body: await png() }, "superadmin");
    expect(res.status).toBe(200);
  });

  it("tolerates a missing MIME type when name and bytes agree", async () => {
    const res = await upload({ name: "photo.jpeg", type: "", body: await jpeg() });
    expect(res.status).toBe(200);
  });
});

describe("POST /file — disallowed types", () => {
  it.each([
    ["HTML page", "page.html", "text/html", HTML],
    ["SVG with script", "logo.svg", "image/svg+xml", SVG],
    ["Windows executable", "setup.exe", "application/x-msdownload", EXE],
    ["PHP script", "shell.php", "application/x-php", Buffer.from("<?php system($_GET['c']); ?>")],
    ["JavaScript", "app.js", "text/javascript", Buffer.from("alert(1)")],
    ["PDF", "doc.pdf", "application/pdf", Buffer.from("%PDF-1.7\n")],
    ["file with no extension", "image", "image/png", Buffer.alloc(16)],
  ])("rejects a %s with 415 and stores nothing", async (_label, name, type, body) => {
    const res = await upload({ name, type, body });
    expect(res.status).toBe(415);
    expect(res.body.success).toBe(false);
    expect(await stored()).toEqual([]);
    expect(createdRows).toEqual([]);
  });

  it("rejects a request with no file", async () => {
    const res = await upload(null);
    expect(res.status).toBe(400);
  });
});

describe("POST /file — extension / MIME / content mismatch", () => {
  it.each([
    ["HTML renamed to .jpg", "photo.jpg", "image/jpeg", HTML],
    ["executable renamed to .png", "photo.png", "image/png", EXE],
    ["SVG renamed to .png", "logo.png", "image/png", SVG],
    ["PNG bytes under a .jpg name", "photo.jpg", "image/jpeg", "png"],
  ])("rejects %s (415)", async (_label, name, type, body) => {
    const bytes = body === "png" ? await png() : (body as Buffer);
    const res = await upload({ name, type, body: bytes });
    expect(res.status).toBe(415);
    expect(await stored()).toEqual([]);
  });

  it("rejects a .jpg declared as text/html", async () => {
    const res = await upload({ name: "photo.jpg", type: "text/html", body: await jpeg() });
    expect(res.status).toBe(415);
  });

  it("rejects a .png declared as image/jpeg", async () => {
    const res = await upload({ name: "photo.png", type: "image/jpeg", body: await png() });
    expect(res.status).toBe(415);
  });

  it("rejects bytes that look like an image but don't decode", async () => {
    const truncated = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const res = await upload({ name: "broken.jpg", type: "image/jpeg", body: truncated });
    expect(res.status).toBe(415);
    expect(await stored()).toEqual([]);
  });
});

// ── Pure rules ──────────────────────────────────────────────────────────────

describe("canUploadFiles", () => {
  it("mirrors the dashboard guard", () => {
    expect(canUploadFiles("admin", true)).toBe(true);
    expect(canUploadFiles("superadmin", true)).toBe(true);
    expect(canUploadFiles("vendor", true)).toBe(false);
    expect(canUploadFiles("vendor", false)).toBe(true);
    expect(canUploadFiles("user", false)).toBe(false);
    expect(canUploadFiles(undefined, false)).toBe(false);
  });
});

describe("validateDeclaredImage / detectImageFormat", () => {
  it("accepts allowed name/MIME pairs", () => {
    expect(validateDeclaredImage("A.JPG", "image/jpeg")).toBe("jpeg");
    expect(validateDeclaredImage("a.avif", "application/octet-stream")).toBe("avif");
  });

  it("rejects double extensions ending in a script type", () => {
    expect(() => validateDeclaredImage("photo.jpg.html", "image/jpeg")).toThrow();
  });

  it("identifies AVIF by its ftyp brand", () => {
    const avif = Buffer.concat([
      Buffer.from([0, 0, 0, 0x1c]),
      Buffer.from("ftypavif"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("avifmif1miaf"),
    ]);
    expect(detectImageFormat(avif)).toBe("avif");
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypisom"), Buffer.alloc(8)]);
    expect(detectImageFormat(mp4)).toBeNull();
  });
});
