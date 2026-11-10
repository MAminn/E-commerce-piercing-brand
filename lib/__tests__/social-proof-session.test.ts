import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SOCIAL_PROOF_KEYS,
  displayedNameKey,
  formatRelativeTime,
  relativeTimeBucket,
  getSocialProofStorage,
  isSocialProofSuppressed,
  readShownCount,
  readShownNameKeys,
  rememberShownName,
  suppressSocialProof,
  writeShownCount,
} from "#root/lib/social-proof-session";

type Globals = Record<string, unknown>;

function makeSessionStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    store,
  };
}

/** A browser that refuses storage access outright (Safari private mode, etc.). */
const throwingStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

describe("getSocialProofStorage", () => {
  const globals = globalThis as unknown as Globals;
  const originalWindow = globals.window;

  afterEach(() => {
    globals.window = originalWindow;
  });

  it("returns null during SSR", () => {
    globals.window = undefined;
    expect(getSocialProofStorage()).toBeNull();
  });

  it("returns sessionStorage in the browser", () => {
    const storage = makeSessionStorage();
    globals.window = { sessionStorage: storage };
    expect(getSocialProofStorage()).toBe(storage);
  });

  it("returns null rather than throwing when the browser blocks storage", () => {
    globals.window = {
      get sessionStorage() {
        throw new Error("SecurityError");
      },
    };
    expect(getSocialProofStorage()).toBeNull();
  });
});

describe("session suppression", () => {
  it("is not suppressed in a fresh session", () => {
    expect(isSocialProofSuppressed(makeSessionStorage())).toBe(false);
  });

  it("suppresses for the rest of the tab once the visitor closes a toast", () => {
    const storage = makeSessionStorage();
    suppressSocialProof(storage);

    expect(isSocialProofSuppressed(storage)).toBe(true);
    expect(storage.store.get(SOCIAL_PROOF_KEYS.suppressed)).toBe("true");
  });

  it("uses sessionStorage keys of its own — never the Entry Popup's", () => {
    // The two features must not be able to silence one another.
    expect(SOCIAL_PROOF_KEYS.suppressed).not.toContain("popup");
    expect(SOCIAL_PROOF_KEYS.shownCount).not.toContain("popup");
  });

  it("treats a new session (empty storage) as un-suppressed", () => {
    const previous = makeSessionStorage();
    suppressSocialProof(previous);
    // A new tab gets a fresh sessionStorage, so nothing carries over.
    expect(isSocialProofSuppressed(makeSessionStorage())).toBe(false);
  });

  it("degrades safely when storage is unavailable", () => {
    expect(isSocialProofSuppressed(null)).toBe(false);
    expect(() => suppressSocialProof(null)).not.toThrow();
    expect(isSocialProofSuppressed(throwingStorage)).toBe(false);
    expect(() => suppressSocialProof(throwingStorage)).not.toThrow();
  });
});

describe("session shown count", () => {
  it("starts at zero", () => {
    expect(readShownCount(makeSessionStorage())).toBe(0);
    expect(readShownCount(null)).toBe(0);
  });

  it("persists across reads, so navigation does not reset the allowance", () => {
    const storage = makeSessionStorage();
    writeShownCount(storage, 3);
    expect(readShownCount(storage)).toBe(3);
  });

  it("ignores corrupt or negative stored values", () => {
    expect(readShownCount(makeSessionStorage({ [SOCIAL_PROOF_KEYS.shownCount]: "nope" }))).toBe(0);
    expect(readShownCount(makeSessionStorage({ [SOCIAL_PROOF_KEYS.shownCount]: "-4" }))).toBe(0);
  });

  it("never writes a negative or fractional count", () => {
    const storage = makeSessionStorage();
    writeShownCount(storage, -2);
    expect(storage.store.get(SOCIAL_PROOF_KEYS.shownCount)).toBe("0");
    writeShownCount(storage, 2.7);
    expect(storage.store.get(SOCIAL_PROOF_KEYS.shownCount)).toBe("2");
  });

  it("degrades safely when storage is unavailable", () => {
    expect(readShownCount(throwingStorage)).toBe(0);
    expect(() => writeShownCount(throwingStorage, 1)).not.toThrow();
    expect(() => writeShownCount(null, 1)).not.toThrow();
  });
});

