import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  ABS_BACKOFF_MAX_MS,
  effectiveAbsTrackingMode,
  type AbsTrackingConfig,
  type AbsTrackingMode,
} from "#root/shared/config/abs-tracking";

import { AbsApiError, createAbsClient, type AbsFetchLike, type ListChangedShipmentsInput } from "./client";
import { liveConfigOf, runLivePass, type LivePassReport } from "./live";
import { runLiveMonitoring } from "./live-monitor";
import { loadCandidateOrders, matchShipment } from "./matcher";
import type { HistoryEvent, ParsedListPage } from "./parse";
import { redact } from "./redact";
import { decide, decisionDedupeKey } from "./rules";
import {
  createDbStore,
  createDryRunStore,
  type AbsStore,
  type ExistingLink,
  type PlannedWrite,
  type RunCounters,
  type RunOutcome,
  type RunTrigger,
  type StoredShipment,
} from "./store";
import type { CanonicalStatus, NormalizedShipment } from "./types";

/**
 * ABS shadow poller. One tick:
 *   1. pg_try_advisory_lock on a dedicated connection (rolling deploys can
 *      briefly run two containers) — not acquired → `skipped_locked`;
 *   2. window = (watermark ?? ABS_BACKFILL_FROM) − overlap … now — or, when the
 *      previous tick stopped at the page cap / time budget, the SAME window from
 *      the stored resume point (abs_sync_state.resume_*);
 *   3. page through /shipments/list (≤ 100 per page, ≤ ABS_MAX_PAGES_PER_TICK
 *      pages, within ABS_TICK_TIMEOUT_MS), saving the resume point after every
 *      page of a multi-page window;
 *   4. per shipment: upsert abs_shipment, append history, (re)match the link
 *      unless it is auto/confirmed/rejected, record the shadow decision;
 *   5. recompute decisions that changed without an ABS change: links a human
 *      changed on the review screen, and linked AWBs whose order status or
 *      total changed on the website (read-only on "order");
 *   6. advance the watermark ONLY after a fully successful run;
 *   7. LIVE mode only (effective mode `live`, not paused): the live pass
 *      (live.ts) — the one place an order changes, pending|processing|shipped
 *      → delivered through the shared admin core, after every rule passed.
 * Steps 1–6 write abs_* tables only; the order is only read. A tick never
 * throws: errors are redacted into abs_sync_run.error.
 *
 * A failed run stores backoff_until = finish + min(interval × 2^(n−1), 1 h)
 * (n = consecutive failed runs; a 429 Retry-After is honoured if longer).
 * Scheduled ticks skip until then (`skipped_backoff`, not stored); a manual
 * "Check ABS now" ignores the backoff.
 */

export const ABS_TICK_LOCK_KEY = 7_310_420_001;
export const MAX_PAGES_PER_TICK = 50;
/** AWBs recomputed per tick (human link changes first, then stale decisions). */
export const RECOMPUTE_PER_TICK = 200;
const PAGE_LIMIT = 100;
const DELIVERED_FAMILY: ReadonlySet<CanonicalStatus> = new Set(["DELIVERED", "PARTIALLY_DELIVERED", "DELIVERY_REVERTED"]);

export interface ShipmentSource {
  listChangedShipments(input: ListChangedShipmentsInput): Promise<ParsedListPage>;
  /** GET /tracking/:awb/history — the live pass's fresh check. Absent → live never applies. */
  getHistory?(awb: string): Promise<HistoryEvent[]>;
}

export interface TickLock {
  acquired: boolean;
  release(): Promise<void>;
}

export interface AbsTickDeps {
  db: DatabaseClient;
  config: AbsTrackingConfig;
  /** Where shipments come from. Null → `skipped_config`. Defaults to an ABS client built from config. */
  source?: ShipmentSource | null;
  fetchImpl?: AbsFetchLike;
  trigger?: Extract<RunTrigger, "schedule" | "manual">;
  now?: () => Date;
  dryRun?: boolean;
  maxPages?: number;
  log?: (message: string) => void;
  /** Checked between shipments; true → stop early and record `partial`. */
  shouldStop?: () => boolean;
  /** Offline runs (scripts/abs-tracking/run-once.ts --input) never move the poll watermark. */
  keepWatermark?: boolean;
  acquireLock?: (db: DatabaseClient) => Promise<TickLock>;
  /** Injected into the default ABS client (tests). */
  clientOptions?: { sleep?: (ms: number) => Promise<void>; minGapMs?: number; timeoutMs?: number };
  /** Total time budget for this tick (default config.tickTimeoutMs). */
  tickTimeoutMs?: number;
  /** Wall clock for the time budget (tests). */
  clockMs?: () => number;
  /** Live pass on/off (default: effective mode is `live`). */
  isLive?: () => boolean;
}

