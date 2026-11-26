import { waCheckoutConsent } from "#root/shared/database/drizzle/schema";
import type { Tx } from "#root/backend/orders/update-order-status/apply-status-change";
import type { WhatsAppConfirmConfig, WhatsAppConfirmMode } from "#root/shared/config/whatsapp-confirmation";
import { toWhatsAppRecipient } from "#root/shared/whatsapp/phone";
import {
  type ConsentLocale,
  isWhatsAppConsentVersion,
  LEGACY_WHATSAPP_CONSENT_VERSION,
  type WhatsAppConsentVersion,
  whatsappConsentText,
} from "#root/shared/whatsapp/consent-text";
import { CONSENT_SOURCE_CHECKOUT, checkoutConsentRequired } from "./eligibility";

/**
 * The checkout side of the WhatsApp acknowledgment: whether an order may be
 * accepted without it, and the evidence row written with the order.
 * Pure except for recordCheckoutConsentInTx.
 */

export interface CheckoutConsentInput {
  mode: WhatsAppConfirmMode;
  config: Pick<WhatsAppConfirmConfig, "pilotAllowlist">;
  customerPhone: string;
  paymentMethod: string;
  /** The shopper's own tick, as the request reports it. */
  whatsappOptIn: boolean;
  /** Which consent text the browser showed (absent from older builds). */
  consentVersion?: string | null;
  consentLocale?: string | null;
}

export type CheckoutConsentPlan =
  /** Refuse the order: the tick is required and missing. */
  | { kind: "refuse" }
  /** Nothing to record (no tick, and none needed; or the feature is off). */
  | { kind: "none" }
  /** Ticked: write this evidence with the order. */
  | { kind: "record"; evidence: CheckoutConsentEvidence };

export interface CheckoutConsentEvidence {
  phoneRaw: string;
  phoneE164: string | null;
  consentTextVersion: WhatsAppConsentVersion;
  consentLocale: ConsentLocale;
  consentText: string;
  required: boolean;
  mode: WhatsAppConfirmMode;
}

export function planCheckoutConsent(input: CheckoutConsentInput): CheckoutConsentPlan {
  if (input.mode === "off") return { kind: "none" };
  const required = checkoutConsentRequired(input.mode, input.config, input.customerPhone, input.paymentMethod);
  if (input.whatsappOptIn !== true) return required ? { kind: "refuse" } : { kind: "none" };
  // A tick on an online-payment order means nothing: no message is ever sent
  // for one, so nothing is recorded as if it were consent to one.
  if (input.paymentMethod !== "cod") return { kind: "none" };
  // An unknown or missing version is the old build's optional box: record
  // what that box said rather than a version the shopper never saw.
  const version = isWhatsAppConsentVersion(input.consentVersion) ? input.consentVersion : LEGACY_WHATSAPP_CONSENT_VERSION;
  const locale: ConsentLocale = input.consentLocale === "ar" ? "ar" : "en";
  return {
    kind: "record",
    evidence: {
      phoneRaw: input.customerPhone,
      phoneE164: toWhatsAppRecipient(input.customerPhone),
      consentTextVersion: version,
      consentLocale: locale,
      consentText: whatsappConsentText(version, locale),
      required,
      mode: input.mode,
    },
  };
}

/**
 * Writes the evidence row inside the order's transaction, in a savepoint so
 * a failure here can never fail the order. The post-commit enqueue still
 * gets the tick from the same request in that case, so the order is still
 * confirmed; only this row would be missing, and that is logged.
 */
export async function recordCheckoutConsentInTx(
  tx: Tx,
  row: CheckoutConsentEvidence & { orderId: string; orderNumber: number | null; ipAddress?: string | null; userAgent?: string | null; consentedAt: Date },
): Promise<boolean> {
  try {
    await tx.transaction(async (sp) => {
      await sp
        .insert(waCheckoutConsent)
        .values({
          orderId: row.orderId,
          orderNumber: row.orderNumber,
          phoneRaw: row.phoneRaw.slice(0, 40),
          phoneE164: row.phoneE164,
          consentTextVersion: row.consentTextVersion,
          consentLocale: row.consentLocale,
          consentText: row.consentText,
          required: row.required,
          mode: row.mode,
          source: CONSENT_SOURCE_CHECKOUT,
          ipAddress: row.ipAddress ? row.ipAddress.slice(0, 64) : null,
          userAgent: row.userAgent ? row.userAgent.slice(0, 400) : null,
          consentedAt: row.consentedAt,
        })
        .onConflictDoNothing();
    });
    return true;
  } catch (err) {
    console.error(`[WhatsApp confirm] consent evidence not stored for order ${row.orderId}: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
    return false;
  }
}
