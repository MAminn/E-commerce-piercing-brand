import { describe, expect, it } from "vitest";
import { FBC_STORAGE_KEY, readFbcHint, rememberFbclid } from "#root/frontend/tracking/fbc-hint";
import { FBC_MAX_AGE_MS } from "#root/shared/tracking/fbc-hint";

const NOW = Date.UTC(2026, 10, 15, 10, 0, 0);

function memStore(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    map: m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
const throwing = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
  removeItem: () => {
    throw new Error("denied");
  },
};

describe("perce_fbc store (META_FBC_FALLBACK, browser)", () => {
  it("a valid ?fbclid= is stored with its first-seen time; the hint is Meta's fbc format", () => {
    const s = memStore();
    expect(rememberFbclid(s, "?utm_source=fb&fbclid=IwAR_1", NOW)).toEqual({ fbclid: "IwAR_1", firstSeenMs: NOW });
    expect(JSON.parse(s.map.get(FBC_STORAGE_KEY)!)).toEqual({ fbclid: "IwAR_1", firstSeenMs: NOW });
    expect(readFbcHint(s, NOW + 1000)).toBe(`fb.1.${NOW}.IwAR_1`);
  });

  it("same fbclid again keeps the original firstSeenMs; a new fbclid replaces it", () => {
    const s = memStore();
    rememberFbclid(s, "?fbclid=A", NOW);
    rememberFbclid(s, "?fbclid=A", NOW + 3600_000);
    expect(readFbcHint(s, NOW + 3600_000)).toBe(`fb.1.${NOW}.A`);
    rememberFbclid(s, "?fbclid=B", NOW + 7200_000);
    expect(readFbcHint(s, NOW + 7200_000)).toBe(`fb.1.${NOW + 7200_000}.B`);
  });

  it("pages without fbclid, or with an invalid one, leave the store unchanged", () => {
    const s = memStore();
    rememberFbclid(s, "?fbclid=A", NOW);
    for (const search of ["", "?x=1", "?fbclid=", "?fbclid=a%20b", `?fbclid=${"a".repeat(501)}`]) {
      expect(rememberFbclid(s, search, NOW + 1)).toBeNull();
    }
    expect(readFbcHint(s, NOW + 2)).toBe(`fb.1.${NOW}.A`);
  });

  it("an entry older than 90 days is deleted and yields no hint", () => {
    const s = memStore();
    rememberFbclid(s, "?fbclid=OLD", NOW);
    expect(readFbcHint(s, NOW + FBC_MAX_AGE_MS + 1)).toBeUndefined();
    expect(s.map.has(FBC_STORAGE_KEY)).toBe(false);
  });

  it("a malformed stored value is removed; no hint", () => {
    for (const raw of ["not json", '{"fbclid":"a b","firstSeenMs":1}', '{"fbclid":"A"}', '{"fbclid":"A","firstSeenMs":-5}']) {
      const s = memStore({ [FBC_STORAGE_KEY]: raw });
      expect(readFbcHint(s, NOW)).toBeUndefined();
      expect(s.map.has(FBC_STORAGE_KEY)).toBe(false);
    }
  });

  it("storage that throws or is missing never throws", () => {
    expect(rememberFbclid(throwing, "?fbclid=A", NOW)).toBeNull();
    expect(readFbcHint(throwing, NOW)).toBeUndefined();
    expect(rememberFbclid(null, "?fbclid=A", NOW)).toBeNull();
    expect(readFbcHint(undefined, NOW)).toBeUndefined();
  });
});
