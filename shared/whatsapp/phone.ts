import { normalizeEgyptPhone } from "#root/shared/tracking/meta-user-data";

/**
 * Egyptian MOBILE number → WhatsApp recipient digits (E.164 without "+"),
 * or null. Landlines (02…, 03…) normalise fine for Meta's `ph` hash but can
 * never receive WhatsApp, so they are rejected here.
 *
 * Valid: 2010…, 2011…, 2012…, 2015… followed by 8 digits.
 */
export function toWhatsAppRecipient(raw: string | null | undefined): string | null {
  const d = normalizeEgyptPhone(raw);
  return d && /^201[0125]\d{8}$/.test(d) ? d : null;
}

/** Last 4 digits only — the only form a phone number may take in logs. */
export function redactPhone(digits: string | null | undefined): string {
  const d = (digits ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `…${d.slice(-4)}` : "…";
}
