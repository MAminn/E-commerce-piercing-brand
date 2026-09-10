/**
 * Normalizes a phone number to a canonical "20" + 10-digit form for
 * abuse-gate comparison, so +20 100 123 4567, 0100 123 4567, and
 * 00201001234567 all collide as the same person. Egypt is the primary
 * audience here; numbers that don't match a recognizable Egyptian shape are
 * returned as cleaned digits only (best effort — still consistent/idempotent
 * so the same input always normalizes the same way, just not merged with
 * other formats of the same non-Egyptian number).
 */
export function normalizePhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return "";

  // "00" IDD dial-out prefix (e.g. 00201001234567) -> strip to plain CC form
  const withoutIddPrefix = digits.startsWith("00") ? digits.slice(2) : digits;

  // Already "20" + 10-digit Egyptian mobile (12 digits total)
  if (withoutIddPrefix.startsWith("20") && withoutIddPrefix.length === 12) {
    return withoutIddPrefix;
  }

  // Local Egyptian format: leading 0 + 10 digits (11 digits total)
  if (withoutIddPrefix.startsWith("0") && withoutIddPrefix.length === 11) {
    return `20${withoutIddPrefix.slice(1)}`;
  }

  // Bare 10-digit Egyptian mobile with no prefix at all, starting with a
  // recognized Egyptian mobile carrier prefix (010/011/012/015)
  if (withoutIddPrefix.length === 10 && /^1[0125]/.test(withoutIddPrefix)) {
    return `20${withoutIddPrefix}`;
  }

  return withoutIddPrefix;
}
