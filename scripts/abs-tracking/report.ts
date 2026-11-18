/**
 * Read-only report of the ABS tracking shadow data in a LOCAL database:
 * counts by link state, decisions by type, latest runs and the review queue.
 * Phones appear as last 4 digits only.
 *
 *   DATABASE_URL=postgresql://…@localhost:…/db npx tsx scripts/abs-tracking/report.ts
 */
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "#root/shared/database/drizzle/schema";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { getAbsTrackingSummary } from "#root/backend/shipping-tracking/abs/summary";
import { requireLocalDatabase } from "./local-db-guard";

const fmtTime = (v: unknown) => (v instanceof Date ? v.toISOString().replace(".000Z", "Z") : v ? String(v) : "-");

async function main() {
  const url = requireLocalDatabase(process.argv.slice(2));
  const db = drizzle(url, { schema }) as unknown as DatabaseClient;
  try {
    const s = await getAbsTrackingSummary(db, { runs: 10, decisions: 200, review: 200 });
    if (!s.ready) {
      console.log(`ABS tracking tables not ready: ${s.missing.join(", ")}`);
      return;
    }
    console.log(`ABS tracking report — watermark ${s.watermark ?? "(none: next run backfills)"}`);
    console.log("\nLink states");
    for (const [k, n] of Object.entries(s.linkStates).sort()) console.log(`  ${k.padEnd(14)} ${n}`);
    console.log("\nDecisions (distinct rows)");
    for (const [k, n] of Object.entries(s.decisions).sort()) console.log(`  ${k.padEnd(26)} ${n}`);

    console.log("\nLatest runs");
    for (const r of s.runs) {
      console.log(
        `  ${fmtTime(r.startedAt)} ${String(r.trigger).padEnd(8)} ${String(r.outcome ?? "running").padEnd(14)} pages=${r.pages} seen=${r.shipmentsSeen} changed=${r.shipmentsChanged} auto=${r.linksAuto} review=${r.linksReview} new=${r.decisionsNew}${r.error ? ` error=${r.error}` : ""}`,
      );
    }

    console.log("\nNon-trivial decisions (everything except no_action)");
    for (const d of s.latestDecisions.filter((x) => x.decision !== "no_action")) {
      console.log(
        `  ${String(d.awb).padEnd(10)} #${String(d.orderNumber ?? "-").padEnd(8)} ${String(d.shipmentStatus).padEnd(20)} order=${String(d.orderStatusSeen ?? "-").padEnd(10)} → ${String(d.decision).padEnd(26)} ${d.reasonCode}  (seen ${d.seenCount}×, ph …${d.phoneLast4 ?? "----"})`,
      );
    }

    console.log("\nReview queue (needs_review)");
    if (s.reviewQueue.length === 0) console.log("  (empty)");
    for (const r of s.reviewQueue) {
      const cands = (r.candidates as Array<{ orderNumber: number; reasons: string[] }>).map((c) => `#${c.orderNumber}[${c.reasons.join(",")}]`).join("  ");
      console.log(`  ${String(r.awb).padEnd(10)} ${String(r.role).padEnd(8)} ${String(r.reasonCode).padEnd(22)} ${String(r.status).padEnd(20)} COD ${r.cash ?? "-"}  ph …${r.phoneLast4 ?? "----"}`);
      console.log(`      candidates: ${cands || "(none)"}`);
    }
  } finally {
    await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  }
}

void main();
