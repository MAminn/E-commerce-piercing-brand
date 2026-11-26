/**
 * The exact words of the WhatsApp acknowledgment at checkout, one entry per
 * version. Checkout renders the CURRENT version from here, and the server
 * stores the text of the version the shopper's browser reports. So the
 * consent evidence (wa_checkout_consent.consent_text) is word-for-word the
 * sentence the shopper ticked, and never text sent by the client.
 *
 * Never edit a published version in place. A wording change is a new
 * version: add it, point CURRENT at it, and leave the old entries alone,
 * because orders placed under them reference them.
 */
export type ConsentLocale = "en" | "ar";

export const WHATSAPP_CONSENT_TEXTS = {
  /** The optional "opt-in" box (Nov 2026, before checkout-v2). */
  "checkout-v1": {
    en: "Send my order confirmation and updates to this number on WhatsApp",
    ar: "أوافق على استلام تأكيد وتحديثات طلبي على واتساب على هذا الرقم",
  },
  /** Required acknowledgment for cash-on-delivery orders. */
  "checkout-v2": {
    en: "I agree that Percé will send my order confirmation and order-related updates by WhatsApp to the phone number above. Reply STOP at any time to stop these messages.",
    ar: "أوافق على أن ترسل Percé تأكيد طلبي والتحديثات الخاصة به عبر واتساب إلى رقم الهاتف أعلاه. يمكنك إيقاف هذه الرسائل في أي وقت بالرد بكلمة «إيقاف».",
  },
} as const satisfies Record<string, Record<ConsentLocale, string>>;

export type WhatsAppConsentVersion = keyof typeof WHATSAPP_CONSENT_TEXTS;

export const CURRENT_WHATSAPP_CONSENT_VERSION: WhatsAppConsentVersion = "checkout-v2";

/** The version a client that sends no version saw: the old optional box. */
export const LEGACY_WHATSAPP_CONSENT_VERSION: WhatsAppConsentVersion = "checkout-v1";

export function isWhatsAppConsentVersion(v: unknown): v is WhatsAppConsentVersion {
  return typeof v === "string" && Object.hasOwn(WHATSAPP_CONSENT_TEXTS, v);
}

export function whatsappConsentText(version: WhatsAppConsentVersion, locale: ConsentLocale): string {
  return WHATSAPP_CONSENT_TEXTS[version][locale === "ar" ? "ar" : "en"];
}

/**
 * The server's refusal when a COD order that must carry the acknowledgment
 * arrives without it. Checkout recognises this exact text, shows the box
 * and points the shopper at it. A browser still running the old build also
 * shows this message next to its (then optional) box, which works the same.
 */
export const WHATSAPP_CONSENT_REQUIRED_MESSAGE =
  "Please tick the box agreeing to receive your order confirmation on WhatsApp to place a cash-on-delivery order.";

export function isWhatsAppConsentRequiredError(message: string | null | undefined): boolean {
  return typeof message === "string" && message.includes(WHATSAPP_CONSENT_REQUIRED_MESSAGE);
}
