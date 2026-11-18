import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  effectiveAbsTrackingMode,
  type AbsTrackingConfig,
  type AbsTrackingMode,
} from "#root/shared/config/abs-tracking";
import { createAbsClient, type AbsFetchLike, type ListChangedShipmentsInput } from "./client";
import { loadCandidateOrders, matchShipment } from "./matcher";
import type { ParsedListPage } from "./parse";
import { redact } from "./redact";
import { decide, decisionDedupeKey } from "./rules";
import { createDbStore, createDryRunStore, type AbsStore, type ExistingLink, type PlannedWrite, type RunCounters, type RunOutcome, type RunTrigger } from "./store";
import type { CanonicalStatus, NormalizedShipment } from "./types";

/**
 * ABS shadow poller. One tick:
 *   1. pg_try_advisory_lock on a dedicated connection (rolling deploys can
 *      briefly run two containers) — not acquired → `skipped_locked`;
 *   2. window = (watermark ?? ABS_BACKFILL_FROM) − overlap … now;
 *   3. page through /shipments/list (≤ 100 per page, ≤ 50 pages);
 *   4. per shipment: upsert abs_shipment, append history, (re)match the link
 *      unless it is auto/confirmed/rejected, record the shadow decision;
 *   5. advance the watermark ONLY after a fully successful run.
 * Every write goes to an abs_* table; the order is only read. A tick never
 * throws: errors are redacted into abs_sync_run.error.
 */

export const ABS_TICK_LOCK_KEY = 7_310_420_001;
export const MAX_PAGES_PER_TICK = 50;
const PAGE_LIMIT = 100;
const DELIVERED_FAMILY: ReadonlySet<CanonicalStatus> = new Set(["DELIVERED", "PARTIALLY_DELIVERED", "DELIVERY_REVERTED"]);

export interface ShipmentSource {
  listChangedShipments(input: ListChangedShipmentsInput): Promise<ParsedListPage>;
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
}

export interface AbsTickReport extends RunCounters {
  runId: string | null;
  outcome: RunOutcome;
  trigger: RunTrigger;
  windowFrom: Date | null;
  windowTo: Date | null;
  rowsSkipped: number;
  linksUnmatched: number;
  error: string | null;
  planned: PlannedWrite[];
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
    error: null,
    planned: [],
  };
  const finish = (store: AbsStore | null) => {
    Object.assign(report, counters);
    report.planned = store?.planned() ?? [];
    return report;
  };

  let store: AbsStore | null = null;
  try {
    store = deps.dryRun ? await createDryRunStore(deps.db) : await createDbStore(deps.db);
    const source = deps.source === undefined ? defaultSource(deps, log) : deps.source;
    if (!source) {
      report.outcome = "skipped_config";
      report.error = "ABS_API_BASE_URL / ABS_API_KEY missing or invalid";
      await store.recordSkippedRun(report.trigger, "skipped_config", report.error, now());
      return finish(store);
    }

    const lock = await (deps.acquireLock ?? acquireAdvisoryLock)(deps.db);
    if (!lock.acquired) {
      report.outcome = "skipped_locked";
      await store.recordSkippedRun(report.trigger, "skipped_locked", null, now());
      return finish(store);
    }

    try {
      const watermark = await store.getWatermark();
      report.trigger = deps.trigger === "manual" ? "manual" : watermark ? "schedule" : "backfill";
      const to = now();
      const from = new Date((watermark ?? deps.config.backfillFrom).getTime() - deps.config.overlapMs);
      report.windowFrom = from;
      report.windowTo = to;
      report.runId = await store.startRun(report.trigger, from, to, to);

      let outcome: RunOutcome = "ok";
      let error: string | null = null;
      let cursor: string | null = null;
      let page = 1;
      const maxPages = deps.maxPages ?? MAX_PAGES_PER_TICK;
      let more = true;
      let shipmentErrors = 0;

      while (more) {
        if (counters.pages >= maxPages) {
          outcome = "partial";
          error = `page cap reached (${maxPages} pages); watermark kept`;
          break;
        }
        if (deps.shouldStop?.()) {
          outcome = "partial";
          error = "stopped (shutdown)";
          break;
        }
        let res: ParsedListPage;
        try {
          res = await source.listChangedShipments({ from, to, cursor, page, limit: PAGE_LIMIT });
        } catch (err) {
          outcome = counters.pages > 0 ? "partial" : "failed";
          error = scrub(err);
          break;
        }
        counters.pages++;
        report.rowsSkipped += res.skipped;

        const result = await processPage(store, deps, res.rows, now, log, scrub);
        shipmentErrors += result.errors;
        if (result.stopped) {
          outcome = "partial";
          error = "stopped (shutdown)";
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
      }

      if (outcome === "ok" && shipmentErrors > 0) {
        outcome = "partial";
        error = `${shipmentErrors} shipment(s) failed to process; watermark kept`;
      }
      if (outcome === "ok" && !deps.keepWatermark) await store.setWatermark(to);
      report.outcome = outcome;
      report.error = error;
      Object.assign(report, counters);
      await store.finishRun(report.runId, outcome, counters, error, now());
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
          const candidates = await loadCandidateOrders(d.db, s, { windowDays: d.config.matchWindowDays, observedAt: at });
          const match = matchShipment(s, candidates, {
            windowDays: d.config.matchWindowDays,
            codToleranceEgp: d.config.codToleranceEgp,
            observedAt: at,
          });
          const before = link?.state ?? null;
          link = await st.upsertLink(s.awb, match, at);
          if (link.state === "auto" && before !== "auto") counters.linksAuto++;
          if (link.state === "needs_review") counters.linksReview++;
          if (link.state === "unmatched") report.linksUnmatched++;
        }

        const usable = link && (link.state === "auto" || link.state === "confirmed") && link.orderId;
        const orders = usable ? await st.readOrders([link?.orderId as string]) : new Map();
        const o = usable ? orders.get(link?.orderId as string) : undefined;
        const verdict = decide({
          orderStatus: o?.status ?? null,
          shipment: { status: s.status, cash: s.cash, collectedCash: s.collectedCash },
          link: link ? { state: link.state, role: link.role, reasonCode: link.reasonCode } : null,
          orderTotal: o?.total ?? null,
          expectedCod: o?.expectedCod ?? null,
          codToleranceEgp: d.config.codToleranceEgp,
        });
        const inserted = await st.upsertDecision(
          {
            awb: s.awb,
            orderId: o?.id ?? null,
            orderStatusSeen: o?.status ?? null,
            shipmentStatus: s.status,
            decision: verdict.decision,
            reasonCode: verdict.reasonCode,
            dedupeKey: decisionDedupeKey(s.awb, s.status, o?.status ?? null, verdict.decision),
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
        if (inserted) counters.decisionsNew++;
      } catch (err) {
        errors++;
        logLine(`[ABS tracking] shipment ${s.awb} failed: ${redactFn(err)}`);
      }
    }
    return { errors, stopped: false };
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
      shouldStop: () => stopping,
      log: (m) => log.warn(m),
    });
    try {
      const report = await inFlight;
      if (report.outcome !== lastOutcome || report.outcome !== "ok") {
        const summary = `outcome=${report.outcome} pages=${report.pages} seen=${report.shipmentsSeen} changed=${report.shipmentsChanged} auto=${report.linksAuto} review=${report.linksReview} newDecisions=${report.decisionsNew}`;
        (report.outcome === "ok" || report.outcome === "skipped_locked" ? log.info : log.warn)(
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
