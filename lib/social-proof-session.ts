/**
 * Per-tab state and copy helpers for the storefront social-proof toast
 * (ported from the Mach template).
 *
 * Everything here is `sessionStorage`, never `localStorage`. The toast is a
 * "while you're browsing" signal, not a decision the visitor makes once — a
 * dismissal should quiet it for this tab and be forgotten when the tab closes,
 * which is exactly sessionStorage's lifetime. (Contrast the Entry Popup, which
 * genuinely persists a dismissal for days in localStorage; the two features
 * deliberately share no keys and no storage.)
 *
 * Both helpers below tolerate storage being missing or throwing. Safari's
 * private mode and hardened browser settings make `sessionStorage` access
 * raise rather than return null, and a decorative toast must never be the
 * thing that breaks a storefront page.
 */

const SUPPRESSED_KEY = "perce-social-proof-suppressed";
const SHOWN_COUNT_KEY = "perce-social-proof-shown";
const SHOWN_NAMES_KEY = "perce-social-proof-shown-names";

export const SOCIAL_PROOF_KEYS = {
  suppressed: SUPPRESSED_KEY,
  shownCount: SHOWN_COUNT_KEY,
  shownNames: SHOWN_NAMES_KEY,
} as const;

/** Stable comparison form for the privacy-safe displayed first name. */
export function displayedNameKey(displayName: string): string {
  return displayName
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function readShownNameKeys(storage: SocialProofStorage | null): string[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SHOWN_NAMES_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

export function rememberShownName(
  storage: SocialProofStorage | null,
  displayName: string,
): void {
  if (!storage) return;
  try {
    const key = displayedNameKey(displayName);
    if (!key) return;
    const keys = new Set(readShownNameKeys(storage));
    keys.add(key);
    storage.setItem(SHOWN_NAMES_KEY, JSON.stringify([...keys]));
  } catch {
    /* storage unavailable — the in-memory queue is still name-unique */
  }
}

/** The slice of the Storage API these helpers use. */
export interface SocialProofStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Resolves the browser's sessionStorage, or null during SSR / when the
 * browser refuses access.
 */
export function getSocialProofStorage(): SocialProofStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** True once the visitor has closed a toast in this tab. */
export function isSocialProofSuppressed(
  storage: SocialProofStorage | null,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SUPPRESSED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Silences the toast for the rest of this tab's life. Closing one card is
 * read as "not interested in these", not "not interested in that one" —
 * re-offering the next event three seconds later would be the annoying
 * behaviour this is here to avoid. A new tab starts clean.
 */
export function suppressSocialProof(storage: SocialProofStorage | null): void {
  if (!storage) return;
  try {
    storage.setItem(SUPPRESSED_KEY, "true");
  } catch {
    /* storage unavailable — the in-memory dismissal still holds for this page */
  }
}

/**
 * How many toasts this tab has already shown.
 *
 * Persisted rather than held in component state so an ordinary click through
 * to a product page doesn't hand the visitor a fresh allowance of five —
 * the cap is per session, and browsing is what a session is made of.
 */
export function readShownCount(storage: SocialProofStorage | null): number {
  if (!storage) return 0;
  try {
    const parsed = Number.parseInt(storage.getItem(SHOWN_COUNT_KEY) ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function writeShownCount(
  storage: SocialProofStorage | null,
  count: number,
): void {
  if (!storage) return;
  try {
    storage.setItem(SHOWN_COUNT_KEY, String(Math.max(0, Math.trunc(count))));
  } catch {
    /* storage unavailable — the cap still holds within this page view */
  }
}

/**
 * The relative-time bucket for an order, independent of language.
 *
 * Percé adaptation: Mach's storefront is English-only, Percé's is English and
 * Arabic, so the bucketing (which is the part with rules worth testing) is
 * split from the wording. The toast turns a bucket into copy through the
 * storefront's translation table; `formatRelativeTime` below is the English
 * rendering, kept identical to Mach's.
 *
 * Future timestamps (a clock skewed between server and browser) collapse to
 * "now" rather than rendering a negative age. An unparseable timestamp
 * yields null, which callers render as no time row at all.
 */
export type RelativeTimeBucket =
  | { unit: "now" }
  | { unit: "minute" | "hour" | "day"; count: number };

export function relativeTimeBucket(
  occurredAt: Date | string | number,
  now: number = Date.now(),
): RelativeTimeBucket | null {
  const then = new Date(occurredAt).getTime();
  if (!Number.isFinite(then)) return null;

  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return { unit: "now" };

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { unit: "minute", count: minutes };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hour", count: hours };

  return { unit: "day", count: Math.floor(hours / 24) };
}

/**
 * "Just now" / "4 min ago" / "2 hr ago" / "1 day ago".
 *
 * Hand-rolled rather than pulled from date-fns: the toast needs four buckets
 * of deliberately terse copy, and `formatDistanceToNow` produces neither the
 * abbreviations ("min", "hr") nor the sub-minute case this design calls for.
 */
export function formatRelativeTime(
  occurredAt: Date | string | number,
  now: number = Date.now(),
): string {
  const bucket = relativeTimeBucket(occurredAt, now);
  if (!bucket) return "";
  switch (bucket.unit) {
    case "now":
      return "Just now";
    case "minute":
      return `${bucket.count} min ago`;
    case "hour":
      return `${bucket.count} hr ago`;
    case "day":
      return bucket.count === 1 ? "1 day ago" : `${bucket.count} days ago`;
  }
}
