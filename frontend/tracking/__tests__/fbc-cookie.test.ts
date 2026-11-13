import { describe, expect, it } from "vitest";
import { buildFbcValue, ensureFbcCookie, FBC_MAX_AGE_SECONDS, readCookie } from "../fbc-cookie";

const doc = (cookie = "") => {
  const writes: string[] = [];
  return {
    writes,
    get cookie() {
      return cookie;
    },
    set cookie(v: string) {
      writes.push(v);
    },
  };
};
const loc = (search: string, protocol = "https:") => ({ search, protocol });

describe("first-party _fbc from ?fbclid=", () => {
  it("writes Meta's format fb.1.<ms>.<fbclid>, 90 days, Lax, Secure on https", () => {
    const d = doc();
    expect(ensureFbcCookie(d, loc("?fbclid=IwAR0abc&utm_source=fb"), 1731500000000)).toBe("fb.1.1731500000000.IwAR0abc");
    expect(d.writes).toEqual([`_fbc=fb.1.1731500000000.IwAR0abc; path=/; max-age=${FBC_MAX_AGE_SECONDS}; SameSite=Lax; Secure`]);
  });

  it("no fbclid / malformed fbclid → nothing written", () => {
    for (const s of ["", "?utm_source=fb", "?fbclid=", "?fbclid=a%3Bb%3Dc", `?fbclid=${"x".repeat(501)}`]) {
      const d = doc();
      expect(ensureFbcCookie(d, loc(s))).toBeNull();
      expect(d.writes).toEqual([]);
    }
  });

  it("same click already stored → kept (creation time included); a newer click replaces an older one", () => {
    const same = doc("_ga=1; _fbc=fb.1.1700000000000.IwAR0abc");
    expect(ensureFbcCookie(same, loc("?fbclid=IwAR0abc"))).toBeNull();
    expect(same.writes).toEqual([]);

    const older = doc("_fbc=fb.1.1700000000000.OldClick");
    expect(ensureFbcCookie(older, loc("?fbclid=NewClick"), 1731500000000)).toBe(buildFbcValue("NewClick", 1731500000000));
    expect(older.writes).toHaveLength(1);
  });

  it("readCookie parses exact names only", () => {
    const d = doc("x_fbp=no; _fbp=fb.1.2.3; _fbc=");
    expect(readCookie(d, "_fbp")).toBe("fb.1.2.3");
    expect(readCookie(d, "_fbc")).toBe("");
    expect(readCookie(d, "fbp")).toBeNull();
  });
});
