import { CANONICAL_STATUSES, type CanonicalStatus } from "./types";

/**
 * Pure normalisers for ABS data and the website's free-text order fields.
 * No I/O, no logging.
 */

const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_STATUSES);

/** Arabic-Indic (U+0660–0669) and Eastern Arabic-Indic (U+06F0–06F9) digits → ASCII. */
function asciiDigits(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else out += ch;
  }
  return out;
}

/**
 * Egyptian mobile → national 10 digits without the leading 0
 * (`+20 100 123 4567`, `01001234567`, `201001234567`, `00201001234567`
 * → `1001234567`). Anything that is not a 10-digit number starting with 1
 * after removing the country code / trunk 0 → null. The operator digit is
 * not checked so a mistyped second digit can still be fuzzy-matched.
 */
export function normalizeEgyptPhone(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let digits = asciiDigits(String(raw)).replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = digits.slice(4);
  else if (digits.startsWith("20") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return /^1\d{9}$/.test(digits) ? digits : null;
}

/** Last 4 digits of any phone-like value (for logs and admin views), or null. */
export function phoneLast4(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const digits = asciiDigits(String(raw)).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** ABS lastEventCode → canonical status (only the codes we know). */
const EVENT_CODES: Record<string, CanonicalStatus> = {
  SHP_DLVD: "DELIVERED",
  SHP_DLVD_RVRT: "DELIVERY_REVERTED",
  SHP_PRTL_DLVD: "PARTIALLY_DELIVERED",
  SHP_RTN_SHPR: "RETURNED_TO_SHIPPER",
  SHP_HOLD: "HOLD_DECISION",
  SHP_UNDLVD: "UNDELIVERED",
};

/** Event codes that override whatever the status column says. */
const OVERRIDING_EVENT_CODES: ReadonlySet<CanonicalStatus> = new Set(["PARTIALLY_DELIVERED", "DELIVERY_REVERTED"]);

/** Spelling variants seen or plausible in display text, after upper-snake-casing. */
const ALIASES: Record<string, CanonicalStatus> = {
  CANCELLED: "CANCELED",
  RE_OPERATE: "REOPERATE",
  RETURNED_TO_SENDER: "RETURNED_TO_SHIPPER",
  PARTIAL_DELIVERED: "PARTIALLY_DELIVERED",
  PARTIAL_DELIVERY: "PARTIALLY_DELIVERED",
  DELIVERED_REVERTED: "DELIVERY_REVERTED",
  ON_HOLD: "HOLD_DECISION",
  HOLD: "HOLD_DECISION",
};

function toKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fromText(raw: string | null | undefined): CanonicalStatus | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const key = toKey(raw);
  if (key !== "UNKNOWN" && CANONICAL_SET.has(key)) return key as CanonicalStatus;
  if (ALIASES[key]) return ALIASES[key];
  if (EVENT_CODES[key]) return EVENT_CODES[key];
  return null;
}

/**
 * Enum (`OUT_FOR_DELIVERY`), display text (`Out for Delivery`) or event code
 * (`SHP_DLVD`) → one canonical status. `lastEventCode` wins only for the
 * partial-delivery / delivery-reverted codes (the status column may still say
 * "Delivered" for those) and fills in when the status itself is unrecognised.
 * Anything else → UNKNOWN, which the rule engine never acts on.
 */
export function canonicalStatus(raw: string | null | undefined, lastEventCode?: string | null): CanonicalStatus {
  const fromCode = typeof lastEventCode === "string" ? (EVENT_CODES[toKey(lastEventCode)] ?? null) : null;
  if (fromCode && OVERRIDING_EVENT_CODES.has(fromCode)) return fromCode;
  return fromText(raw) ?? fromCode ?? "UNKNOWN";
}

/**
 * Money from ABS / Postgres numeric: number or numeric string (`"350"`,
 * `"350.00"`, `"1,250.5"`, `"EGP 350"`). Non-finite / empty → null.
 */
export function parseMoney(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : null;
  if (typeof raw !== "string") return null;
  const cleaned = asciiDigits(raw).replace(/[,\s]/g, "").replace(/^[A-Za-z£$]+/, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * ABS date → Date. ISO strings with an offset (or `Z`) are taken as given;
 * an ISO date-time WITHOUT an offset is read as Africa/Cairo wall time
 * (requests are made with `timezone: "Africa/Cairo"`). Invalid → null.
 */
export function parseAbsDate(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const v = raw.trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(v) && /^\d{4}-\d{2}-\d{2}[T ]/.test(v)) {
    const d = new Date(v.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", ms = "0"] = m;
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(ms.padEnd(3, "0")));
  if (Number.isNaN(asUtc)) return null;
  return new Date(asUtc - cairoOffsetMinutes(new Date(asUtc)) * 60_000);
}

/** Africa/Cairo UTC offset in minutes at an instant (+120 / +180 with DST). */
export function cairoOffsetMinutes(at: Date): number {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part ?? "");
    if (!m) return 120;
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3]));
  } catch {
    return 120;
  }
}

/** ISO 8601 in Africa/Cairo local time with its offset, e.g. `2026-11-18T14:05:00.000+02:00`. */
export function toCairoIso(at: Date): string {
  const offset = cairoOffsetMinutes(at);
  const local = new Date(at.getTime() + offset * 60_000).toISOString().slice(0, -1);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Website order numbers mentioned in an ABS Reference (`#10175`, `10175`,
 * `Order 10175 / Percé`). Runs of 5–8 digits only, so a phone number or a
 * short piece count is not taken for an order number.
 */
export function orderNumbersInReference(reference: string | null | undefined): number[] {
  if (typeof reference !== "string") return [];
  const found = new Set<number>();
  for (const m of asciiDigits(reference).matchAll(/(?<!\d)#?(\d{5,8})(?!\d)/g)) {
    found.add(Number(m[1]));
  }
  return [...found];
}
