/**
 * META_FBC_FALLBACK — first-party click-id continuity without cookies.
 *
 * Some browsers (hypothesis: a share of iOS Facebook/Instagram in-app
 * browsers) drop the `_fbc` cookie during a visit while localStorage keeps
 * working. The landing `?fbclid=` is therefore also kept in localStorage
 * ("perce_fbc" = {fbclid, firstSeenMs}) and each /api/track event carries it
 * as `fbcHint` = `fb.1.<firstSeenMs>.<fbclid>`. The server uses the hint for
 * the Conversions API copy only when the request has no `_fbc` cookie; the
 * hint is never stored (shared/tracking/fbc-hint.ts, server/routes/track.ts).
 *
 * Rules: same fbclid already stored → its firstSeenMs is kept (the click's
 * real first time, as the browser `_fbc` does); a different fbclid replaces
 * it; an entry older than 90 days is deleted. Storage access never throws.
 */
import { buildFbcHint, FBC_MAX_AGE_MS, FBCLID_RE } from "#root/shared/tracking/fbc-hint";

export const FBC_STORAGE_KEY = "perce_fbc";

export interface StoredFbc {
  fbclid: string;
  firstSeenMs: number;
}

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readStored(store: KeyValueStore): StoredFbc | null {
  let raw: string | null = null;
  try {
    raw = store.getItem(FBC_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredFbc>;
    if (
      typeof v?.fbclid === "string" &&
      FBCLID_RE.test(v.fbclid) &&
      typeof v.firstSeenMs === "number" &&
      Number.isFinite(v.firstSeenMs) &&
      v.firstSeenMs > 0
    ) {
      return { fbclid: v.fbclid, firstSeenMs: Math.trunc(v.firstSeenMs) };
    }
  } catch {
    /* malformed → treated as absent and removed below */
  }
  try {
    store.removeItem(FBC_STORAGE_KEY);
  } catch {
    /* best-effort */
  }
  return null;
}

/**
 * Record a valid `?fbclid=` from `search` (a location.search string). Returns
 * the entry now stored, or null. Never throws.
 */
export function rememberFbclid(store: KeyValueStore | null | undefined, search: string, nowMs: number = Date.now()): StoredFbc | null {
  if (!store) return null;
  let fbclid: string | null = null;
  try {
    fbclid = new URLSearchParams(search).get("fbclid");
  } catch {
    return null;
  }
  if (!fbclid || !FBCLID_RE.test(fbclid)) return null;
  const existing = readStored(store);
  if (existing && existing.fbclid === fbclid && nowMs - existing.firstSeenMs <= FBC_MAX_AGE_MS) {
    return existing;
  }
  const entry: StoredFbc = { fbclid, firstSeenMs: Math.trunc(nowMs) };
  try {
    store.setItem(FBC_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    return null;
  }
  return entry;
}

/**
 * The `fbcHint` for a beacon event: Meta's fbc value built from the stored
 * click, or undefined. An entry older than 90 days is deleted. Never throws.
 */
export function readFbcHint(store: KeyValueStore | null | undefined, nowMs: number = Date.now()): string | undefined {
  if (!store) return undefined;
  const stored = readStored(store);
  if (!stored) return undefined;
  if (nowMs - stored.firstSeenMs > FBC_MAX_AGE_MS) {
    try {
      store.removeItem(FBC_STORAGE_KEY);
    } catch {
      /* best-effort */
    }
    return undefined;
  }
  return buildFbcHint(stored.fbclid, stored.firstSeenMs);
}

/** window.localStorage, or null when it is unavailable or throws on access. */
export function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
