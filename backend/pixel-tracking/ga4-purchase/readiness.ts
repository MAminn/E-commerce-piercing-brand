import { sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  readGa4PurchaseOwner,
  setEffectiveGa4PurchaseOwner,
  type Ga4PurchaseOwner,
} from "#root/shared/config/ga4-purchase-owner";

/**
 * Boot gate: `shadow` / `server` take effect only when migration 0069 is in
 * place — both tables AND the unique index that limits each order to one
 * purchase row. Otherwise the app keeps running in `browser` mode (the
 * browser keeps sending GA4 purchase) and logs why.
 */
export interface Ga4PurchaseReadiness {
  ready: boolean;
  missing: string[];
}

type Executor = Pick<DatabaseClient, "execute">;

export async function checkGa4PurchaseReadiness(db: Executor): Promise<Ga4PurchaseReadiness> {
  try {
    const result = await db.execute(sql`
      SELECT
        to_regclass('public.ga4_purchase_outbox') IS NOT NULL AS outbox,
        to_regclass('public.ga4_purchase_context') IS NOT NULL AS context,
        EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'ga4_purchase_outbox'
            AND indexname = 'ga4_purchase_outbox_order_id_idx'
            AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
        ) AS unique_idx
    `);
    const row = (result as unknown as { rows: Array<Record<string, boolean>> }).rows[0] ?? {};
    const missing: string[] = [];
    if (!row.outbox) missing.push("table ga4_purchase_outbox");
    if (!row.context) missing.push("table ga4_purchase_context");
    if (!row.unique_idx) missing.push("unique index ga4_purchase_outbox_order_id_idx");
    return { ready: missing.length === 0, missing };
  } catch {
    return { ready: false, missing: ["readiness query failed"] };
  }
}

/** Decide and publish the effective owner. Call once at boot, before listen. */
export async function initGa4PurchaseOwner(
  db: Executor,
  env: Record<string, string | undefined> = process.env,
): Promise<{ requested: Ga4PurchaseOwner; effective: Ga4PurchaseOwner; readiness: Ga4PurchaseReadiness | null }> {
  const requested = readGa4PurchaseOwner(env);
  if (requested === "browser") {
    setEffectiveGa4PurchaseOwner("browser");
    return { requested, effective: "browser", readiness: null };
  }
  const readiness = await checkGa4PurchaseReadiness(db);
  const effective: Ga4PurchaseOwner = readiness.ready ? requested : "browser";
  setEffectiveGa4PurchaseOwner(effective);
  if (readiness.ready) {
    console.info(`[GA4 Purchase] owner=${effective}`);
  } else {
    console.error(
      `[GA4 Purchase] GA4_PURCHASE_OWNER=${requested} requested but not ready (${readiness.missing.join(", ")}) — running in browser mode`,
    );
  }
  return { requested, effective, readiness };
}
