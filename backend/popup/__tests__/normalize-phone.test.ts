import { describe, it, expect } from "vitest";
import { normalizePhone } from "#root/backend/popup/normalize-phone";

describe("normalizePhone", () => {
  it("normalizes +20 international format with spaces", () => {
    expect(normalizePhone("+20 100 123 4567")).toBe("201001234567");
  });

  it("normalizes local 0-prefixed format", () => {
    expect(normalizePhone("01001234567")).toBe("201001234567");
  });

  it("normalizes 00 IDD dial-out format", () => {
    expect(normalizePhone("0020 100 123 4567")).toBe("201001234567");
  });

  it("normalizes local format with dashes", () => {
    expect(normalizePhone("010-0123-4567")).toBe("201001234567");
  });

  it("treats +20, 0-prefixed, and 00-prefixed forms of the SAME number as identical — the abuse-gate collision this exists for", () => {
    const a = normalizePhone("+20 100 123 4567");
    const b = normalizePhone("01001234567");
    const c = normalizePhone("0020 100 123 4567");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("normalizes a bare 10-digit Egyptian mobile with a recognized carrier prefix (010/011/012/015)", () => {
    expect(normalizePhone("1001234567")).toBe("201001234567");
    expect(normalizePhone("1101234567")).toBe("201101234567");
    expect(normalizePhone("1201234567")).toBe("201201234567");
    expect(normalizePhone("1501234567")).toBe("201501234567");
  });

  it("does not misinterpret a non-Egyptian 10-digit number as Egyptian (no 01/1[0125] prefix match)", () => {
    // e.g. a US-shaped number with no recognizable Egyptian mobile prefix
    expect(normalizePhone("2025551234")).toBe("2025551234");
  });

  it("is idempotent — normalizing an already-normalized number returns it unchanged", () => {
    const once = normalizePhone("+20 100 123 4567");
    const twice = normalizePhone(once);
    expect(twice).toBe(once);
  });

  it("returns an empty string for empty/whitespace input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("   ")).toBe("");
  });

  it("strips all non-digit characters generically", () => {
    expect(normalizePhone("(0100) 123-4567")).toBe("201001234567");
  });
});
