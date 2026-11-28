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
  /**
   * The optional opt-in checkbox (WHATSAPP_CHECKOUT_CONSENT_REQUIRED off).
   * Also what a ticked box recorded on the branch where it was mandatory.
   */
  "checkout-v2": {
    en: "I agree that Percé will send my order confirmation and order-related updates by WhatsApp to the phone number above. Reply STOP at any time to stop these messages.",
    ar: "أوافق على أن ترسل Percé تأكيد طلبي والتحديثات الخاصة به عبر واتساب إلى رقم الهاتف أعلاه. يمكنك إيقاف هذه الرسائل في أي وقت بالرد بكلمة «إيقاف».",
  },
  /**
   * PROPOSED (pending legal review): the WhatsApp option of the REQUIRED
   * confirmation-channel choice (WHATSAPP_CHECKOUT_CONSENT_REQUIRED=true).
   * Choosing it is the shopper's explicit WhatsApp opt-in (Meta: names the
   * business, the channel, the number and the messages; says how to stop).
   * The alternative is a phone call, so the opt-in is never a condition of
   * buying. See CONFIRMATION_CHOICE_TEXT for the rest of that block.
   */
  "checkout-v3": {
    en: "On WhatsApp — I agree to receive messages from Percé on WhatsApp at the phone number above about this order: its confirmation and order updates. Reply STOP at any time to stop them.",
    ar: "عبر واتساب — أوافق على استلام رسائل من Percé عبر واتساب على رقم الهاتف أعلاه بخصوص هذا الطلب: تأكيده وتحديثاته. يمكنني إيقافها في أي وقت بالرد بكلمة «إيقاف».",
  },
} as const satisfies Record<string, Record<ConsentLocale, string>>;

/**
 * PROPOSED (pending legal review) — the required confirmation-channel block
 * shown for cash-on-delivery orders when WHATSAPP_CHECKOUT_CONSENT_REQUIRED
 * is on. Two separate things, kept apart on purpose:
 *   - legend + notice: a CONTRACTUAL order-processing notice — every COD
 *     order is confirmed before it ships. It is information, not consent.
 *   - whatsapp option (= WHATSAPP_CONSENT_TEXTS["checkout-v3"]): the
 *     recipient's explicit WhatsApp OPT-IN that Meta requires. Only choosing
 *     it records consent.
 *   - phone option: confirmation by phone call; no WhatsApp message at all.
 * Neither option is preselected; one must be chosen to place the order.
 */
export const CONFIRMATION_CHOICE_VERSION = "checkout-v3" as const;
export const CONFIRMATION_CHOICE_TEXT = {
  en: {
    legend: "Order confirmation",
    notice: "Percé confirms every cash-on-delivery order with you before it ships. Choose how we should confirm this one:",
    whatsapp: "On WhatsApp — I agree to receive messages from Percé on WhatsApp at the phone number above about this order: its confirmation and order updates. Reply STOP at any time to stop them.",
    phone: "By phone call — Percé will call the phone number above to confirm. No WhatsApp messages.",
    fallback: "If a WhatsApp message cannot be delivered, or we get no reply, we will call you instead.",
  },
  ar: {
    legend: "تأكيد الطلب",
    notice: "تقوم Percé بتأكيد كل طلب بالدفع عند الاستلام معك قبل شحنه. اختر طريقة تأكيد هذا الطلب:",
    whatsapp: "عبر واتساب — أوافق على استلام رسائل من Percé عبر واتساب على رقم الهاتف أعلاه بخصوص هذا الطلب: تأكيده وتحديثاته. يمكنني إيقافها في أي وقت بالرد بكلمة «إيقاف».",
    phone: "بمكالمة هاتفية — ستتصل Percé برقم الهاتف أعلاه لتأكيد الطلب، دون أي رسائل واتساب.",
    fallback: "إذا تعذّر توصيل رسالة واتساب أو لم يصلنا رد، سنتصل بك هاتفيًا.",
  },
} as const satisfies Record<ConsentLocale, Record<"legend" | "notice" | "whatsapp" | "phone" | "fallback", string>>;

export type ConfirmationChannel = "whatsapp" | "phone";

export type WhatsAppConsentVersion = keyof typeof WHATSAPP_CONSENT_TEXTS;

/** The optional checkbox's version (switch off). */
export const CURRENT_WHATSAPP_CONSENT_VERSION: WhatsAppConsentVersion = "checkout-v2";
/** The version recorded when the WhatsApp option of the required choice is picked (switch on). */
export const MANDATORY_CHOICE_CONSENT_VERSION: WhatsAppConsentVersion = CONFIRMATION_CHOICE_VERSION;

/** The version a client that sends no version saw: the old optional box. */
export const LEGACY_WHATSAPP_CONSENT_VERSION: WhatsAppConsentVersion = "checkout-v1";

export function isWhatsAppConsentVersion(v: unknown): v is WhatsAppConsentVersion {
  return typeof v === "string" && Object.hasOwn(WHATSAPP_CONSENT_TEXTS, v);
}

export function whatsappConsentText(version: WhatsAppConsentVersion, locale: ConsentLocale): string {
  return WHATSAPP_CONSENT_TEXTS[version][locale === "ar" ? "ar" : "en"];
}

/**
 * The server's refusal when a COD order that needs a confirmation-channel
 * choice arrives without one. Current checkout recognises it (by the English
 * part), shows the choice and replaces the text with its own translation. A
 * browser still running an older build shows the raw text next to its own
 * WhatsApp box, so the text carries both languages.
 */
const CONSENT_REQUIRED_EN =
  "Please choose how we should confirm your cash-on-delivery order: on WhatsApp or by phone call.";
const CONSENT_REQUIRED_AR = "يرجى اختيار طريقة تأكيد طلبك بالدفع عند الاستلام: عبر واتساب أو بمكالمة هاتفية.";
export const WHATSAPP_CONSENT_REQUIRED_MESSAGE = `${CONSENT_REQUIRED_EN} — ${CONSENT_REQUIRED_AR}`;

export function isWhatsAppConsentRequiredError(message: string | null | undefined): boolean {
  return typeof message === "string" && message.includes(CONSENT_REQUIRED_EN);
}
