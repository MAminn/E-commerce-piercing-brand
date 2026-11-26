import { sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  readWhatsAppConfirmConfig,
  resolveEffectiveMode,
  sendingConfigProblems,
  setWhatsAppConfirmBootStatus,
  type WhatsAppConfirmBootStatus,
} from "#root/shared/config/whatsapp-confirmation";

export const WA_REQUIRED_TABLES = ["wa_order_confirmation", "wa_outbox", "wa_inbound_event", "wa_review_item", "wa_settings", "wa_opt_out", "wa_checkout_consent"] as const;

/**
 * Boot check. `off` requested → no query at all. Otherwise confirms
 * migrations 0073 and 0074 are applied and the sending config is complete, then fixes
 * the effective mode for the life of the process.
 */
export async function initWhatsAppConfirm(db: DatabaseClient): Promise<WhatsAppConfirmBootStatus> {
  const config = readWhatsAppConfirmConfig();
  let tablesReady = false;
  const problems: string[] = [];
  if (config.requestedMode !== "off") {
    const res = (await db.execute(
      sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${sql.join(
        WA_REQUIRED_TABLES.map((t) => sql`${t}`),
        sql`, `,
      )})`,
    )) as unknown as { rows: Array<{ n: number }> };
    tablesReady = (res.rows[0]?.n ?? 0) === WA_REQUIRED_TABLES.length;
    if (!tablesReady) problems.push("migration 0073/0074 not applied");
    if (config.requestedMode === "pilot" || config.requestedMode === "live") problems.push(...sendingConfigProblems(config));
  }
  const status: WhatsAppConfirmBootStatus = {
    requestedMode: config.requestedMode,
    effectiveMode: resolveEffectiveMode(config.requestedMode, { tablesReady, sendingProblems: sendingConfigProblems(config) }),
    tablesReady,
    problems,
    checkedAt: new Date().toISOString(),
  };
  setWhatsAppConfirmBootStatus(status);
  if (status.requestedMode !== "off") {
    console.info(
      `[WhatsApp confirm] requested=${status.requestedMode} effective=${status.effectiveMode}${problems.length ? ` (${problems.join("; ")})` : ""}`,
    );
  }
  return status;
}
