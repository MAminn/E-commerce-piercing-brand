/** Lifecycle of one order's WhatsApp confirmation (wa_order_confirmation.state). */
export const WA_STATES = [
  "queued", // outbox row waiting to be sent
  "shadow", // shadow mode: payload prepared, never sent
  "sent",
  "delivered",
  "read",
  "reminder_sent",
  "confirmed",
  "modify_requested",
  "cancel_requested",
  "follow_up", // no reply after the follow-up window
  "failed", // could not be delivered (permanent error / unknown outcome)
  "ineligible", // never messaged: no consent, not a mobile, opted out, not COD
  "superseded", // order left `pending` by staff before the customer answered
] as const;
export type WaState = (typeof WA_STATES)[number];

/** States still waiting for the customer. */
export const WA_AWAITING_STATES: readonly WaState[] = ["queued", "sent", "delivered", "read", "reminder_sent"];

export const WA_RESPONSES = ["confirm", "modify", "cancel"] as const;
export type WaButtonAction = (typeof WA_RESPONSES)[number];

export const WA_REVIEW_TYPES = [
  "modify",
  "cancel",
  "free_text",
  "unmatched",
  "failed_send",
  "no_reply_48h",
  "late_reply",
  "ineligible",
] as const;
export type WaReviewType = (typeof WA_REVIEW_TYPES)[number];

export const WA_REVIEW_STATUSES = ["open", "in_progress", "done", "dismissed"] as const;
export type WaReviewStatus = (typeof WA_REVIEW_STATUSES)[number];

export type WaOutboxKind = "confirm" | "reminder";
export type WaOutboxStatus = "pending" | "sending" | "sent" | "failed" | "shadow_skipped" | "cancelled";

export const WA_STATUS_NOTE_PREFIX = "[WA auto]";
export const CONSENT_TEXT_VERSION = "checkout-v1";
