import { describe, expect, it } from "vitest";
import { acceptFbcHint, buildFbcHint, FBC_HINT_MAX_FUTURE_MS, FBC_MAX_AGE_MS } from "#root/shared/tracking/fbc-hint";

const NOW = Date.UTC(2026, 10, 15, 10, 0, 0);

describe("acceptFbcHint — server-side validation of the browser's fbcHint", () => {
  it("accepts Meta's fb.1.<13-digit ms>.<fbclid> within the window", () => {
    const hint = buildFbcHint("IwAR_x-1.y", NOW - 60_000);
    expect(hint).toBe(`fb.1.${NOW - 60_000}.IwAR_x-1.y`);
    expect(acceptFbcHint(hint, NOW)).toBe(hint);
  });

  it("rejects malformed values", () => {
    for (const bad of [
      undefined,
      null,
      42,
      "",
      "fb.2.1731600000000.X", // wrong version
      "fb.1.173160000000.X", // 12 digits
      "fb.1.17316000000000.X", // 14 digits
      "fb.1.1731600000000.", // empty fbclid
      "fb.1.1731600000000.a b", // space
      "fb.1.1731600000000.a%20b",
      " fb.1.1731600000000.X",
      `fb.1.1731600000000.${"a".repeat(501)}`,
    ]) {
      expect(acceptFbcHint(bad, NOW)).toBeNull();
    }
  });

  it("future timestamps: up to 5 minutes of skew accepted, beyond rejected", () => {
    expect(acceptFbcHint(buildFbcHint("X", NOW + FBC_HINT_MAX_FUTURE_MS), NOW)).not.toBeNull();
    expect(acceptFbcHint(buildFbcHint("X", NOW + FBC_HINT_MAX_FUTURE_MS + 1), NOW)).toBeNull();
  });

  it("stale timestamps: older than 90 days rejected", () => {
    expect(acceptFbcHint(buildFbcHint("X", NOW - FBC_MAX_AGE_MS), NOW)).not.toBeNull();
    expect(acceptFbcHint(buildFbcHint("X", NOW - FBC_MAX_AGE_MS - 1), NOW)).toBeNull();
  });
});
