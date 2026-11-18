/**
 * One ABS tracking tick, by hand, against a LOCAL database.
 *
 *   DATABASE_URL=postgresql://…@localhost:…/db npx tsx scripts/abs-tracking/run-once.ts [flags]
 *
 *   --input <file.json>   read a saved /shipments/list-shaped JSON instead of
 *                         calling ABS (offline testing; the poll watermark is
 *                         not moved)
 *   --dry-run             no DB writes at all; prints what would be written
 *
 * Without --input it calls ABS with ABS_API_BASE_URL / ABS_API_KEY from the
 * environment (read-only endpoints only). ABS_TRACKING_MODE is not needed.
 * Refuses a non-local DATABASE_URL (see local-db-guard.ts).
 */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "#root/shared/database/drizzle/schema";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { readAbsTrackingConfig } from "#root/shared/config/abs-tracking";
import { parseListResponse } from "#root/backend/shipping-tracking/abs/parse";
import { checkAbsTrackingReadiness } from "#root/backend/shipping-tracking/abs/readiness";
import { runAbsTrackingTick, type ShipmentSource } from "#root/backend/shipping-tracking/abs/worker";
import { requireLocalDatabase } from "./local-db-guard";

async function main() {
  const argv = process.argv.slice(2);
  const url = requireLocalDatabase(argv);
  const dryRun = argv.includes("--dry-run");
  const inputIdx = argv.indexOf("--input");
  const inputFile = inputIdx >= 0 ? argv[inputIdx + 1] : undefined;
  if (inputIdx >= 0 && !inputFile) {
    console.error("--input needs a file path");
    process.exit(2);
  }

  const db = drizzle(url, { schema }) as unknown as DatabaseClient;
  try {
    const ready = await checkAbsTrackingReadiness(db);
    if (!ready.ready) {
      console.error(`abs_* tables missing (${ready.missing.join(", ")}). Apply migration 0070 first.`);
      process.exitCode = 1;
      return;
    }

    let source: ShipmentSource | undefined;
    if (inputFile) {
      const json = JSON.parse(readFileSync(inputFile, "utf8"));
      const page = parseListResponse(json, (_k, m) => console.warn(`[ABS tracking] ${m}`));
      source = { listChangedShipments: async () => ({ ...page, hasMore: false, nextCursor: null }) };
    }

    const config = readAbsTrackingConfig(process.env);
    const report = await runAbsTrackingTick({
      db,
      config,
      source,
      trigger: "manual",
      dryRun,
      keepWatermark: Boolean(inputFile),
      log: (m) => console.warn(m),
    });

    console.log(`ABS tracking run-once${dryRun ? " (DRY RUN — nothing written)" : ""}${inputFile ? ` from ${inputFile}` : " from ABS"}`);
    console.log(`  outcome            ${report.outcome}${report.error ? `  (${report.error})` : ""}`);
    console.log(`  trigger            ${report.trigger}`);
    console.log(`  window             ${report.windowFrom?.toISOString() ?? "-"} → ${report.windowTo?.toISOString() ?? "-"}`);
    console.log(`  pages              ${report.pages}`);
    console.log(`  shipments seen     ${report.shipmentsSeen} (changed ${report.shipmentsChanged}, skipped rows ${report.rowsSkipped})`);
    console.log(`  links              auto +${report.linksAuto}, needs_review ${report.linksReview}, unmatched ${report.linksUnmatched}`);
    console.log(`  new decisions      ${report.decisionsNew}`);
    if (dryRun) {
      const byTable = new Map<string, number>();
      for (const w of report.planned) byTable.set(`${w.op} ${w.table}`, (byTable.get(`${w.op} ${w.table}`) ?? 0) + 1);
      console.log("  would write:");
      for (const [k, n] of [...byTable].sort()) console.log(`    ${String(n).padStart(4)} × ${k}`);
      for (const w of report.planned.filter((p) => p.table === "abs_order_link" || p.table === "abs_tracking_decision")) {
        console.log(`    ${w.table} ${w.key} ${JSON.stringify(w.summary)}`);
      }
    }
    if (report.outcome === "failed") process.exitCode = 1;
  } finally {
    await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  }
}

void main();
