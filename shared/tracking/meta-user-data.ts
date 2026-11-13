/**
 * Meta customer-information normalisation, shared by the browser pixel
 * (manual advanced matching) and the server (Conversions API user_data).
 * https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 *
 * Both sides must hash byte-identical strings, so the rules live here once.
 * Every normaliser returns null for input that cannot produce a valid value:
 * an invalid field is left out, never sent half-normalised.
 *
 * IP address, user agent, fbp and fbc are NOT handled here — Meta requires
 * those unhashed.
 *
 * Nothing in this module logs, stores or returns raw values beyond the
 * caller's own scope. Hashing: server → backend/pixel-tracking/meta-user-data.ts
 * (node:crypto); browser → sha256HexWeb below (Web Crypto).
 */

/** The hashed keys Meta accepts and this codebase produces. */
export type MetaHashedKey = "em" | "ph" | "fn" | "ln" | "ct" | "st" | "zp" | "country" | "external_id";

/** Meta user_data fields, every value lowercase SHA-256 hex. */
export type HashedMetaUserData = Partial<Record<MetaHashedKey, string>>;

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** True for a lowercase SHA-256 hex digest. */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

/** Trim + lowercase; must look like an address. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/**
 * Egyptian phone → E.164 digits without "+" (Meta's `ph` format):
 *   01xxxxxxxxx           → 201xxxxxxxxx   (mobile, local format)
 *   1xxxxxxxxx            → 201xxxxxxxxx   (mobile, leading 0 dropped)
 *   +20… / 0020… / 20…    → 20…
 *   0Axxxxxxx(x)          → 20Axxxxxxx(x)  (landline, e.g. 02 Cairo)
 * Arabic-Indic digits are accepted. The result must be 20 + 9–10 digits.
 */
export function normalizeEgyptPhone(raw: string | null | undefined): string | null {
  let d = toAsciiDigits(raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0020")) d = d.slice(2);
  else if (d.startsWith("20") && d.length >= 11) {
    /* already international */
  } else if (d.startsWith("0")) d = `20${d.slice(1)}`;
  else if (/^1[0125]\d{8}$/.test(d)) d = `20${d}`;
  return /^20\d{9,10}$/.test(d) ? d : null;
}

function toAsciiDigits(s: string): string {
  // Arabic-Indic (U+0660–0669) and Eastern Arabic-Indic (U+06F0–06F9).
  return s.replace(/[٠-٩۰-۹]/g, (c) => {
    const code = c.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Lowercase, Unicode-normalised, without spaces, punctuation or symbols. */
function compact(raw: string | null | undefined): string | null {
  const v = (raw ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
  return v || null;
}

/** First token of a full name → fn; the rest → ln. */
export function splitName(fullName: string | null | undefined): { fn: string | null; ln: string | null } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { fn: null, ln: null };
  return { fn: compact(parts[0]), ln: parts.length > 1 ? compact(parts.slice(1).join(" ")) : null };
}

export const normalizeCity = compact;
export const normalizeState = compact;

export function normalizeZip(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return v && /^[a-z0-9-]+$/.test(v) ? v : null;
}

/** ISO 3166-1 alpha-2, lowercase. The store ships to Egypt only. */
export function normalizeCountry(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "eg" || v === "egy" || v === "egypt" || v === "مصر") return "eg";
  return /^[a-z]{2}$/.test(v) ? v : null;
}

/**
 * `external_id` source: our first-party, random, PII-free browser id
 * (localStorage `tracking_session_id`, see shared/utils/session-id.ts) — the
 * same value every event already carries as `sessionId`.
 */
export function normalizeExternalId(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v || null;
}

/** Customer fields a caller may hold (an order row, a signed-in account). */
export interface MetaIdentityInput {
  email?: string | null;
  phone?: string | null;
  /** Full name — split into fn / ln. */
  name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  /** The tracking session id (becomes external_id). */
  externalId?: string | null;
}

/** Normalised, NOT yet hashed. Keep it inside the hashing function's scope. */
export function normalizeMetaIdentity(input: MetaIdentityInput): Partial<Record<MetaHashedKey, string>> {
  const { fn, ln } = splitName(input.name);
  const fields: Record<MetaHashedKey, string | null> = {
    em: normalizeEmail(input.email),
    ph: normalizeEgyptPhone(input.phone),
    fn,
    ln,
    ct: normalizeCity(input.city),
    st: normalizeState(input.state),
    zp: normalizeZip(input.zip),
    country: normalizeCountry(input.country),
    external_id: normalizeExternalId(input.externalId),
  };
  const out: Partial<Record<MetaHashedKey, string>> = {};
  for (const [key, value] of Object.entries(fields) as Array<[MetaHashedKey, string | null]>) {
    if (value) out[key] = value;
  }
  return out;
}

/** SHA-256 hex via Web Crypto (browser secure contexts, Node ≥ 19). Null if unavailable. */
export async function sha256HexWeb(value: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Browser-side: normalise + hash with Web Crypto. Returns only digests; a
 * field whose hash cannot be computed is dropped (never sent raw).
 */
export async function hashMetaIdentityWeb(input: MetaIdentityInput): Promise<HashedMetaUserData> {
  const normalized = normalizeMetaIdentity(input);
  const out: HashedMetaUserData = {};
  for (const [key, value] of Object.entries(normalized) as Array<[MetaHashedKey, string]>) {
    const digest = await sha256HexWeb(value);
    if (digest) out[key] = digest;
  }
  return out;
}
