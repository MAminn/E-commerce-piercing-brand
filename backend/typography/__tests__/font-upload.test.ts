import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { uploadFontFile } from "#root/backend/typography/font-upload";

const baseInput = {
  buffer: new Uint8Array([1, 2, 3]),
  filename: "brand-sans.woff2",
  familyName: "Brand Sans",
  weight: 400,
  style: "normal" as const,
};

// Every case here is expected to fail validation before the function ever
// touches the filesystem — deliberately not testing the success path in a
// unit test, since that would write real files under ./uploads/fonts/.
describe("uploadFontFile validation", () => {
  it("rejects a file extension that isn't woff2/woff/ttf", async () => {
    const exit = await Effect.runPromiseExit(
      uploadFontFile({ ...baseInput, filename: "brand-sans.otf" }),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("rejects a filename with no extension at all", async () => {
    const exit = await Effect.runPromiseExit(
      uploadFontFile({ ...baseInput, filename: "brand-sans" }),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("rejects a file over the 2MB cap", async () => {
    const exit = await Effect.runPromiseExit(
      uploadFontFile({ ...baseInput, buffer: new Uint8Array(2 * 1024 * 1024 + 1) }),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("rejects a non-integer weight", async () => {
    const exit = await Effect.runPromiseExit(
      uploadFontFile({ ...baseInput, weight: 450.5 }),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("rejects a weight below 100", async () => {
    const exit = await Effect.runPromiseExit(uploadFontFile({ ...baseInput, weight: 50 }));
    expect(exit._tag).toBe("Failure");
  });

  it("rejects a weight above 900", async () => {
    const exit = await Effect.runPromiseExit(uploadFontFile({ ...baseInput, weight: 950 }));
    expect(exit._tag).toBe("Failure");
  });
});
