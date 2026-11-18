/**
 * Read-only report of the ABS tracking shadow data in a LOCAL database:
 * counts by link state, decisions by type, latest runs and the review queue.
 * Phones appear as last 4 digits only.
 *
 *   DATABASE_URL=postgresql://…@localhost:…/db npx tsx scripts/abs-tracking/report.ts
 *
 * --validation [--from <ISO>] [--to <ISO>] prints the Shadow validation
 * report instead (delivered / shipped agreement, misses, false positives,
 * matching quality, targets). AWBs appear as their last 4 characters.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "#root/shared/database/drizzle/schema";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { getAbsTrackingSummary } from "#root/backend/shipping-tracking/abs/summary";
import { getAbsValidationReport, type AgreementBlock } from "#root/backend/shipping-tracking/abs/validation";
import { requireLocalDatabase } from "./local-db-guard";

const fmtTime = (v: unknown) => (v instanceof Date ? v.toISOString().replace(".000Z", "Z") : v ? String(v) : "-");

const last4 = (awb: unknown) => `…${String(awb ?? "").slice(-4)}`;
const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 1000) / 10}%`);
const argAt = (argv: string[], name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? new Date(argv[i + 1] as string) : null;
};

function printAgreement(title: string, b: AgreementBlock) {
  console.log(`\n${title}`);
  console.log(`  proposed ${b.proposed}  agreed ${b.agreed}  pending ${b.pending}  false positives ${b.falsePositives}  misses ${b.misses}`);
  console.log(`  precision ${pct(b.precision)}  recall ${pct(b.recall)}  median lead ${b.medianLeadHours ?? "n/a"} h`);
  for (const p of b.proposals.filter((x) => x.outcome !== "agreed")) {
    console.log(`    ${p.outcome.padEnd(15)} #${p.orderNumber ?? "-"} ${last4(p.awb)} website=${p.websiteStatus ?? "-"} ${p.reason ?? ""}`);
  }
  for (const m of b.missList) console.log(`    miss            #${m.orderNumber ?? "-"} ${last4(m.awb)} ${m.reason}`);
}

async function printValidation(db: DatabaseClient, argv: string[]) {
  const r = await getAbsValidationReport(db, { from: argAt(argv, "--from"), to: argAt(argv, "--to") });
  console.log(`ABS Shadow validation — ${r.from} → ${r.to} (Shadow started ${r.shadowStartedAt ?? "never"}, ${r.shadowDays} day(s))`);
  printAgreement("Delivered", r.delivered);
  printAgreement("Shipped (secondary)", r.shipped);
  const m = r.matching;
  console.log("\nMatching");
  console.log(`  auto links ${m.autoLinks}, overruled by a human ${m.autoOverruled}, precision ${pct(m.autoPrecision)}`);
  for (const [method, q] of Object.entries(m.byMethod)) console.log(`    ${method.padEnd(20)} auto ${q.autoLinks} overruled ${q.overruled} precision ${pct(q.precision)}`);
  console.log(`  review confirmed ${m.reviewConfirmed} (top candidate ${m.reviewConfirmedTopCandidate}), manual links ${m.manualLinks}, unmatched ${m.unmatched}/${m.links} (${pct(m.unmatchedRate)})`);
  console.log("\nOpen alerts by reason");
  const alerts = Object.entries(r.openAlertsByReason);
  if (!alerts.length) console.log("  (none)");
  for (const [k, n] of alerts.sort()) console.log(`  ${k.padEnd(28)} ${n}`);
  console.log("\nTargets before proposing live mode");
  for (const t of r.targets) console.log(`  [${t.met ? "x" : " "}] ${t.name} — ${t.value}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const url = requireLocalDatabase(argv);
  const db = drizzle(url, { schema }) as unknown as DatabaseClient;
  try {
    if (argv.includes("--validation")) {
      await printValidation(db, argv);
      return;
    }
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
        `  ${last4(d.awb).padEnd(6)} #${String(d.orderNumber ?? "-").padEnd(8)} ${String(d.shipmentStatus).padEnd(20)} order=${String(d.orderStatusSeen ?? "-").padEnd(10)} → ${String(d.decision).padEnd(26)} ${d.reasonCode}  (seen ${d.seenCount}×, ph …${d.phoneLast4 ?? "----"})`,
      );
    }

    console.log("\nReview queue (needs_review)");
    if (s.reviewQueue.length === 0) console.log("  (empty)");
    for (const r of s.reviewQueue) {
      const cands = (r.candidates as Array<{ orderNumber: number; reasons: string[] }>).map((c) => `#${c.orderNumber}[${c.reasons.join(",")}]`).join("  ");
      console.log(`  ${last4(r.awb).padEnd(6)} ${String(r.role).padEnd(8)} ${String(r.reasonCode).padEnd(22)} ${String(r.status).padEnd(20)} COD ${r.cash ?? "-"}  ph …${r.phoneLast4 ?? "----"}`);
      console.log(`      candidates: ${cands || "(none)"}`);
    }
  } finally {
    await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  }
}

void main();
