/**
 * First-party `_fbc` click-id cookie (META_ADVANCED_MATCHING).
 *
 * Meta's fbevents.js writes `_fbc` itself when it loads on a landing URL
 * carrying `?fbclid=` — but when fbevents.js loads late or not at all
 * (blocked, slow mobile network) the click id was lost: neither the first
 * Conversions API copy nor later pages had it. We write it in Meta's
 * documented format, only when it is absent, so /api/track can forward it.
 * https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
 */

/** 90 days, the lifetime Meta uses. */
export const FBC_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export function buildFbcValue(fbclid: string, nowMs: number): string {
  return `fb.1.${nowMs}.${fbclid}`;
}

export function readCookie(doc: Pick<Document, "cookie">, name: string): string | null {
  for (const part of doc.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function hasCookie(doc: Pick<Document, "cookie">, name: string): boolean {
  return Boolean(readCookie(doc, name));
}

export function ensureFbcCookie(
  doc: Pick<Document, "cookie">,
  loc: Pick<Location, "search" | "protocol">,
  nowMs: number = Date.now(),
): string | null {
  let fbclid: string | null = null;
  try {
    fbclid = new URLSearchParams(loc.search).get("fbclid");
  } catch {
    return null;
  }
  if (!fbclid || !/^[\w.-]{1,500}$/.test(fbclid)) return null;
  // Same click already stored (by fbevents.js or an earlier page) → keep it,
  // creation time included. A different, older click → this one replaces it.
  const existing = readCookie(doc, "_fbc");
  if (existing && existing.split(".").slice(3).join(".") === fbclid) return null;
  const value = buildFbcValue(fbclid, nowMs);
  const secure = loc.protocol === "https:" ? "; Secure" : "";
  doc.cookie = `_fbc=${value}; path=/; max-age=${FBC_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  return value;
}
