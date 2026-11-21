/**
 * WHATSAPP_CONFIRM_MODE — automatic WhatsApp order confirmation.
 *
 *   off (DEFAULT, and any unknown value) — nothing starts; no query against
 *          the wa_* tables, no Graph API request. The shop behaves as before.
 *   shadow — every eligible COD order gets a wa_order_confirmation row and an
 *          outbox row whose payload is prepared but NEVER sent
 *          (status `shadow_skipped`). The webhook receiver records inbound
 *          events and the decision it WOULD take; no order is changed.
 *   pilot  — real sends ONLY to numbers in WHATSAPP_PILOT_ALLOWLIST; every
 *          other order behaves exactly as in shadow. Replies from pilot
 *          numbers are applied (pending → processing on confirm).
 *   live   — real sends to every eligible order.
 *
 * The REQUESTED mode comes from the env; the EFFECTIVE mode is what the app
 * runs. It stays `off` until the boot readiness check
 * (backend/whatsapp-confirmation/readiness.ts) confirms migration 0073 exists;
 * pilot/live additionally need the Graph credentials, else they run shadow.
 * A DB pause flag (wa_settings.paused) turns pilot/live back into shadow at
 * runtime without a restart.
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

export function readWhatsAppConfirmConfig(env: Env = process.env): WhatsAppConfirmConfig {
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
