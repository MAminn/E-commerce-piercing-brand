import { sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  readAbsTrackingConfig,
  setEffectiveAbsTrackingMode,
  type AbsTrackingConfig,
  type AbsTrackingMode,
} from "#root/shared/config/abs-tracking";

/**
 * Boot gate: `shadow` takes effect only when migration 0070 is in place (all
 * six abs_* tables plus the two unique indexes the poller's idempotency
 * relies on) AND the base URL / key are usable. Otherwise the effective mode
 * stays `off` and one line says why. With mode `off` no query is made.
 */
export const ABS_TABLES = [
  "abs_shipment",
  "abs_shipment_status_history",
  "abs_order_link",
  "abs_tracking_decision",
  "abs_sync_run",
  "abs_sync_state",
] as const;
export const ABS_UNIQUE_INDEXES = ["abs_tracking_decision_dedupe_idx", "abs_order_link_primary_order_idx"] as const;

export interface AbsTrackingReadiness {
  ready: boolean;
  missing: string[];
}

type Executor = Pick<DatabaseClient, "execute">;

export async function checkAbsTrackingReadiness(db: Executor): Promise<AbsTrackingReadiness> {
  try {
    const result = await db.execute(sql`
      SELECT
        (SELECT coalesce(array_agg(t), '{}') FROM unnest(${sql.raw(`ARRAY[${ABS_TABLES.map((t) => `'${t}'`).join(",")}]`)}::text[]) AS t
          WHERE to_regclass('public.' || t) IS NULL) AS missing_tables,
        (SELECT coalesce(array_agg(i), '{}') FROM unnest(${sql.raw(`ARRAY[${ABS_UNIQUE_INDEXES.map((i) => `'${i}'`).join(",")}]`)}::text[]) AS i
          WHERE NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public' AND indexname = i AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
          )) AS missing_indexes
    `);
    const row = (result as unknown as { rows: Array<{ missing_tables: string[] | string; missing_indexes: string[] | string }> }).rows[0];
    const asList = (v: string[] | string | undefined) =>
      Array.isArray(v) ? v : typeof v === "string" ? v.replace(/^\{|\}$/g, "").split(",").filter(Boolean) : [];
    const missing = [
      ...asList(row?.missing_tables).map((t) => `table ${t}`),
      ...asList(row?.missing_indexes).map((i) => `unique index ${i}`),
    ];
    return { ready: missing.length === 0, missing };
  } catch {
    return { ready: false, missing: ["readiness query failed"] };
  }
}

export interface AbsTrackingInit {
  config: AbsTrackingConfig;
  effective: AbsTrackingMode;
  reason: string | null;
  readiness: AbsTrackingReadiness | null;
}

/** Decide and publish the effective mode. Call once at boot. Never throws. */
export async function initAbsTracking(
  db: Executor,
  env: Record<string, string | undefined> = process.env,
  log: { info: (m: string) => void; warn: (m: string) => void } = console,
): Promise<AbsTrackingInit> {
  const config = readAbsTrackingConfig(env);
  for (const w of config.warnings) log.warn(`[ABS tracking] ${w}`);
  const off = (reason: string, readiness: AbsTrackingReadiness | null = null): AbsTrackingInit => {
    setEffectiveAbsTrackingMode("off");
    log.info(`[ABS tracking] off (${reason})`);
    return { config, effective: "off", reason, readiness };
  };
  if (config.mode === "off") return off("ABS_TRACKING_MODE is off or unset");
  if (config.missing.length > 0) return off(config.missing.join(", "));
  const readiness = await checkAbsTrackingReadiness(db);
  if (!readiness.ready) return off(`not ready: ${readiness.missing.join(", ")}`, readiness);
  setEffectiveAbsTrackingMode(config.mode);
  log.info(`[ABS tracking] mode=${config.mode}`);
  return { config, effective: config.mode, reason: null, readiness };
}
