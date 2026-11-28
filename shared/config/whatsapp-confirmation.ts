/**
 * WHATSAPP_CONFIRM_MODE — automatic WhatsApp order confirmation.
 *
 *   off (DEFAULT, and any unknown value) — nothing starts; no query against
 *          the wa_* tables, no Graph API request. The shop behaves as before.
 *   shadow — checkout shows NO opt-in box. Every eligible COD order gets a
 *          wa_order_confirmation row (consent not asked) and an outbox row
 *          whose payload is prepared but NEVER sent (status `shadow_skipped`).
 *          The webhook receiver records inbound events and the decision it
 *          WOULD take; no order is changed.
 *   pilot  — the opt-in box is shown only for numbers in
 *          WHATSAPP_PILOT_ALLOWLIST, and real sends go ONLY to those that
 *          TICKED it (the allow-list is never consent); every other order
 *          behaves exactly as in shadow. Replies from those orders are
 *          applied (pending → processing on confirm).
 *   live   — the opt-in box is shown to everyone; real sends only to orders
 *          whose box was ticked.
 * Rules: backend/whatsapp-confirmation/eligibility.ts.
 *
 * The REQUESTED mode comes from the env; the EFFECTIVE mode is what the app
 * runs. It stays `off` until the boot readiness check
 * (backend/whatsapp-confirmation/readiness.ts) confirms migration 0073 exists;
 * pilot/live additionally need the Graph credentials, else they run shadow.
 * A DB pause flag (wa_settings.paused) turns pilot/live back into shadow at
 * runtime without a restart.
 *
 * WHATSAPP_CHECKOUT_CONSENT_REQUIRED — is the checkout box REQUIRED?
 *   false (DEFAULT; anything but "true") — the box is shown wherever the
 *          mode would message the number, never pre-ticked, and the shopper
 *          may leave it unticked (the order is then confirmed by hand). This
 *          is the behaviour before mandatory consent.
 *   true   — the same box must be ticked to place a cash-on-delivery order
 *          that would be messaged; the server refuses the order without it.
 *   It only decides whether the tick is required: turning it off never turns
 *   the confirmation system off, and WHATSAPP_CONFIRM_MODE is unaffected.
 *
 * WHATSAPP_CONSENT_REQUEST_DETAILS — what of the order request is kept with
 * the consent evidence (wa_checkout_consent):
 *   anonymized (DEFAULT) — the IP address with its host part zeroed; no
 *          user agent.
 *   none   — neither.
 *   full   — the full IP address and the user agent (truncated).
 *
 * WHATSAPP_CONSENT_RETENTION_DAYS — consent evidence older than this many
 * days is deleted by the scheduler. UNSET (default) = nothing is ever
 * deleted. Values under 30 are refused (treated as unset, boot warns), so a
 * typo cannot wipe recent evidence.
 *
 * Dependency-free on purpose (like abs-tracking.ts).
 */
export type WhatsAppConfirmMode = "off" | "shadow" | "pilot" | "live";

export const WA_MODES: readonly WhatsAppConfirmMode[] = ["off", "shadow", "pilot", "live"];

/**
 * The customer-support number's Phone Number ID (+20 10 35790911, WABA
 * 1576999750297285). This feature must never send from, subscribe or
 * reference it — boot refuses pilot/live if it is configured as the sender.
 */
export const SUPPORT_PHONE_NUMBER_ID = "1287052047834595";
export const SUPPORT_WABA_ID = "1576999750297285";

export const WA_REMINDER_AFTER_HOURS_DEFAULT = 24;
export const WA_FOLLOWUP_AFTER_HOURS_DEFAULT = 48;
export const WA_DAILY_CAP_DEFAULT = 200;
export const WA_CONSENT_RETENTION_MIN_DAYS = 30;

export type CheckoutConsentPolicy = "optional" | "required";
export type ConsentRequestDetails = "none" | "anonymized" | "full";

export interface WhatsAppConfirmConfig {
  requestedMode: WhatsAppConfirmMode;
  graphApiVersion: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: string | null;
  appSecret: string | null;
  webhookVerifyToken: string | null;
  confirmTemplateName: string | null;
  reminderTemplateName: string | null;
  templateLanguage: string;
  /** E.164 digits without "+", e.g. 201001234567. */
  pilotAllowlist: ReadonlySet<string>;
  reminderAfterHours: number;
  followUpAfterHours: number;
  /** WHATSAPP_CHECKOUT_CONSENT_REQUIRED=true → "required"; default "optional". */
  checkoutConsent: CheckoutConsentPolicy;
  /** WHATSAPP_CONSENT_REQUEST_DETAILS (default anonymized). */
  consentRequestDetails: ConsentRequestDetails;
  /** WHATSAPP_CONSENT_RETENTION_DAYS; null = never delete (default). */
  consentRetentionDays: number | null;
  /** The raw WHATSAPP_CONSENT_RETENTION_DAYS when it was set but refused. */
  consentRetentionRejected: string | null;
}

type Env = Record<string, string | undefined>;

function str(env: Env, key: string): string | null {
  const v = env[key]?.trim();
  return v ? v : null;
}