/** Exponential failure backoff: interval × 2^(n−1), at most 1 h; a longer Retry-After wins (also ≤ 1 h). */
export function computeBackoffUntil(consecutiveFailures: number, finishedAt: Date, pollIntervalMs: number, retryAfterMs: number | null = null): Date {
  const n = Math.max(1, consecutiveFailures);
  const exp = Math.min(pollIntervalMs * 2 ** (n - 1), ABS_BACKOFF_MAX_MS);
  const wait = Math.min(Math.max(exp, retryAfterMs ?? 0), ABS_BACKOFF_MAX_MS);
  return new Date(finishedAt.getTime() + wait);
}

export interface AbsTickReport extends RunCounters {
  runId: string | null;
  outcome: RunOutcome;
  trigger: RunTrigger;
  windowFrom: Date | null;
  windowTo: Date | null;
  rowsSkipped: number;
  linksUnmatched: number;
  /** Decisions recomputed from stored shipments (step 5). */
  recomputed: number;
  /** Set when this run failed: scheduled ticks wait until then. */
  backoffUntil?: Date | null;
  error: string | null;
  planned: PlannedWrite[];
  /** Step 7 (live mode only); null when it did not run. */
  live: LivePassReport | null;
}

/**
 * Decide and record ONE AWB's shadow decision. Used by the page loop and by
 * the recompute pass, so both produce identical rows. Reads the linked order
 * (SELECT only); writes abs_tracking_decision only.
 */
export async function recordDecision(st: AbsStore, codToleranceEgp: number, s: StoredShipment, link: ExistingLink | null, at: Date): Promise<boolean> {
  const usable = link && (link.state === "auto" || link.state === "confirmed") && link.orderId;
  const orders = usable ? await st.readOrders([link?.orderId as string]) : new Map();
  const o = usable ? orders.get(link?.orderId as string) : undefined;
  const verdict = decide({
    orderStatus: o?.status ?? null,
    shipment: { status: s.status, cash: s.cash, collectedCash: s.collectedCash },
    link: link ? { state: link.state, role: link.role, reasonCode: link.reasonCode } : null,
    orderTotal: o?.total ?? null,
    expectedCod: o?.expectedCod ?? null,
    codToleranceEgp,
  });
  return await st.upsertDecision(
    {
      awb: s.awb,
      orderId: o?.id ?? null,
      orderStatusSeen: o?.status ?? null,
      shipmentStatus: s.status,
      decision: verdict.decision,
      reasonCode: verdict.reasonCode,
      dedupeKey: decisionDedupeKey(s.awb, s.status, o?.status ?? null, verdict.decision),
      orderTotal: o?.total ?? null,
      absDeliveryDate: s.deliveryDate,
      details: {
        orderNumber: o?.orderNumber ?? null,
        linkState: link?.state ?? null,
        linkRole: link?.role ?? null,
        linkMethod: link?.method ?? null,
        linkReason: link?.reasonCode ?? null,
        statusRaw: s.statusRaw,
        lastEventCode: s.lastEventCode,
        cash: s.cash,
        collectedCash: s.collectedCash,
        expectedCod: o?.expectedCod ?? null,
        phoneLast4: s.consigneePhoneLast4,
      },
    },
    at,
  );
}

