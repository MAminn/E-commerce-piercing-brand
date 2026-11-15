/**
 * META_FBC_FALLBACK — the `fbcHint` a beacon event may carry.
 *
 * The browser keeps the landing `?fbclid=` in localStorage
 * (frontend/tracking/fbc-hint.ts) and sends it as Meta's documented fbc
 * value, `fb.1.<first-seen ms>.<fbclid>`, on every /api/track event. The
 * server uses it for the Conversions API copy only when the request carries
 * no `_fbc` cookie, and only if it passes `acceptFbcHint` below. The hint is
 * never stored.
 * https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
 */

/** The same fbclid rule the browser applies before writing `_fbc`. */
export const FBCLID_RE = /^[\w.-]{1,500}$/;

/** Meta keeps a click id for 90 days. */
export const FBC_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** Clock skew tolerated on a hint's timestamp. */
export const FBC_HINT_MAX_FUTURE_MS = 5 * 60 * 1000;

/** Longest possible valid hint: "fb.1." + 13 digits + "." + 500 chars. */
export const FBC_HINT_MAX_LENGTH = 5 + 13 + 1 + 500;

const FBC_HINT_RE = /^fb\.1\.(\d{13})\.([\w.-]{1,500})$/;

export function buildFbcHint(fbclid: string, firstSeenMs: number): string {
  return `fb.1.${Math.trunc(firstSeenMs)}.${fbclid}`;
}

/**
 * The hint when it is well formed and its timestamp lies within
 * [now − 90 days, now + 5 minutes] of the SERVER clock; null otherwise.
 */
export function acceptFbcHint(hint: unknown, nowMs: number): string | null {
  if (typeof hint !== "string" || hint.length > FBC_HINT_MAX_LENGTH) return null;
  const m = FBC_HINT_RE.exec(hint);
  if (!m) return null;
  const ts = Number(m[1]);
  if (ts > nowMs + FBC_HINT_MAX_FUTURE_MS) return null;
  if (ts < nowMs - FBC_MAX_AGE_MS) return null;
  return hint;
}