function positiveInt(env: Env, key: string, fallback: number): number {
  const n = Number(env[key]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function parseWhatsAppConfirmMode(raw: string | undefined): WhatsAppConfirmMode {
  const v = (raw ?? "").trim().toLowerCase();
  return (WA_MODES as readonly string[]).includes(v) ? (v as WhatsAppConfirmMode) : "off";
}

export function parsePilotAllowlist(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(/[,\s]+/)) {
    const digits = part.replace(/\D/g, "");
    if (/^201[0125]\d{8}$/.test(digits)) out.add(digits);
  }
  return out;
}

/** Only an explicit "true" requires the tick; anything else (unset, typo) keeps it optional. */
export function parseCheckoutConsentPolicy(raw: string | undefined): CheckoutConsentPolicy {
  return (raw ?? "").trim().toLowerCase() === "true" ? "required" : "optional";
}

export function parseConsentRequestDetails(raw: string | undefined): ConsentRequestDetails {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "none" || v === "full" ? v : "anonymized";
}

/** null unless a whole number of days ≥ WA_CONSENT_RETENTION_MIN_DAYS. */
export function parseConsentRetentionDays(raw: string | undefined): number | null {
  const v = (raw ?? "").trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= WA_CONSENT_RETENTION_MIN_DAYS ? n : null;
}

export function readWhatsAppConfirmConfig(env: Env = process.env): WhatsAppConfirmConfig {
  const retentionRaw = env.WHATSAPP_CONSENT_RETENTION_DAYS?.trim() || null;
  const consentRetentionDays = parseConsentRetentionDays(retentionRaw ?? undefined);
  return {
    requestedMode: parseWhatsAppConfirmMode(env.WHATSAPP_CONFIRM_MODE),
    graphApiVersion: str(env, "WHATSAPP_GRAPH_API_VERSION"),
    phoneNumberId: str(env, "WHATSAPP_PHONE_NUMBER_ID"),
    wabaId: str(env, "WHATSAPP_WABA_ID"),
    accessToken: str(env, "WHATSAPP_ACCESS_TOKEN"),
    appSecret: str(env, "WHATSAPP_APP_SECRET"),
    webhookVerifyToken: str(env, "WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    confirmTemplateName: str(env, "WHATSAPP_TEMPLATE_CONFIRM_NAME"),
    reminderTemplateName: str(env, "WHATSAPP_TEMPLATE_REMINDER_NAME"),
    templateLanguage: str(env, "WHATSAPP_TEMPLATE_LANG") ?? "ar",
    pilotAllowlist: parsePilotAllowlist(env.WHATSAPP_PILOT_ALLOWLIST),
    reminderAfterHours: positiveInt(env, "WHATSAPP_REMINDER_AFTER_HOURS", WA_REMINDER_AFTER_HOURS_DEFAULT),
    followUpAfterHours: positiveInt(env, "WHATSAPP_FOLLOWUP_AFTER_HOURS", WA_FOLLOWUP_AFTER_HOURS_DEFAULT),
    checkoutConsent: parseCheckoutConsentPolicy(env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED),
    consentRequestDetails: parseConsentRequestDetails(env.WHATSAPP_CONSENT_REQUEST_DETAILS),
    consentRetentionDays,
    consentRetentionRejected: retentionRaw !== null && consentRetentionDays === null ? retentionRaw : null,
  };
}

/** Why pilot/live cannot send with this config (empty = can send). */
export function sendingConfigProblems(cfg: WhatsAppConfirmConfig): string[] {
  const problems: string[] = [];
  if (!cfg.graphApiVersion || !/^v\d+\.\d+$/.test(cfg.graphApiVersion)) problems.push("WHATSAPP_GRAPH_API_VERSION");
  if (!cfg.phoneNumberId || !/^\d+$/.test(cfg.phoneNumberId)) problems.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!cfg.wabaId || !/^\d+$/.test(cfg.wabaId)) problems.push("WHATSAPP_WABA_ID");
  if (!cfg.accessToken) problems.push("WHATSAPP_ACCESS_TOKEN");
  if (!cfg.appSecret) problems.push("WHATSAPP_APP_SECRET");
  if (!cfg.webhookVerifyToken) problems.push("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  if (!cfg.confirmTemplateName) problems.push("WHATSAPP_TEMPLATE_CONFIRM_NAME");
  if (cfg.phoneNumberId === SUPPORT_PHONE_NUMBER_ID) problems.push("WHATSAPP_PHONE_NUMBER_ID is the support number");
  if (cfg.wabaId === SUPPORT_WABA_ID) problems.push("WHATSAPP_WABA_ID is the support WABA");
  return problems;
}

export interface WhatsAppConfirmBootStatus {
  requestedMode: WhatsAppConfirmMode;
  effectiveMode: WhatsAppConfirmMode;
  tablesReady: boolean;
  problems: string[];
  checkedAt: string;
}

/** Pure: requested mode + readiness facts → effective mode. */
export function resolveEffectiveMode(
  requested: WhatsAppConfirmMode,
  facts: { tablesReady: boolean; sendingProblems: string[] },
): WhatsAppConfirmMode {
  if (requested === "off" || !facts.tablesReady) return "off";
  if (requested === "shadow") return "shadow";
  return facts.sendingProblems.length === 0 ? requested : "shadow";
}

let bootStatus: WhatsAppConfirmBootStatus | null = null;

export function setWhatsAppConfirmBootStatus(status: WhatsAppConfirmBootStatus | null): void {
  bootStatus = status;
}

export function getWhatsAppConfirmBootStatus(): WhatsAppConfirmBootStatus | null {
  return bootStatus;
}

/** `off` until boot readiness has run. */
export function effectiveWhatsAppConfirmMode(): WhatsAppConfirmMode {
  return bootStatus?.effectiveMode ?? "off";
}
