import { sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  readAbsTrackingConfig,
  setAbsTrackingBootStatus,
  setEffectiveAbsTrackingMode,
  type AbsTrackingConfig,
  type AbsTrackingMode,
} from "#root/shared/config/abs-tracking";

/**
 * Boot gate: `shadow` takes effect only when migrations 0070 + 0071 are in
 * place (all seven abs_* tables, the two unique indexes the poller's
 * idempotency relies on, and the 0071 columns the Phase 2 code writes) AND
 * the base URL / key are usable. Otherwise the effective mode stays `off` and
 * one line says why. With mode `off` no query is made.
 */
export const ABS_TABLES = [
  "abs_shipment",
  "abs_shipment_status_history",
  "abs_order_link",
  "abs_tracking_decision",
  "abs_sync_run",
  "abs_sync_state",
  "abs_audit_log",
] as const;
export const ABS_UNIQUE_INDEXES = ["abs_tracking_decision_dedupe_idx", "abs_order_link_primary_order_idx"] as const;
/** One column per 0071 ALTER, so a half-applied 0071 keeps the mode off. */
export const ABS_REQUIRED_COLUMNS = [
  "abs_tracking_decision.order_status_at_decision",
  "abs_tracking_decision.order_total_at_decision",
  "abs_tracking_decision.abs_delivery_date",
  "abs_tracking_decision.acknowledged_at",
  "abs_tracking_decision.acknowledged_by",
  "abs_tracking_decision.ack_note",
  "abs_order_link.recompute_requested_at",
  "abs_sync_run.backoff_until",
  "abs_sync_state.resume_window_from",
  "abs_sync_state.resume_window_to",
  "abs_sync_state.resume_page",
  "abs_sync_state.resume_cursor",
] as const;

/** Live mode (0072) on top of the above: a `live` request without these runs `shadow`. */
export const ABS_LIVE_TABLES = ["abs_live_application", "abs_settings"] as const;
export const ABS_LIVE_UNIQUE_INDEXES = [
  "abs_live_application_decision_applied_idx",
  "abs_live_application_order_applied_idx",
  "abs_live_application_skip_dedupe_idx",
] as const;
export const ABS_LIVE_REQUIRED_COLUMNS = ["abs_tracking_decision.applied_at"] as const;

export interface AbsTrackingReadiness {
  ready: boolean;
  missing: string[];
}

type Executor = Pick<DatabaseClient, "execute">;

export async function checkAbsTrackingReadiness(db: Executor): Promise<AbsTrackingReadiness> {
  return await checkObjects(db, ABS_TABLES, ABS_UNIQUE_INDEXES, ABS_REQUIRED_COLUMNS);
}

/** The 0072 objects live mode needs. */
export async function checkAbsLiveReadiness(db: Executor): Promise<AbsTrackingReadiness> {
  return await checkObjects(db, ABS_LIVE_TABLES, ABS_LIVE_UNIQUE_INDEXES, ABS_LIVE_REQUIRED_COLUMNS);
}

async function checkObjects(db: Executor, ABS_TABLES: readonly string[], ABS_UNIQUE_INDEXES: readonly string[], ABS_REQUIRED_COLUMNS: readonly string[]): Promise<AbsTrackingReadiness> {
  try {
    const result = await db.execute(sql`
      SELECT
        (SELECT coalesce(array_agg(t), '{}') FROM unnest(${sql.raw(`ARRAY[${ABS_TABLES.map((t) => `'${t}'`).join(",")}]`)}::text[]) AS t
          WHERE to_regclass('public.' || t) IS NULL) AS missing_tables,
        (SELECT coalesce(array_agg(i), '{}') FROM unnest(${sql.raw(`ARRAY[${ABS_UNIQUE_INDEXES.map((i) => `'${i}'`).join(",")}]`)}::text[]) AS i
          WHERE NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public' AND indexname = i AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
          )) AS missing_indexes,
        (SELECT coalesce(array_agg(c), '{}') FROM unnest(${sql.raw(`ARRAY[${ABS_REQUIRED_COLUMNS.map((c) => `'${c}'`).join(",")}]`)}::text[]) AS c
          WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name || '.' || column_name = c
          )) AS missing_columns
    `);
    const row = (result as unknown as { rows: Array<{ missing_tables: string[] | string; missing_indexes: string[] | string; missing_columns: string[] | string }> }).rows[0];
    const asList = (v: string[] | string | undefined) =>
      Array.isArray(v) ? v : typeof v === "string" ? v.replace(/^\{|\}$/g, "").split(",").filter(Boolean) : [];
    const missing = [
      ...asList(row?.missing_tables).map((t) => `table ${t}`),
      ...asList(row?.missing_indexes).map((i) => `unique index ${i}`),
      ...asList(row?.missing_columns).map((c) => `column ${c}`),
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
  const publish = (effective: AbsTrackingMode, reason: string | null, readiness: AbsTrackingReadiness | null, liveTablesReady: boolean | null = null) =>
    setAbsTrackingBootStatus({
      requestedMode: config.requestedMode,
      effective,
      reason,
      ready: readiness ? readiness.ready : null,
      missing: readiness?.missing ?? [],
      checkedAt: new Date().toISOString(),
      liveTablesReady,
    });
  const off = (reason: string, readiness: AbsTrackingReadiness | null = null): AbsTrackingInit => {
    setEffectiveAbsTrackingMode("off");
    publish("off", reason, readiness);
    log.info(`[ABS tracking] off (${reason})`);
    return { config, effective: "off", reason, readiness };
  };
  if (config.mode === "off") return off("ABS_TRACKING_MODE is off or unset");
  if (config.missing.length > 0) return off(config.missing.join(", "));
  const readiness = await checkAbsTrackingReadiness(db);
  if (!readiness.ready) return off(`not ready: ${readiness.missing.join(", ")}`, readiness);
  let effective: AbsTrackingMode = config.mode;
  let reason: string | null = null;
  if (config.requestedMode === "live" && config.mode !== "live") {
    // ABS_LIVE_TRANSITIONS invalid (readAbsTrackingConfig already warned).
    reason = `live refused: ${config.live.transitionsError ?? "invalid live settings"}; running shadow`;
  }
  const liveReady = await checkAbsLiveReadiness(db);
  if (effective === "live") {
    if (!liveReady.ready) {
      effective = "shadow";
      reason = `live not ready: ${liveReady.missing.join(", ")}; running shadow`;
      log.warn(`[ABS tracking] ${reason}`);
    }
  }
  setEffectiveAbsTrackingMode(effective);
  publish(effective, reason, readiness, liveReady.ready);
  const liveNote =
    effective === "live"
      ? ` (${config.live.requireApproval ? "approval required" : "automatic"}; settle ${config.live.settleMinutes} min, max age ${config.live.maxAgeDays} d, ${config.live.maxPerTick}/tick, ${config.live.dailyCap}/day)`
      : "";
  log.info(`[ABS tracking] mode=${effective}${liveNote}`);
  return { config, effective, reason, readiness };
}