describe("session displayed names", () => {
  it("normalises spacing, case and Unicode before comparing names", () => {
    expect(displayedNameKey("  Sara  ")).toBe(displayedNameKey("sara"));
    expect(displayedNameKey("  سارة  ")).toBe("سارة");
  });

  it("remembers each displayed first name once per tab", () => {
    const storage = makeSessionStorage();
    rememberShownName(storage, "سارة");
    rememberShownName(storage, "  سارة ");
    rememberShownName(storage, "مريم");
    expect(readShownNameKeys(storage)).toEqual(["سارة", "مريم"]);
  });

  it("degrades safely for corrupt or unavailable storage", () => {
    expect(readShownNameKeys(makeSessionStorage())).toEqual([]);
    expect(readShownNameKeys(makeSessionStorage({
      [SOCIAL_PROOF_KEYS.shownNames]: "not-json",
    }))).toEqual([]);
    expect(readShownNameKeys(throwingStorage)).toEqual([]);
    expect(() => rememberShownName(throwingStorage, "نور")).not.toThrow();
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-10T12:00:00.000Z").getTime();
  const ago = (ms: number) => new Date(now - ms);

  it("reads 'Just now' under a minute", () => {
    expect(formatRelativeTime(ago(0), now)).toBe("Just now");
    expect(formatRelativeTime(ago(59_000), now)).toBe("Just now");
  });

  it("counts whole minutes up to an hour", () => {
    expect(formatRelativeTime(ago(60_000), now)).toBe("1 min ago");
    expect(formatRelativeTime(ago(4 * 60_000), now)).toBe("4 min ago");
    expect(formatRelativeTime(ago(59 * 60_000), now)).toBe("59 min ago");
  });

  it("counts whole hours up to a day", () => {
    expect(formatRelativeTime(ago(60 * 60_000), now)).toBe("1 hr ago");
    expect(formatRelativeTime(ago(2 * 60 * 60_000), now)).toBe("2 hr ago");
    expect(formatRelativeTime(ago(23 * 60 * 60_000), now)).toBe("23 hr ago");
  });

  it("counts days beyond that, singular and plural", () => {
    const day = 24 * 60 * 60_000;
    expect(formatRelativeTime(ago(day), now)).toBe("1 day ago");
    expect(formatRelativeTime(ago(3 * day), now)).toBe("3 days ago");
  });

  it("accepts a string or a number as well as a Date", () => {
    expect(formatRelativeTime(ago(5 * 60_000).toISOString(), now)).toBe("5 min ago");
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
  });

  it("collapses a future timestamp to 'Just now' rather than a negative age", () => {
    expect(formatRelativeTime(new Date(now + 60_000), now)).toBe("Just now");
  });

  it("returns an empty string for an unparseable value", () => {
    expect(formatRelativeTime("not a date", now)).toBe("");
  });
});

describe("relativeTimeBucket (Percé: language-neutral buckets)", () => {
  const now = new Date("2026-09-10T12:00:00.000Z").getTime();
  const ago = (ms: number) => new Date(now - ms);

  it("buckets exactly as the English formatter does", () => {
    expect(relativeTimeBucket(ago(30_000), now)).toEqual({ unit: "now" });
    expect(relativeTimeBucket(ago(4 * 60_000), now)).toEqual({ unit: "minute", count: 4 });
    expect(relativeTimeBucket(ago(2 * 3_600_000), now)).toEqual({ unit: "hour", count: 2 });
    expect(relativeTimeBucket(ago(3 * 86_400_000), now)).toEqual({ unit: "day", count: 3 });
  });

  it("collapses a future timestamp to now and rejects garbage", () => {
    expect(relativeTimeBucket(new Date(now + 60_000), now)).toEqual({ unit: "now" });
    expect(relativeTimeBucket("not a date", now)).toBeNull();
  });
});
