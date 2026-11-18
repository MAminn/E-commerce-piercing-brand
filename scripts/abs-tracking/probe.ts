/**
 * ABS API probe — run by the OWNER on his own machine, with the real key in
 * his shell only (never in a file, never pasted anywhere):
 *
 *   ABS_API_BASE_URL=https://<abs-host> ABS_API_KEY=<read-key> npx tsx scripts/abs-tracking/probe.ts [--days 30]
 *
 * Read-only: uses the Phase 1 ABS client and its allow-list (no other
 * endpoint can be called), at most 40 requests, ≥ 300 ms apart, and stops at
 * the first HTTP 401. It never opens a database connection — DATABASE_URL is
 * ignored, and the probe refuses to run when ABS_API_BASE_URL / ABS_API_KEY
 * are missing.
 *
 * Writes a redacted JSON report to scripts/abs-tracking/out/probe-<timestamp>.json
 * (git-ignored) and prints a short summary. No names, phones, addresses or
 * full AWBs (last 4 digits only) appear in either.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AbsFetchLike } from "#root/backend/shipping-tracking/abs/client";
import { redact } from "#root/backend/shipping-tracking/abs/redact";
import { checkProbeEnv, formatProbeSummary, runAbsProbe } from "./probe-core";

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const env = checkProbeEnv(process.env);
  if (!env.ok) {
    console.error(env.error);
    console.error("Usage: ABS_API_BASE_URL=https://… ABS_API_KEY=… npx tsx scripts/abs-tracking/probe.ts [--days 30]");
    process.exit(2);
  }
  const days = Number(argValue(argv, "--days") ?? "30");
  const report = await runAbsProbe({
    baseUrl: env.baseUrl,
    apiKey: env.apiKey,
    fetchImpl: globalThis.fetch as unknown as AbsFetchLike,
    days: Number.isFinite(days) ? days : 30,
  });
  const outDir = path.resolve(argValue(argv, "--out-dir") ?? path.join(process.cwd(), "scripts/abs-tracking/out"));
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `probe-${report.generatedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(formatProbeSummary(report));
  console.log(`\nRedacted report: ${path.relative(process.cwd(), file)}`);
  process.exit(report.aborted ? 1 : 0);
}

void main().catch((err) => {
  // Never print a stack with request details: one redacted line only.
  console.error(`probe failed: ${redact(err, [process.env.ABS_API_KEY], 200)}`);
  process.exit(1);
});
