import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import type { AbsTrackingConfig } from "#root/shared/config/abs-tracking";
import type { AbsFetchLike } from "./client";
import { lastManualRunAt } from "./queries";
import { AbsReviewError, auditPollNow, pollNowCooldown } from "./review";
import { runAbsTrackingTick, type ShipmentSource } from "./worker";

/** A manual check runs inside the admin's HTTP request: keep it short. */
export const MANUAL_MAX_PAGES = 5;

export interface PollNowDeps {
  db: DatabaseClient;
  actor: string;
  config: AbsTrackingConfig;
  now?: () => Date;
  /** Tests only. */
  fetchImpl?: AbsFetchLike;
  source?: ShipmentSource | null;
  clientOptions?: { sleep?: (ms: number) => Promise<void>; minGapMs?: number; timeoutMs?: number };
}

/**
 * "Check ABS now": one tick in the request context, guarded by the same
 * advisory lock as the scheduled worker (a running tick → skipped_locked),
 * at most once per 2 minutes (the last manual run in abs_sync_run), with an
 * abs_audit_log `poll_now` row naming the admin. Ignores the failure
 * backoff (a person asked), never the cooldown.
 */
export async function runPollNow(deps: PollNowDeps) {
  const now = deps.now ?? (() => new Date());
  const cooldown = pollNowCooldown(await lastManualRunAt(deps.db), now());
  if (!cooldown.allowed) {
    throw new AbsReviewError("TOO_MANY_REQUESTS", `ABS was checked less than 2 minutes ago. Try again in ${Math.ceil(cooldown.retryAfterMs / 1000)} s.`);
  }
  const report = await runAbsTrackingTick({
    db: deps.db,
    config: deps.config,
    trigger: "manual",
    now,
    maxPages: MANUAL_MAX_PAGES,
    fetchImpl: deps.fetchImpl,
    ...(deps.source !== undefined ? { source: deps.source } : {}),
    clientOptions: deps.clientOptions,
    log: (m) => console.warn(m),
  });
  const summary = {
    runId: report.runId,
    outcome: report.outcome,
    pages: report.pages,
    shipmentsSeen: report.shipmentsSeen,
    shipmentsChanged: report.shipmentsChanged,
    linksAuto: report.linksAuto,
    linksReview: report.linksReview,
    decisionsNew: report.decisionsNew,
    recomputed: report.recomputed,
    error: report.error,
  };
  await auditPollNow(deps.db, deps.actor, summary, now());
  return summary;
}