/** Session-level advisory lock held on its own pooled connection for the whole tick. */
export async function acquireAdvisoryLock(db: DatabaseClient): Promise<TickLock> {
  const pool = (db as unknown as { $client?: { connect?: () => Promise<PoolClientLike> } }).$client;
  if (!pool?.connect) throw new Error("ABS tick lock needs a pg Pool-backed drizzle client");
  const conn = await pool.connect();
  let acquired = false;
  try {
    const res = await conn.query("SELECT pg_try_advisory_lock($1::bigint) AS ok", [ABS_TICK_LOCK_KEY]);
    acquired = res.rows[0]?.ok === true;
  } catch (err) {
    conn.release();
    throw err;
  }
  if (!acquired) {
    conn.release();
    return { acquired: false, release: async () => {} };
  }
  return {
    acquired: true,
    release: async () => {
      try {
        await conn.query("SELECT pg_advisory_unlock($1::bigint)", [ABS_TICK_LOCK_KEY]);
      } finally {
        conn.release();
      }
    },
  };
}
interface PoolClientLike {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  release(): void;
}

function defaultSource(deps: AbsTickDeps, log: (m: string) => void): ShipmentSource | null {
  const { baseUrl, apiKey } = deps.config;
  if (!baseUrl || !apiKey) return null;
  return createAbsClient({ baseUrl, apiKey, fetchImpl: deps.fetchImpl, log, ...deps.clientOptions });
}

