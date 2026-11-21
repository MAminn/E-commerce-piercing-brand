import type { WhatsAppConfirmConfig, WhatsAppConfirmMode } from "#root/shared/config/whatsapp-confirmation";
import { toWhatsAppRecipient } from "#root/shared/whatsapp/phone";

/**
 * Who may be messaged, who is asked for consent, and how a confirmation row
 * records consent — per effective mode. Pure (no I/O), shared by the checkout
 * opt-in endpoint and enqueueConfirmation so the two can never disagree.
 *
 *   off    — nothing shown, nothing recorded.
 *   shadow — checkbox HIDDEN. Nothing is ever sent, so every eligible COD
 *            order is recorded for simulation without asking
 *            (consent_source 'shadow_not_asked', consent_at NULL).
 *   pilot  — checkbox shown ONLY when the entered number is on
 *            WHATSAPP_PILOT_ALLOWLIST. An allow-listed number is sent to
 *            ONLY if the shopper ticked the box: the allow-list never stands
 *            in for consent. Any other order is recorded exactly as shadow.
 *   live   — checkbox shown to everyone, never pre-ticked; a send needs the
 *            tick.
 *
 * A runtime pause does not change any of this (it only stops the worker).
 */

export const CONSENT_SOURCE_CHECKOUT = "checkout";
export const CONSENT_SOURCE_SHADOW_NOT_ASKED = "shadow_not_asked";

/** pilot sends only to allow-listed numbers; live to everyone; shadow/off never. */
export function maySendTo(mode: WhatsAppConfirmMode, cfg: Pick<WhatsAppConfirmConfig, "pilotAllowlist">, phone: string | null): boolean {
  if (!phone) return false;
  if (mode === "live") return true;
  if (mode === "pilot") return cfg.pilotAllowlist.has(phone);
  return false;
}

/** Should checkout show the opt-in for this (raw, as typed) phone number? */
export function checkoutOptInVisible(mode: WhatsAppConfirmMode, cfg: Pick<WhatsAppConfirmConfig, "pilotAllowlist">, rawPhone: string | null | undefined): boolean {
  if (mode === "live") return true;
  if (mode === "pilot") return maySendTo(mode, cfg, toWhatsAppRecipient(rawPhone));
  return false;
}

/**
 * Does this order's row count as consented for a real send? Only an explicit
 * checkout tick does — never the mode, never the allow-list.
 */
export function hasCheckoutConsent(row: { consentSource: string | null; consentAt: Date | string | null }): boolean {
  return row.consentSource === CONSENT_SOURCE_CHECKOUT && row.consentAt !== null;
}
