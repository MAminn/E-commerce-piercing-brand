import { sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { waCheckoutConsent } from "#root/shared/database/drizzle/schema";
import type { Tx } from "#root/backend/orders/update-order-status/apply-status-change";
import type { ConsentRequestDetails, WhatsAppConfirmConfig, WhatsAppConfirmMode } from "#root/shared/config/whatsapp-confirmation";
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
  /** checkoutConsent = WHATSAPP_CHECKOUT_CONSENT_REQUIRED (default optional). */
  config: Pick<WhatsAppConfirmConfig, "pilotAllowlist" | "checkoutConsent">;
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
  // The tick is REQUIRED only when the rollout switch is on AND this order
  // would really be messaged. Switch off: the box stays optional (the
  // behaviour before mandatory consent) and nothing is ever refused.
  const required =
    input.config.checkoutConsent === "required" && checkoutConsentRequired(input.mode, input.config, input.customerPhone, input.paymentMethod);
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
 * What of the order request is kept with the evidence
 * (WHATSAPP_CONSENT_REQUEST_DETAILS). The text, its version and language, the
 * number, the order and the time are the evidence itself; the request details
 * only support it, so by default the IP address is kept without its host
 * part and the user agent is not kept at all.
 */
export function consentRequestDetails(
  policy: ConsentRequestDetails,
  request: { ipAddress?: string | null; userAgent?: string | null } | undefined,
): { ipAddress: string | null; userAgent: string | null } {
  if (policy === "none" || !request) return { ipAddress: null, userAgent: null };
  if (policy === "full") {
    return { ipAddress: request.ipAddress ? request.ipAddress.slice(0, 64) : null, userAgent: request.userAgent ? request.userAgent.slice(0, 400) : null };
  }
  return { ipAddress: anonymizeIp(request.ipAddress), userAgent: null };
}

/**
 * IPv4 → last octet zeroed (a.b.c.0); IPv6 → first 48 bits kept (x:y:z::).
 * Anything that is not an IP address is dropped (null).
 */
export function anonymizeIp(raw: string | null | undefined): string | null {
  const ip = (raw ?? "").trim();
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/i, "");
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v4);
  if (m) {
    const parts = m.slice(1, 4).map(Number);
    return parts.every((n) => n <= 255) ? `${parts.join(".")}.0` : null;
  }
  if (!/^[0-9a-f:]+$/i.test(ip) || !ip.includes(":")) return null;
  const [head = ""] = ip.split("::");
  const groups = head.split(":").filter(Boolean);
  const kept = [...groups, "0", "0", "0"].slice(0, 3).map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""));
  return `${kept.join(":")}::`;
}

/**
 * Deletes consent evidence older than WHATSAPP_CONSENT_RETENTION_DAYS, in
 * batches. Does nothing at all unless a retention period is configured (it
 * is unset by default: nothing is ever deleted without an approved period).
 * dryRun counts what would be deleted without deleting.
 */
export async function purgeExpiredConsentEvidence(
  db: DatabaseClient,
  opts: { retentionDays: number | null; now?: Date; limit?: number; dryRun?: boolean },
): Promise<{ eligible: number; deleted: number }> {
  if (opts.retentionDays === null || !Number.isSafeInteger(opts.retentionDays) || opts.retentionDays <= 0) return { eligible: 0, deleted: 0 };
  const cutoff = new Date((opts.now ?? new Date()).getTime() - opts.retentionDays * 86_400_000).toISOString();
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 5000));
  if (opts.dryRun) {
    const r = (await db.execute(sql`SELECT count(*)::int AS n FROM wa_checkout_consent WHERE consented_at < ${cutoff}::timestamptz`)) as unknown as {
      rows: Array<{ n: number }>;
    };
    return { eligible: r.rows[0]?.n ?? 0, deleted: 0 };
  }
  const r = (await db.execute(sql`
    DELETE FROM wa_checkout_consent WHERE id IN (
      SELECT id FROM wa_checkout_consent WHERE consented_at < ${cutoff}::timestamptz ORDER BY consented_at LIMIT ${limit}
    ) RETURNING id`)) as unknown as { rows: unknown[] };
  return { eligible: r.rows.length, deleted: r.rows.length };
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
          ipAddress: row.ipAddress ?? null,
          userAgent: row.userAgent ?? null,
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