export async function runAbsTrackingTick(deps: AbsTickDeps): Promise<AbsTickReport> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((m: string) => console.warn(m));
  const scrub = (v: unknown) => redact(v, [deps.config.apiKey], 500);
  const counters: RunCounters = { pages: 0, shipmentsSeen: 0, shipmentsChanged: 0, linksAuto: 0, linksReview: 0, decisionsNew: 0 };
  const report: AbsTickReport = {
    ...counters,
    runId: null,
    outcome: "failed",
    trigger: deps.trigger ?? "schedule",
    windowFrom: null,
    windowTo: null,
    rowsSkipped: 0,
    linksUnmatched: 0,
    recomputed: 0,
    error: null,
    planned: [],
    live: null,
  };
  const isLive = deps.isLive ?? (() => effectiveAbsTrackingMode() === "live");
  const finish = (store: AbsStore | null) => {
    Object.assign(report, counters);
    report.planned = store?.planned() ?? [];
    return report;
  };

  let store: AbsStore | null = null;
  try {
    store = deps.dryRun ? await createDryRunStore(deps.db) : await createDbStore(deps.db, { decisionMode: isLive() ? "live" : "shadow" });
    const source = deps.source === undefined ? defaultSource(deps, log) : deps.source;
    if (!source) {
      report.outcome = "skipped_config";
      report.error = "ABS_API_BASE_URL / ABS_API_KEY missing or invalid";
      await store.recordSkippedRun(report.trigger, "skipped_config", report.error, now());
      return finish(store);
    }

    // Failure backoff: scheduled ticks wait; a person asking ("manual") does not.
    if (deps.trigger !== "manual" && !deps.dryRun) {
      const [latest] = await store.recentOutcomes(1);
      if (latest?.outcome === "failed" && latest.backoffUntil && latest.backoffUntil.getTime() > now().getTime()) {
        report.outcome = "skipped_backoff";
        report.error = `backing off after failures until ${latest.backoffUntil.toISOString()}`;
        return finish(store);
      }
    }

    const lock = await (deps.acquireLock ?? acquireAdvisoryLock)(deps.db);
    if (!lock.acquired) {
      report.outcome = "skipped_locked";
      await store.recordSkippedRun(report.trigger, "skipped_locked", null, now());
      return finish(store);
    }

    try {
      const watermark = await store.getWatermark();
      const resume = deps.keepWatermark ? null : await store.getResume();
      report.trigger = deps.trigger === "manual" ? "manual" : watermark ? "schedule" : "backfill";
      // Continue a window that hit the page cap / time budget, else start a new one.
      const to = resume ? resume.to : now();
      const from = resume ? resume.from : new Date((watermark ?? deps.config.backfillFrom).getTime() - deps.config.overlapMs);
      report.windowFrom = from;
      report.windowTo = to;
      report.runId = await store.startRun(report.trigger, from, to, now());

      let outcome: RunOutcome = "ok";
      let error: string | null = null;
      let failure: unknown = null;
      let cursor: string | null = resume?.cursor ?? null;
      let page = resume?.page ?? 1;
      const maxPages = deps.maxPages ?? deps.config.maxPagesPerTick ?? MAX_PAGES_PER_TICK;
      const clockMs = deps.clockMs ?? Date.now;
      const deadline = clockMs() + (deps.tickTimeoutMs ?? deps.config.tickTimeoutMs ?? Number.POSITIVE_INFINITY);
      const overBudget = () => clockMs() >= deadline;
      const pageDeps: AbsTickDeps = { ...deps, shouldStop: () => Boolean(deps.shouldStop?.()) || overBudget() };
      const stopReason = () => (deps.shouldStop?.() ? "stopped (shutdown)" : "tick time budget reached; continuing next tick");
      let more = true;
      let shipmentErrors = 0;

      while (more) {
        if (counters.pages >= maxPages) {
          outcome = "partial";
          error = `page cap reached (${maxPages} pages); continuing next tick`;
          break;
        }
        if (pageDeps.shouldStop?.()) {
          outcome = "partial";
          error = stopReason();
          break;
        }
        let res: ParsedListPage;
        try {
          res = await source.listChangedShipments({ from, to, cursor, page, limit: PAGE_LIMIT });
        } catch (err) {
          failure = err;
          outcome = counters.pages > 0 ? "partial" : "failed";
          error = scrub(err);
          // A resumed window whose cursor/page ABS now refuses (non-retryable 4xx): start the window again next time.
          if (resume && counters.pages === 0 && err instanceof AbsApiError && err.status !== null && err.status >= 400 && err.status < 500 && err.status !== 429) {
            if (!deps.keepWatermark) await store.clearResume();
          }
          break;
        }
        counters.pages++;
        report.rowsSkipped += res.skipped;

        // Shutdown may stop mid-page; the time budget only stops between pages (a fetched page is always processed).
        const result = await processPage(store, deps, res.rows, now, log, scrub);
        shipmentErrors += result.errors;
        if (result.stopped) {
          // The page is re-read from the last saved resume point (idempotent).
          outcome = "partial";
          error = stopReason();
          break;
        }

        more = res.hasMore;
        // Cursor when ABS gives one; otherwise documented page/limit + hasMore.
        if (res.nextCursor) {
          cursor = res.nextCursor;
        } else {
          cursor = null;
          page++;
        }
        // Multi-page window: remember where the next page starts, so a cap,
        // time budget, failure or restart continues instead of starting over.
        if (more && !deps.keepWatermark) await store.setResume({ from, to, page, cursor });
      }

      // Step 5 runs even when ABS failed: it only needs stored data.
      if (!pageDeps.shouldStop?.()) shipmentErrors += await recomputeDecisions(store, pageDeps, now, log, scrub);

      // Step 7: live pass, on fresh decisions, still under the tick lock. Not
      // when ABS itself failed (every history check would fail too), never in
      // dry runs / offline replays.
      if (!deps.dryRun && !deps.keepWatermark && outcome !== "failed" && !pageDeps.shouldStop?.() && isLive()) {
        try {
          report.live = await runLivePass({
            db: deps.db,
            config: liveConfigOf(deps.config),
            fetchHistory: source.getHistory ? (awb) => (source.getHistory as (a: string) => Promise<HistoryEvent[]>)(awb) : null,
            now,
            isLive,
            secrets: [deps.config.apiKey],
            log,
            shouldStop: pageDeps.shouldStop,
          });
        } catch (err) {
          log(`[ABS live] pass failed: ${scrub(err)}`);
        }
      }

      if (outcome === "ok" && shipmentErrors > 0) {
        outcome = "partial";
        error = `${shipmentErrors} shipment(s) failed to process; watermark kept`;
      }
      if (outcome === "ok" && !deps.keepWatermark) await store.setWatermark(to);
      report.outcome = outcome;
      report.error = error;
      Object.assign(report, counters);
      let backoffUntil: Date | null = null;
      if (outcome === "failed" && !deps.dryRun) {
        const recent = await store.recentOutcomes(10);
        let n = 1; // this run
        for (const r of recent) {
          if (r.outcome !== "failed") break;
          n++;
        }
        const retryAfter = (failure as { retryAfterMs?: number | null } | null)?.retryAfterMs ?? null;
        backoffUntil = computeBackoffUntil(n, now(), deps.config.pollIntervalMs, retryAfter);
        report.backoffUntil = backoffUntil;
      }
      await store.finishRun(report.runId, outcome, counters, error, now(), backoffUntil);
    } finally {
      await lock.release();
    }
    return finish(store);
  } catch (err) {
    report.outcome = "failed";
    report.error = scrub(err);
    try {
      if (store && report.runId) await store.finishRun(report.runId, "failed", counters, report.error, now());
    } catch {
      // DB unreachable: the console line below is all we can do.
    }
    log(`[ABS tracking] tick failed: ${report.error}`);
    return finish(store);
  }

  async function processPage(
    st: AbsStore,
    d: AbsTickDeps,
    rows: NormalizedShipment[],
    clock: () => Date,
    logLine: (m: string) => void,
    redactFn: (v: unknown) => string,
  ): Promise<{ errors: number; stopped: boolean }> {
    let errors = 0;
    const { shipments, links } = await st.loadExisting(rows.map((r) => r.awb));
    for (const s of rows) {
      if (d.shouldStop?.()) return { errors, stopped: true };
      counters.shipmentsSeen++;
      try {
        const at = clock();
        const prev = shipments.get(s.awb);
        const statusChanged = !prev || prev.status !== s.status || prev.statusRaw !== s.statusRaw;
        if (statusChanged) counters.shipmentsChanged++;
        await st.upsertShipment(s, at, statusChanged);
        await st.insertHistory(s.awb, s.status, s.statusRaw, DELIVERED_FAMILY.has(s.status) ? s.deliveryDate : null, "poll", at);

        let link: ExistingLink | null = links.get(s.awb) ?? null;
        if (!link || link.state === "unmatched" || link.state === "needs_review") {
          const windows = { windowDays: d.config.matchWindowDays, reverseWindowDays: d.config.reverseWindowDays, observedAt: at };
          const candidates = await loadCandidateOrders(d.db, s, windows);
          let match = matchShipment(s, candidates, { ...windows, codToleranceEgp: d.config.codToleranceEgp });
          // Once a human has touched this AWB (unlink sends it back to review),
          // the matcher may only PROPOSE again — never auto-link it.
          if (link?.decidedBy && match.state === "auto") {
            match = { ...match, state: "needs_review", orderId: null, reasonCode: "previously_unlinked", confidence: Math.min(match.confidence, 60) };
          }
          const before = link?.state ?? null;
          link = await st.upsertLink(s.awb, match, at);
          if (link.state === "auto" && before !== "auto") counters.linksAuto++;
          if (link.state === "needs_review") counters.linksReview++;
          if (link.state === "unmatched") report.linksUnmatched++;
        }

        if (await recordDecision(st, d.config.codToleranceEgp, s, link, at)) counters.decisionsNew++;
      } catch (err) {
        errors++;
        logLine(`[ABS tracking] shipment …${s.awb.slice(-4)} failed: ${redactFn(err)}`);
      }
    }
    return { errors, stopped: false };
  }

  /** Step 5. Returns the number of AWBs that failed. */
  async function recomputeDecisions(st: AbsStore, d: AbsTickDeps, clock: () => Date, logLine: (m: string) => void, redactFn: (v: unknown) => string): Promise<number> {
    let errors = 0;
    const items = await st.listRecompute(RECOMPUTE_PER_TICK);
    if (items.length === 0) return 0;
    const awbs = items.map((i) => i.awb);
    const stored = await st.loadStoredShipments(awbs);
    const { links } = await st.loadExisting(awbs);
    for (const item of items) {
      if (d.shouldStop?.()) break;
      try {
        const s = stored.get(item.awb);
        if (s && (await recordDecision(st, d.config.codToleranceEgp, s, links.get(item.awb) ?? null, clock()))) counters.decisionsNew++;
        if (item.flaggedAt) await st.clearRecompute(item.awb, item.flaggedAt);
        report.recomputed++;
      } catch (err) {
        errors++;
        logLine(`[ABS tracking] recompute ${item.awb.slice(-4)} failed: ${redactFn(err)}`);
      }
    }
    return errors;
  }
}

