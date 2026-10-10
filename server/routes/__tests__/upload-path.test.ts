import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveUploadPath } from "../upload-path";

const root = path.resolve("/app/uploads");

describe("resolveUploadPath", () => {
  it.each([
    "placeholder-product.png",
    "01a1254f-282c-74fe-8a4c-3e11bcc368fa.webp",
    "homepage/hero-video-01a12539-f8be-710f-b360-547ef6720e23.mp4",
    "fonts/brand-sans-400.woff2",
  ])("serves %s from inside uploads/", (requested) => {
    expect(resolveUploadPath(root, requested)).toBe(path.join(root, requested));
  });

  it.each([
    "../.env",
    "../../proc/self/environ",
    "homepage/../../package.json",
    "..\\package.json",
    "homepage\\..\\..\\.env",
    "/etc/passwd",
    "..",
    "",
    "a.png\0.txt",
  ])("refuses %j", (requested) => {
    expect(resolveUploadPath(root, requested)).toBeNull();
  });

  it("refuses dot-files, including in-flight hero video uploads", () => {
    expect(resolveUploadPath(root, ".env")).toBeNull();
    expect(resolveUploadPath(root, "homepage/.upload-01a1.tmp")).toBeNull();
  });
});
