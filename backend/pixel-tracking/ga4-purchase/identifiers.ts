/**
 * GA4 attribution identifiers and the consent snapshot, read from the
 * shopper's first-party cookies on the `order.create` request.
 *
 * Pure and strict: a value is kept only if it has the exact shape gtag.js
 * writes. Anything else is NULL — never repaired, guessed or generated.
 */

const DIGITS = /^\d{1,20}$/;

export interface Ga4Identifiers {
  /** "<random>.<first-visit-seconds>" — the GA4 client_id. */
  clientId: string | null;
  /** GA4 session id (seconds since epoch, as gtag writes it). */
  sessionId: string | null;
  sessionNumber: number | null;
}

export interface ConsentSnapshot {
  /** null = no decision recorded (no cookie, implied default, expired). */
  analytics: boolean | null;
  marketing: boolean | null;
}

/** The cookies the order request may carry that matter here. */
export interface Ga4CookieInput {
  [name: string]: string | undefined;
}

/** Only `_ga`, `_ga_<container>` and `_tracking_consent` — nothing else is kept. */
export function pickGa4PurchaseCookies(cookies: Record<string, string | undefined> | undefined | null): Ga4CookieInput {
  const out: Ga4CookieInput = {};
  if (!cookies) return out;
  for (const [name, value] of Object.entries(cookies)) {
    if (typeof value !== "string") continue;
    if (name === "_ga" || name === "_tracking_consent" || /^_ga_[A-Z0-9]{4,20}$/i.test(name)) {
      out[name] = value;
    }
  }
  return out;
}

/** `_ga` = "GA1.<n>.<random>.<seconds>" → "<random>.<seconds>". */
export function parseGaClientId(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const parts = raw.trim().split(".");
  if (parts.length !== 4) return null;
  const [version, , random, seconds] = parts;
  if (!version?.startsWith("GA1") || !random || !seconds) return null;
  if (!DIGITS.test(random) || !DIGITS.test(seconds)) return null;
  return `${random}.${seconds}`;
}

/**
 * `_ga_<container>` session cookie, both formats gtag.js writes:
 *   GS1.1.<session_id>.<session_number>.<engaged>.<last_hit>.…
 *   GS2.1.s<session_id>$o<session_number>$g…$t…$j…
 */
export function parseGaSessionCookie(raw: string | undefined | null): { sessionId: string; sessionNumber: number | null } | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value.startsWith("GS1.")) {
    const parts = value.split(".");
    const sessionId = parts[2];
    if (!sessionId || !DIGITS.test(sessionId)) return null;
    const n = parts[3];
    return { sessionId, sessionNumber: n && DIGITS.test(n) ? Number(n) : null };
  }
  if (value.startsWith("GS2.")) {
    const body = value.split(".").slice(2).join(".");
    let sessionId: string | null = null;
    let sessionNumber: number | null = null;
    for (const token of body.split("$")) {
      const key = token.charAt(0);
      const v = token.slice(1);
      if (key === "s" && DIGITS.test(v)) sessionId = v;
      if (key === "o" && DIGITS.test(v)) sessionNumber = Number(v);
    }
    return sessionId ? { sessionId, sessionNumber } : null;
  }
  return null;
}

/** "G-ABC123XYZ" → "_ga_ABC123XYZ" (the session cookie gtag.js writes for it). */
export function gaSessionCookieName(measurementId: string | null | undefined): string | null {
  if (!measurementId) return null;
  const m = /^G-([A-Z0-9]{4,20})$/i.exec(measurementId.trim());
  return m ? `_ga_${m[1]}` : null;
}

export function readGa4Identifiers(cookies: Ga4CookieInput, measurementId: string | null | undefined): Ga4Identifiers {
  const clientId = parseGaClientId(cookies._ga);
  const sessionCookie = gaSessionCookieName(measurementId);
  const session = sessionCookie ? parseGaSessionCookie(cookies[sessionCookie]) : null;
  return {
    clientId,
    // A session without its client is meaningless to GA4 — keep neither.
    sessionId: clientId ? (session?.sessionId ?? null) : null,
    sessionNumber: clientId ? (session?.sessionNumber ?? null) : null,
  };
}

/**
 * `_tracking_consent` (frontend/contexts/ConsentContext.tsx →
 * serializeConsentCookie): {"g":1,"a":1,"m":0,"mt":"banner","ex":<ms>}.
 * Only an explicit, unexpired decision (g=1) counts; everything else is null.
 */
export function readConsentSnapshot(cookies: Ga4CookieInput, now: Date = new Date()): ConsentSnapshot {
  const unknown: ConsentSnapshot = { analytics: null, marketing: null };
  const raw = cookies._tracking_consent;
  if (!raw) return unknown;
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    /* not encoded */
  }
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    if (data.g !== 1) return unknown;
    if (typeof data.ex === "number" && data.ex < now.getTime()) return unknown;
    return { analytics: data.a === 1, marketing: data.m === 1 };
  } catch {
    return unknown;
  }
}