export interface AbsTrackingWorkerHandle {
  stop(): Promise<void>;
  tick(): Promise<AbsTickReport | null>;
  readonly started: boolean;
}

const NOOP_HANDLE: AbsTrackingWorkerHandle = { stop: async () => {}, tick: async () => null, started: false };

export interface StartAbsWorkerOptions {
  db: DatabaseClient;
  config: AbsTrackingConfig;
  mode?: () => AbsTrackingMode;
  fetchImpl?: AbsFetchLike;
  log?: { info: (m: string) => void; warn: (m: string) => void };
  /** Register SIGTERM/SIGINT so an in-flight tick stops between shipments. Default true. */
  handleSignals?: boolean;
  /** Run the first tick immediately (default true). */
  runImmediately?: boolean;
}

/**
 * Started from server/server.ts after initAbsTracking. With the effective
 * mode `off`, or no base URL / key, nothing is scheduled and the handle is a
 * no-op (no ABS request, no abs_* query).
 */
export function startAbsTrackingWorker(opts: StartAbsWorkerOptions): AbsTrackingWorkerHandle {
  const log = opts.log ?? console;
  const mode = (opts.mode ?? effectiveAbsTrackingMode)();
  if (mode === "off") return NOOP_HANDLE;
  if (!opts.config.baseUrl || !opts.config.apiKey) {
    log.info("[ABS tracking] off (ABS_API_BASE_URL / ABS_API_KEY missing)");
    return NOOP_HANDLE;
  }

  let inFlight: Promise<AbsTickReport> | null = null;
  let stopping = false;
  let lastOutcome: RunOutcome | null = null;

  const tick = async (): Promise<AbsTickReport | null> => {
    if (stopping) return null;
    if (inFlight) return null; // never overlap in-process
    inFlight = runAbsTrackingTick({
      db: opts.db,
      config: opts.config,
      fetchImpl: opts.fetchImpl,
      trigger: "schedule",
      maxPages: opts.config.maxPagesPerTick,
      shouldStop: () => stopping,
      log: (m) => log.warn(m),
    });
    try {
      const report = await inFlight;
      // Live mode: deduped alert emails + the 09:00 Cairo digest (never throws).
      if (effectiveAbsTrackingMode() === "live") await runLiveMonitoring({ db: opts.db, log: (m) => log.warn(m) }, report.live);
      if (report.live?.ran && (report.live.applied > 0 || report.live.failed > 0 || report.live.capHit)) {
        log.info(`[ABS live] applied=${report.live.applied} ready=${report.live.ready} skipped=${report.live.skipped} failed=${report.live.failed}${report.live.capHit ? " (daily cap reached)" : ""}`);
      }
      if (report.outcome !== lastOutcome || (report.outcome !== "ok" && report.outcome !== "skipped_backoff")) {
        const summary = `outcome=${report.outcome} pages=${report.pages} seen=${report.shipmentsSeen} changed=${report.shipmentsChanged} auto=${report.linksAuto} review=${report.linksReview} newDecisions=${report.decisionsNew}`;
        (report.outcome === "ok" || report.outcome === "skipped_locked" || report.outcome === "skipped_backoff" ? log.info : log.warn)(
          `[ABS tracking] tick ${summary}${report.error ? ` error=${report.error}` : ""}`,
        );
      }
      lastOutcome = report.outcome;
      return report;
    } catch (err) {
      // runAbsTrackingTick never throws; belt and braces.
      log.warn(`[ABS tracking] tick crashed: ${redact(err, [opts.config.apiKey], 300)}`);
      return null;
    } finally {
      inFlight = null;
    }
  };

  const interval = setInterval(() => void tick(), opts.config.pollIntervalMs);
  interval.unref?.();

  const stop = async () => {
    stopping = true;
    clearInterval(interval);
    if (inFlight) {
      // The tick checks `stopping` between shipments; give it a moment.
      await Promise.race([inFlight.catch(() => null), new Promise((r) => setTimeout(r, 5_000).unref?.())]);
    }
  };

  if (opts.handleSignals !== false) {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.once(signal, () => {
        // Any other listener already received this signal and owns shutdown.
        const othersListen = process.listenerCount(signal) > 0;
        void stop().finally(() => {
          // Otherwise restore Node's default: re-raise so the process still exits.
          if (!othersListen) process.kill(process.pid, signal);
        });
      });
    }
  }

  log.info(`[ABS tracking] worker started (mode=${mode}, every ${Math.round(opts.config.pollIntervalMs / 1000)}s)`);
  if (opts.runImmediately !== false) void tick();
  return { stop, tick, started: true };
}
