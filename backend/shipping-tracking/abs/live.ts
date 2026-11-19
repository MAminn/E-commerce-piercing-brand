import { sql, type SQL } from "drizzle-orm";
import { v7 } from "uuid";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { effectiveAbsTrackingMode, type AbsTrackingConfig } from "#root/shared/config/abs-tracking";
import { applyOrderStatusChange, type OrderStatusValue, type Tx } from "#root/backend/orders/update-order-status/apply-status-change";
import { parseMoney } from "./normalize";
import type { HistoryEvent } from "./parse";
import { redact } from "./redact";
import {
  ATTENTION_REASONS,
  cairoDay,
  evaluateLive,
  historyCheck,
  isBlockingAlert,
  liveNote,
  preCheck,
  undoNote,
  type HistoryResult,
  type LiveFacts,
  type LiveRulesConfig,
  type LiveSkipReason,
} from "./live-rules";
import type { CanonicalStatus } from "./types";

/**
 * ABS Live writer — the ONLY code that changes a website order because of ABS,
 * and only `pending | processing | shipped → delivered`.
 *
 * Writes:
 *   - `order` + `order_log` + the review-email queue, ONLY through the shared
 *     admin core `applyOrderStatusChange` (system actor, note "[ABS auto] …");
 *   - abs_live_application, abs_tracking_decision (applied / applied_at),
 *     abs_audit_log, abs_settings.
 * Nothing else: no product, order_item, payment or ERP code is touched.
 *
 * One application = one transaction:
 *   1. lock abs_settings (FOR UPDATE) — serialises every live write, and the
 *      pause flag / daily cap are read under that lock;
 *   2. lock the order (FOR UPDATE), re-read decision, link, shipment and the
 *      human activity, and re-run every rule (live-rules.ts) with the fresh
 *      ABS history fetched just before the transaction;
 *   3. insert the abs_live_application row (partial unique indexes on the
 *      decision and on (order, to_status) for `applied` → a rerun or a
 *      concurrent writer inserts nothing and stops), mark the decision
 *      applied, write the audit row;
 *   4. call the shared core LAST (its review-email enqueue runs on its own
 *      connection, so nothing that can fail comes after it but one UPDATE of
 *      the row inserted in step 3).
 */

export const ABS_SYSTEM_ACTOR = "system:abs";
export type LiveTrigger = "auto" | "approval" | "approve_old";

export interface LiveConfig extends LiveRulesConfig {
  requireApproval: boolean;
  maxPerTick: number;
  dailyCap: number;
}

export function liveConfigOf(cfg: AbsTrackingConfig): LiveConfig {
  return {
    settleMinutes: cfg.live.settleMinutes,
    maxAgeDays: cfg.live.maxAgeDays,
    codToleranceEgp: cfg.codToleranceEgp,
    requireApproval: cfg.live.requireApproval,
    maxPerTick: cfg.live.maxPerTick,
    dailyCap: cfg.live.dailyCap,
  };
}

type Q = Pick<DatabaseClient, "execute">;
const rows = async <T>(q: Q, query: SQL): Promise<T[]> => ((await q.execute(query)) as unknown as { rows: T[] }).rows;
const toDate = (v: unknown): Date | null => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v)));
const last4 = (awb: string) => `…${awb.slice(-4)}`;

export class LiveError extends Error {
  readonly code: "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT" | "PRECONDITION_FAILED";
  constructor(code: LiveError["code"], message: string) {
    super(message);
    this.name = "LiveError";
    this.code = code;
  }
}

/** Thrown inside the apply transaction to roll it back and record a skip. */
class SkipInTx extends Error {
  constructor(
    readonly reason: LiveSkipReason,
    readonly detail?: Record<string, unknown>,
  ) {
    super(reason);
  }
}

// ─── Settings (pause flag) ──────────────────────────────────────────────────

export interface LiveSettings {
  paused: boolean;
  pausedAt: Date | null;
  pausedBy: string | null;
  pauseNote: string | null;
  updatedAt: Date | null;
}

async function ensureSettingsRow(q: Q): Promise<void> {
  await q.execute(sql`INSERT INTO abs_settings (id, live_paused) VALUES (1, false) ON CONFLICT (id) DO NOTHING`);
}

export async function getLiveSettings(q: Q): Promise<LiveSettings> {
  const [r] = await rows<Record<string, unknown>>(q, sql`SELECT live_paused, paused_at, paused_by, pause_note, updated_at FROM abs_settings WHERE id = 1`);
  return {
    paused: r?.live_paused === true,
    pausedAt: toDate(r?.paused_at),
    pausedBy: (r?.paused_by as string) ?? null,
    pauseNote: (r?.pause_note as string) ?? null,
    updatedAt: toDate(r?.updated_at),
  };
}

/** Pause / resume without a restart. Audited; repeating the current state is a no-op. */
export async function setLivePaused(deps: { db: DatabaseClient; actor: string; now?: () => Date }, input: { paused: boolean; note: string | null }) {
  const now = (deps.now ?? (() => new Date()))();
  await ensureSettingsRow(deps.db);
  return await deps.db.transaction(async (tx) => {
    const [cur] = await rows<{ live_paused: boolean }>(tx, sql`SELECT live_paused FROM abs_settings WHERE id = 1 FOR UPDATE`);
    const was = cur?.live_paused === true;
    if (was === input.paused) return { changed: false, paused: was };
    await tx.execute(sql`
      UPDATE abs_settings SET live_paused = ${input.paused},
        paused_at = ${input.paused ? now.toISOString() : null}::timestamptz,
        paused_by = ${input.paused ? deps.actor : null},
        pause_note = ${input.paused ? input.note : null},
        updated_at = ${now.toISOString()}::timestamptz, updated_by = ${deps.actor}
      WHERE id = 1`);
    await audit(tx, { actor: deps.actor, action: input.paused ? "live_pause" : "live_resume", before: { paused: was }, after: { paused: input.paused }, note: input.note }, now);
    return { changed: true, paused: input.paused };
  });
}

async function audit(q: Q, r: { actor: string; action: string; awb?: string | null; orderId?: string | null; before?: unknown; after?: unknown; note?: string | null }, now: Date) {
  await q.execute(sql`
    INSERT INTO abs_audit_log (id, at, actor, action, awb, order_id, before, after, note)
    VALUES (${v7()}, ${now.toISOString()}::timestamptz, ${r.actor}, ${r.action}, ${r.awb ?? null}, ${r.orderId ?? null}::uuid,
            ${r.before === undefined ? null : JSON.stringify(r.before)}::jsonb, ${r.after === undefined ? null : JSON.stringify(r.after)}::jsonb, ${r.note ?? null})`);
}

// ─── Facts ──────────────────────────────────────────────────────────────────

export interface FactsMeta {
  awb: string;
  orderNumber: number | null;
}

/**
 * Everything the rules need, read with `q` (the apply transaction, or the
 * plain client for the pre-flight). `lockOrder` → `SELECT … FOR UPDATE` on
 * the order row. Phones, names and addresses are never read.
 */
export async function loadLiveFacts(q: Q, decisionId: string, now: Date, opts: { lockOrder?: boolean } = {}): Promise<{ facts: LiveFacts; meta: FactsMeta }> {
  const [d] = await rows<Record<string, unknown>>(
    q,
    sql`SELECT d.id, d.awb, d.order_id, d.decision, d.created_at, d.last_seen_at, d.acknowledged_at, d.applied,
               d.order_status_at_decision, d.order_total_at_decision,
               (SELECT x.id FROM abs_tracking_decision x WHERE x.awb = d.awb ORDER BY x.last_seen_at DESC, x.created_at DESC LIMIT 1) = d.id AS is_latest
        FROM abs_tracking_decision d WHERE d.id = ${decisionId}::uuid`,
  );
  const empty: LiveFacts = {
    now,
    decision: null,
    link: null,
    shipment: null,
    order: null,
    humanStatusChangesSinceDecision: 0,
    everDelivered: false,
    openAlerts: [],
    otherAwbs: 0,
    humanUnlinked: false,
    alreadyApplied: false,
  };
  if (!d) return { facts: empty, meta: { awb: "", orderNumber: null } };
  const awb = String(d.awb);
  const decisionCreatedAt = toDate(d.created_at) as Date;

  const [l] = await rows<Record<string, unknown>>(
    q,
    sql`SELECT state, link_role, method, order_id, updated_at, recompute_requested_at FROM abs_order_link WHERE awb = ${awb}`,
  );
  const orderId = (d.order_id as string | null) ?? (l?.order_id as string | null) ?? null;

  const [s] = await rows<Record<string, unknown>>(
    q,
    sql`SELECT status, last_event_code, cmp_service, collected_cash, delivery_date, raw->'isUnderRevision' AS under_revision,
               (SELECT min(h.observed_at) FROM abs_shipment_status_history h WHERE h.awb = abs_shipment.awb AND h.status = 'DELIVERED') AS first_delivered
        FROM abs_shipment WHERE awb = ${awb}`,
  );

  let o: Record<string, unknown> | undefined;
  if (orderId) {
    [o] = await rows<Record<string, unknown>>(
      q,
      opts.lockOrder
        ? sql`SELECT id, order_number, status::text AS status, total, payment_method::text AS payment_method, payment_status::text AS payment_status, stock_restored FROM "order" WHERE id = ${orderId}::uuid FOR UPDATE`
        : sql`SELECT id, order_number, status::text AS status, total, payment_method::text AS payment_method, payment_status::text AS payment_status, stock_restored FROM "order" WHERE id = ${orderId}::uuid`,
    );
  }

  // "After the decision was first seen": the FIRST would_mark_delivered sighting
  // for this AWB and order — not the latest row, which the recompute pass
  // re-creates after an admin change (that change must still count).
  let firstProposedAt = decisionCreatedAt;
  if (orderId) {
    const [fp] = await rows<{ at: string | Date | null }>(
      q,
      sql`SELECT min(created_at) AS at FROM abs_tracking_decision WHERE awb = ${awb} AND decision = 'would_mark_delivered' AND order_id = ${orderId}::uuid`,
    );
    const at = toDate(fp?.at);
    if (at && at.getTime() < firstProposedAt.getTime()) firstProposedAt = at;
  }
  let human = 0;
  let everDelivered = false;
  let openAlerts: Array<{ id: string; reasonCode: string }> = [];
  let otherAwbs = 0;
  let alreadyApplied = false;
  if (o) {
    const [h] = await rows<{ changes: number; ever: boolean }>(
      q,
      sql`SELECT
            count(*) FILTER (WHERE action IN ('status_changed', 'cancelled') AND created_at > ${firstProposedAt.toISOString()}::timestamptz
                                   AND (note IS NULL OR note NOT LIKE '[ABS auto]%'))::int AS changes,
            coalesce(bool_or(old_status = 'delivered' OR new_status = 'delivered'), false) AS ever
          FROM order_log WHERE order_id = ${orderId}::uuid`,
    );
    human = Number(h?.changes ?? 0);
    everDelivered = h?.ever === true;
    const alerts = await rows<{ id: string; reason_code: string | null }>(
      q,
      sql`SELECT id, reason_code FROM abs_tracking_decision
          WHERE decision = 'alert' AND acknowledged_at IS NULL
            AND (awb = ${awb} OR order_id = ${orderId}::uuid
                 OR awb IN (SELECT awb FROM abs_order_link WHERE order_id = ${orderId}::uuid))
          ORDER BY created_at`,
    );
    openAlerts = alerts.filter((a) => isBlockingAlert(a.reason_code)).map((a) => ({ id: a.id, reasonCode: String(a.reason_code) }));
    const [other] = await rows<{ n: number }>(
      q,
      sql`SELECT (
            (SELECT count(*) FROM abs_order_link WHERE order_id = ${orderId}::uuid AND awb <> ${awb} AND state IN ('auto', 'confirmed'))
          + (SELECT count(*) FROM abs_order_link l, jsonb_array_elements(l.candidates) c
             WHERE l.state IN ('needs_review', 'unmatched') AND l.awb <> ${awb} AND c->>'orderId' = ${orderId})
          )::int AS n`,
    );
    otherAwbs = Number(other?.n ?? 0);
    const [ap] = await rows<{ hit: boolean }>(
      q,
      sql`SELECT EXISTS (SELECT 1 FROM abs_live_application WHERE outcome = 'applied'
            AND (decision_id = ${decisionId}::uuid OR (order_id = ${orderId}::uuid AND to_status = 'delivered'))) AS hit`,
    );
    alreadyApplied = ap?.hit === true;
  }
  const [u] = await rows<{ hit: boolean }>(
    q,
    sql`SELECT EXISTS (
          SELECT 1 FROM abs_audit_log a WHERE a.awb = ${awb} AND a.action IN ('link_reject', 'link_unlink')
            AND a.at > coalesce((SELECT max(b.at) FROM abs_audit_log b WHERE b.awb = ${awb} AND b.action IN ('link_confirm', 'link_manual')), '-infinity'::timestamptz)
        ) AS hit`,
  );

  const rawRev = s?.under_revision;
  const isUnderRevision = rawRev === true || rawRev === "true" ? true : rawRev === false || rawRev === "false" ? false : null;

  const facts: LiveFacts = {
    now,
    decision: {
      id: String(d.id),
      awb,
      orderId: (d.order_id as string) ?? null,
      decision: String(d.decision),
      createdAt: decisionCreatedAt,
      lastSeenAt: toDate(d.last_seen_at) as Date,
      acknowledgedAt: toDate(d.acknowledged_at),
      applied: d.applied === true,
      orderStatusAtDecision: (d.order_status_at_decision as string) ?? null,
      orderTotalAtDecision: parseMoney(d.order_total_at_decision as string | null),
      isLatest: d.is_latest === true,
    },
    link: l
      ? {
          state: String(l.state),
          role: String(l.link_role),
          method: (l.method as string) ?? null,
          orderId: (l.order_id as string) ?? null,
          updatedAt: toDate(l.updated_at) as Date,
          recomputeRequestedAt: toDate(l.recompute_requested_at),
        }
      : null,
    shipment: s
      ? {
          status: String(s.status) as CanonicalStatus,
          lastEventCode: (s.last_event_code as string) ?? null,
          cmpService: (s.cmp_service as string) ?? null,
          collectedCash: parseMoney(s.collected_cash as string | null),
          deliveryDate: toDate(s.delivery_date),
          isUnderRevision,
          firstSeenDeliveredAt: toDate(s.first_delivered),
        }
      : null,
    order: o
      ? {
          id: String(o.id),
          status: String(o.status),
          total: parseMoney(o.total as string) ?? 0,
          paymentMethod: String(o.payment_method),
          paymentStatus: String(o.payment_status),
          stockRestored: o.stock_restored === true,
        }
      : null,
    humanStatusChangesSinceDecision: human,
    everDelivered,
    openAlerts,
    otherAwbs,
    humanUnlinked: u?.hit === true,
    alreadyApplied,
  };
  return { facts, meta: { awb, orderNumber: o ? Number(o.order_number) : null } };
}

// ─── Outcome rows ───────────────────────────────────────────────────────────

/** Not recorded: nothing to do, and nothing a person needs to see. */
const QUIET_REASONS: ReadonlySet<LiveSkipReason> = new Set<LiveSkipReason>([
  "decision_missing",
  "decision_superseded",
  "not_proposed",
  "already_applied",
  "already_delivered",
]);

/**
 * A `skipped` / `failed` row: at most one per AWB × outcome × reason × Cairo
 * day; a repeat only refreshes last_seen_at / seen_count / details. No PII.
 */
export async function recordLiveOutcome(
  q: Q,
  r: { decisionId: string; awb: string; orderId: string | null; fromStatus: string | null; outcome: "skipped" | "failed"; reason: string; trigger: LiveTrigger; actor: string; details?: Record<string, unknown> },
  now: Date,
): Promise<void> {
  const details = JSON.stringify(r.details ?? {});
  await q.execute(sql`
    INSERT INTO abs_live_application (id, decision_id, awb, order_id, from_status, to_status, outcome, reason_code, trigger, actor, details, cairo_day, created_at, last_seen_at, seen_count)
    VALUES (${v7()}, ${r.decisionId}::uuid, ${r.awb}, ${r.orderId}::uuid, ${r.fromStatus}, 'delivered', ${r.outcome}, ${r.reason}, ${r.trigger}, ${r.actor},
            ${details}::jsonb, ${cairoDay(now)}::date, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, 1)
    ON CONFLICT (awb, outcome, reason_code, cairo_day) WHERE outcome IN ('skipped', 'failed')
    DO UPDATE SET last_seen_at = excluded.last_seen_at, seen_count = abs_live_application.seen_count + 1,
                  decision_id = excluded.decision_id, order_id = excluded.order_id, from_status = excluded.from_status,
                  details = excluded.details, trigger = excluded.trigger, actor = excluded.actor`);
}

export type LiveOutcome =
  | { outcome: "applied"; awb: string; orderNumber: number | null; applicationId: string; orderLogId: string; fromStatus: string }
  | { outcome: "ready"; awb: string; orderNumber: number | null }
  | { outcome: "skipped"; awb: string; orderNumber: number | null; reason: LiveSkipReason; recorded: boolean }
  | { outcome: "failed"; awb: string; orderNumber: number | null; error: string };

export interface ApplyDeps {
  db: DatabaseClient;
  config: LiveConfig;
  /** GET /tracking/:awb/history through the read-only ABS client. Null → never applies (history_unavailable). */
  fetchHistory: ((awb: string) => Promise<HistoryEvent[]>) | null;
  now?: () => Date;
  /** Defaults to the boot-time effective mode. */
  isLive?: () => boolean;
  /** Redaction of error text (the API key). */
  secrets?: Array<string | null | undefined>;
  log?: (m: string) => void;
}

/**
 * Evaluate one candidate decision and, unless `evaluateOnly`, apply it.
 * `evaluateOnly` (approval mode tick): every check incl. the fresh history,
 * then a `skipped / awaiting_approval` row — the "Ready to mark Delivered"
 * list — and nothing else.
 */
export async function applyLiveCandidate(
  deps: ApplyDeps,
  input: { decisionId: string; trigger: LiveTrigger; actor: string; evaluateOnly?: boolean },
): Promise<LiveOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const isLive = deps.isLive ?? (() => effectiveAbsTrackingMode() === "live");
  const opts = { ignoreAge: input.trigger === "approve_old" };
  const cfg = deps.config;

  // Pre-flight without locks (cheap; avoids an ABS call for an ineligible item).
  const pre = await loadLiveFacts(deps.db, input.decisionId, now);
  const base = { awb: pre.meta.awb, orderNumber: pre.meta.orderNumber };
  const skipped = async (reason: LiveSkipReason, detail?: Record<string, unknown>, facts: LiveFacts = pre.facts): Promise<LiveOutcome> => {
    const record = !QUIET_REASONS.has(reason) && facts.decision !== null;
    if (record) {
      await recordLiveOutcome(
        deps.db,
        {
          decisionId: input.decisionId,
          awb: base.awb,
          orderId: facts.order?.id ?? facts.decision?.orderId ?? null,
          fromStatus: facts.order?.status ?? null,
          outcome: "skipped",
          reason,
          trigger: input.trigger,
          actor: input.actor,
          details: { ...(detail ?? {}), orderNumber: base.orderNumber, awbLast4: base.awb.slice(-4), attention: ATTENTION_REASONS.has(reason) },
        },
        now,
      );
    }
    return { outcome: "skipped", ...base, reason, recorded: record };
  };

  if (!isLive()) return await skipped("not_live");
  const v1 = preCheck(pre.facts, cfg, opts);
  if (!v1.ok) return await skipped(v1.reason, v1.detail);

  // Fresh ABS history, outside any transaction.
  let history: HistoryResult;
  if (!deps.fetchHistory) {
    history = { ok: false, error: "no ABS client" };
  } else {
    try {
      history = { ok: true, events: await deps.fetchHistory(base.awb) };
    } catch (err) {
      history = { ok: false, error: redact(err, deps.secrets ?? [], 200) };
    }
  }
  const v2 = historyCheck(history, pre.facts, cfg);
  if (!v2.ok) return await skipped(v2.reason, v2.detail);

  if (input.evaluateOnly) {
    await skipped("awaiting_approval", {
      collected: pre.facts.shipment?.collectedCash ?? null,
      total: pre.facts.order?.total ?? null,
      deliveryDate: pre.facts.shipment?.deliveryDate?.toISOString() ?? null,
      fromStatus: pre.facts.order?.status ?? null,
    });
    return { outcome: "ready", ...base };
  }

  try {
    return await deps.db.transaction(async (tx) => {
      // 1. Serialise every live write; pause flag and cap read under this lock.
      await ensureSettingsRow(tx);
      const [st] = await rows<{ live_paused: boolean }>(tx, sql`SELECT live_paused FROM abs_settings WHERE id = 1 FOR UPDATE`);
      if (st?.live_paused === true) throw new SkipInTx("paused");
      if (!isLive()) throw new SkipInTx("not_live");
      const [cap] = await rows<{ n: number }>(tx, sql`SELECT count(*)::int AS n FROM abs_live_application WHERE outcome = 'applied' AND cairo_day = ${cairoDay(now)}::date`);
      if (Number(cap?.n ?? 0) >= cfg.dailyCap) throw new SkipInTx("daily_cap", { cap: cfg.dailyCap });

      // 2. Lock the order; re-read and re-check everything.
      const { facts, meta } = await loadLiveFacts(tx, input.decisionId, now, { lockOrder: true });
      const v = evaluateLive(facts, history, cfg, opts);
      if (!v.ok) throw new SkipInTx(v.reason, v.detail);
      const o = facts.order as NonNullable<LiveFacts["order"]>;
      const s = facts.shipment as NonNullable<LiveFacts["shipment"]>;

      // 3. Idempotency row first (a rerun / concurrent writer inserts nothing).
      const applicationId = v7();
      const details = {
        orderNumber: meta.orderNumber,
        awbLast4: meta.awb.slice(-4),
        collected: s.collectedCash,
        total: o.total,
        paymentMethod: o.paymentMethod,
        linkState: facts.link?.state ?? null,
        linkMethod: facts.link?.method ?? null,
        deliveryDate: s.deliveryDate?.toISOString() ?? null,
        historyEvents: history.ok ? history.events.length : 0,
      };
      const ins = await rows<{ id: string }>(
        tx,
        sql`INSERT INTO abs_live_application (id, decision_id, awb, order_id, from_status, to_status, outcome, reason_code, trigger, actor, details, cairo_day, applied_at, created_at, last_seen_at)
            VALUES (${applicationId}::uuid, ${input.decisionId}::uuid, ${meta.awb}, ${o.id}::uuid, ${o.status}, 'delivered', 'applied', ${null}, ${input.trigger}, ${input.actor},
                    ${JSON.stringify(details)}::jsonb, ${cairoDay(now)}::date, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)
            ON CONFLICT DO NOTHING RETURNING id`,
      );
      if (ins.length === 0) throw new SkipInTx("already_applied");
      await tx.execute(sql`UPDATE abs_tracking_decision SET applied = true, applied_at = ${now.toISOString()}::timestamptz, mode = 'live' WHERE id = ${input.decisionId}::uuid`);
      await audit(
        tx,
        {
          actor: input.actor,
          action: "live_apply",
          awb: meta.awb,
          orderId: o.id,
          before: { orderStatus: o.status, decisionId: input.decisionId },
          after: { orderStatus: "delivered", applicationId, trigger: input.trigger, orderNumber: meta.orderNumber },
        },
        now,
      );

      // 4. The shared admin core, LAST.
      const res = await applyOrderStatusChange(tx, {
        orderId: o.id,
        newStatus: "delivered",
        actor: { kind: "system", note: liveNote(meta.awb, input.decisionId, input.trigger) },
      });
      await tx.execute(sql`UPDATE abs_live_application SET order_log_id = ${res.orderLogId}::uuid WHERE id = ${applicationId}::uuid`);
      return { outcome: "applied" as const, awb: meta.awb, orderNumber: meta.orderNumber, applicationId, orderLogId: res.orderLogId, fromStatus: o.status };
    });
  } catch (err) {
    if (err instanceof SkipInTx) return await skipped(err.reason, err.detail);
    const error = redact(err, deps.secrets ?? [], 300);
    try {
      await recordLiveOutcome(
        deps.db,
        {
          decisionId: input.decisionId,
          awb: base.awb,
          orderId: pre.facts.order?.id ?? null,
          fromStatus: pre.facts.order?.status ?? null,
          outcome: "failed",
          reason: "apply_error",
          trigger: input.trigger,
          actor: input.actor,
          details: { error, orderNumber: base.orderNumber, awbLast4: base.awb.slice(-4) },
        },
        now,
      );
    } catch {
      // DB unreachable: the log line is all we can do.
    }
    (deps.log ?? console.warn)(`[ABS live] apply ${last4(base.awb)} failed: ${error}`);
    return { outcome: "failed", ...base, error };
  }
}

// ─── Candidates and the tick pass ───────────────────────────────────────────

/** Latest decision per AWB that proposes Delivered and is not applied / suppressed. Oldest first. */
export async function listLiveCandidates(q: Q, limit: number, opts: { skipReadySince?: Date | null } = {}): Promise<Array<{ decisionId: string; awb: string }>> {
  const since = opts.skipReadySince ? opts.skipReadySince.toISOString() : null;
  const list = await rows<{ id: string; awb: string }>(
    q,
    sql`SELECT d.id, d.awb FROM (
          SELECT DISTINCT ON (awb) id, awb, decision, applied, acknowledged_at, created_at
          FROM abs_tracking_decision ORDER BY awb, last_seen_at DESC, created_at DESC
        ) d
        WHERE d.decision = 'would_mark_delivered' AND d.applied = false AND d.acknowledged_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM abs_live_application a WHERE a.decision_id = d.id AND a.outcome = 'applied')
          AND (${since}::timestamptz IS NULL OR NOT EXISTS (
                SELECT 1 FROM abs_live_application a WHERE a.decision_id = d.id AND a.outcome = 'skipped'
                  AND a.reason_code = 'awaiting_approval' AND a.last_seen_at >= ${since}::timestamptz))
        ORDER BY d.created_at ASC
        LIMIT ${limit}`,
  );
  return list.map((r) => ({ decisionId: r.id, awb: r.awb }));
}

export interface LivePassReport {
  ran: boolean;
  paused: boolean;
  evaluated: number;
  applied: number;
  ready: number;
  skipped: number;
  failed: number;
  capHit: boolean;
  appliedOrders: number[];
  failures: Array<{ awbLast4: string; orderNumber: number | null }>;
}

/** History requests per tick (each is one GET to ABS). */
export const LIVE_HISTORY_CALLS_PER_TICK = 25;
/** An item already "Ready" is re-checked at most hourly by the tick (the button re-checks it anyway). */
export const READY_RECHECK_MS = 3_600_000;

/**
 * Step 7 of a tick (live mode only, after decisions are fresh): evaluate the
 * candidates; in automatic mode apply up to ABS_LIVE_MAX_PER_TICK (and the
 * Cairo-day cap); in approval mode only mark them "Ready".
 */
export async function runLivePass(deps: ApplyDeps & { shouldStop?: () => boolean }): Promise<LivePassReport> {
  const now = deps.now ?? (() => new Date());
  const report: LivePassReport = { ran: false, paused: false, evaluated: 0, applied: 0, ready: 0, skipped: 0, failed: 0, capHit: false, appliedOrders: [], failures: [] };
  const isLive = deps.isLive ?? (() => effectiveAbsTrackingMode() === "live");
  if (!isLive()) return report;
  await ensureSettingsRow(deps.db);
  if ((await getLiveSettings(deps.db)).paused) {
    report.paused = true;
    return report;
  }
  report.ran = true;
  const approval = deps.config.requireApproval;
  const candidates = await listLiveCandidates(deps.db, 200, { skipReadySince: approval ? new Date(now().getTime() - READY_RECHECK_MS) : null });
  let historyCalls = 0;
  const counting: ApplyDeps = {
    ...deps,
    fetchHistory: deps.fetchHistory
      ? async (awb) => {
          historyCalls++;
          return await (deps.fetchHistory as (a: string) => Promise<HistoryEvent[]>)(awb);
        }
      : null,
  };
  for (const c of candidates) {
    if (deps.shouldStop?.()) break;
    if (!approval && report.applied >= deps.config.maxPerTick) break;
    if (historyCalls >= LIVE_HISTORY_CALLS_PER_TICK) break;
    report.evaluated++;
    const out = await applyLiveCandidate(counting, { decisionId: c.decisionId, trigger: "auto", actor: ABS_SYSTEM_ACTOR, evaluateOnly: approval });
    if (out.outcome === "applied") {
      report.applied++;
      if (out.orderNumber !== null) report.appliedOrders.push(out.orderNumber);
    } else if (out.outcome === "ready") report.ready++;
    else if (out.outcome === "failed") {
      report.failed++;
      report.failures.push({ awbLast4: out.awb.slice(-4), orderNumber: out.orderNumber });
    } else {
      report.skipped++;
      if (out.reason === "daily_cap") {
        report.capHit = true;
        break;
      }
      if (out.reason === "paused" || out.reason === "not_live") break;
    }
  }
  return report;
}

// ─── Admin actions: approve the Ready set, approve an old one, Undo ─────────

/** Decision ids currently "Ready to mark Delivered" (approval mode), with what the screen shows. */
export async function getLiveReady(q: Q, now: Date = new Date()) {
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const list = await rows<Record<string, unknown>>(
    q,
    sql`WITH latest AS (
          SELECT DISTINCT ON (awb) id, awb, order_id, decision, applied, acknowledged_at
          FROM abs_tracking_decision ORDER BY awb, last_seen_at DESC, created_at DESC
        ), last_eval AS (
          SELECT DISTINCT ON (a.awb) a.awb, a.decision_id, a.reason_code, a.last_seen_at, a.details
          FROM abs_live_application a WHERE a.outcome IN ('skipped', 'failed')
          ORDER BY a.awb, a.last_seen_at DESC
        )
        SELECT d.id AS decision_id, d.awb, o.order_number, o.status::text AS order_status, o.total, s.collected_cash, s.delivery_date, e.last_seen_at AS checked_at
        FROM latest d
        JOIN last_eval e ON e.awb = d.awb AND e.decision_id = d.id AND e.reason_code = 'awaiting_approval'
        JOIN abs_shipment s ON s.awb = d.awb
        JOIN "order" o ON o.id = d.order_id
        WHERE d.decision = 'would_mark_delivered' AND d.applied = false AND d.acknowledged_at IS NULL
          AND e.last_seen_at >= ${since}::timestamptz
          AND o.status::text IN ('pending', 'processing', 'shipped')
        ORDER BY o.order_number`,
  );
  return list.map((r) => ({
    decisionId: String(r.decision_id),
    awb: String(r.awb),
    orderNumber: Number(r.order_number),
    orderStatus: String(r.order_status),
    total: parseMoney(r.total as string),
    collected: parseMoney(r.collected_cash as string | null),
    deliveryDate: toDate(r.delivery_date),
    checkedAt: toDate(r.checked_at),
  }));
}

/** Rows a person should look at: the latest live evaluation per AWB is an attention reason. */
export async function getLiveAttention(q: Q, now: Date = new Date()) {
  const since = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  const reasons = [...ATTENTION_REASONS];
  const list = await rows<Record<string, unknown>>(
    q,
    sql`WITH latest AS (
          SELECT DISTINCT ON (awb) id, awb, order_id, decision, applied, acknowledged_at
          FROM abs_tracking_decision ORDER BY awb, last_seen_at DESC, created_at DESC
        ), last_eval AS (
          SELECT DISTINCT ON (a.awb) a.id, a.awb, a.decision_id, a.outcome, a.reason_code, a.last_seen_at, a.details
          FROM abs_live_application a WHERE a.outcome IN ('skipped', 'failed')
          ORDER BY a.awb, a.last_seen_at DESC
        )
        SELECT e.id, e.awb, e.decision_id, e.outcome, e.reason_code, e.last_seen_at, e.details, o.id AS order_id, o.order_number, o.status::text AS order_status
        FROM last_eval e
        JOIN latest d ON d.awb = e.awb AND d.id = e.decision_id
        LEFT JOIN "order" o ON o.id = d.order_id
        WHERE d.decision = 'would_mark_delivered' AND d.applied = false AND d.acknowledged_at IS NULL
          AND e.last_seen_at >= ${since}::timestamptz
          AND (e.outcome = 'failed' OR e.reason_code IN (${sql.join(reasons.map((r) => sql`${r}`), sql`, `)}))
        ORDER BY e.last_seen_at DESC
        LIMIT 200`,
  );
  return list.map((r) => {
    const details = (r.details ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id),
      awb: String(r.awb),
      decisionId: String(r.decision_id),
      outcome: String(r.outcome),
      reason: String(r.reason_code),
      lastSeenAt: toDate(r.last_seen_at),
      orderId: (r.order_id as string) ?? null,
      orderNumber: r.order_number === null || r.order_number === undefined ? null : Number(r.order_number),
      orderStatus: (r.order_status as string) ?? null,
      alerts: Array.isArray(details.alerts) ? (details.alerts as Array<{ id: string; reasonCode: string }>) : [],
      deliveredDaysAgo: typeof details.deliveredDaysAgo === "number" ? details.deliveredDaysAgo : null,
    };
  });
}

/** Applied automatically in the last `days` days (newest first), for "Done automatically". */
export async function getLiveDone(q: Q, now: Date = new Date(), days = 7) {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const list = await rows<Record<string, unknown>>(
    q,
    sql`SELECT a.id, a.awb, a.order_id, a.from_status, a.trigger, a.actor, a.applied_at, a.cairo_day::text AS cairo_day, a.undone_at, a.undone_by,
               o.order_number, o.status::text AS order_status
        FROM abs_live_application a LEFT JOIN "order" o ON o.id = a.order_id
        WHERE a.outcome = 'applied' AND a.applied_at >= ${since}::timestamptz
        ORDER BY a.applied_at DESC LIMIT 300`,
  );
  return list.map((r) => ({
    id: String(r.id),
    awbLast4: String(r.awb).slice(-4),
    orderId: (r.order_id as string) ?? null,
    orderNumber: r.order_number === null || r.order_number === undefined ? null : Number(r.order_number),
    orderStatus: (r.order_status as string) ?? null,
    fromStatus: (r.from_status as string) ?? null,
    trigger: String(r.trigger),
    actor: String(r.actor),
    appliedAt: toDate(r.applied_at),
    cairoDay: String(r.cairo_day),
    undoneAt: toDate(r.undone_at),
    undoneBy: (r.undone_by as string) ?? null,
  }));
}

export async function liveAppliedToday(q: Q, now: Date = new Date()): Promise<number> {
  const [r] = await rows<{ n: number }>(q, sql`SELECT count(*)::int AS n FROM abs_live_application WHERE outcome = 'applied' AND cairo_day = ${cairoDay(now)}::date`);
  return Number(r?.n ?? 0);
}

/** "Mark these N Delivered": exactly the previewed ids that are still Ready; every check re-run per item. */
export async function approveReady(deps: ApplyDeps & { actor: string }, decisionIds: string[]) {
  const now = (deps.now ?? (() => new Date()))();
  if ((await getLiveSettings(deps.db)).paused) throw new LiveError("PRECONDITION_FAILED", "Live mode is paused. Resume it first.");
  const ready = new Set((await getLiveReady(deps.db, now)).map((r) => r.decisionId));
  const unique = [...new Set(decisionIds)];
  const results: Array<{ decisionId: string; outcome: string; reason?: string; orderNumber?: number | null }> = [];
  for (const id of unique) {
    if (!ready.has(id)) {
      results.push({ decisionId: id, outcome: "not_ready" });
      continue;
    }
    const out = await applyLiveCandidate(deps, { decisionId: id, trigger: "approval", actor: deps.actor });
    results.push({ decisionId: id, outcome: out.outcome, orderNumber: out.orderNumber, ...(out.outcome === "skipped" ? { reason: out.reason } : {}) });
    if (out.outcome === "skipped" && (out.reason === "daily_cap" || out.reason === "paused")) break;
  }
  return { applied: results.filter((r) => r.outcome === "applied").length, results };
}

/** "Delivered more than N days ago — approve": only the age rule is waived. */
export async function approveOld(deps: ApplyDeps & { actor: string }, decisionId: string) {
  if ((await getLiveSettings(deps.db)).paused) throw new LiveError("PRECONDITION_FAILED", "Live mode is paused. Resume it first.");
  const [last] = await rows<{ reason_code: string }>(
    deps.db,
    sql`SELECT reason_code FROM abs_live_application WHERE decision_id = ${decisionId}::uuid AND outcome = 'skipped' ORDER BY last_seen_at DESC LIMIT 1`,
  );
  if (last?.reason_code !== "too_old") throw new LiveError("PRECONDITION_FAILED", "This shipment is not waiting for an old-delivery approval.");
  const out = await applyLiveCandidate(deps, { decisionId, trigger: "approve_old", actor: deps.actor });
  return out;
}

/**
 * "Undo this automatic Delivered": back to the status it had, through the
 * same core (admin actor, note "[ABS auto-undo] …"). Only while the order is
 * still delivered and nobody changed its status since. The undone order is
 * never auto-applied again (the order "was delivered before").
 */
export async function undoApplication(deps: { db: DatabaseClient; actor: string; now?: () => Date }, input: { applicationId: string; note: string }) {
  const now = (deps.now ?? (() => new Date()))();
  return await deps.db.transaction(async (tx) => {
    const [a] = await rows<Record<string, unknown>>(
      tx,
      sql`SELECT id, awb, order_id, from_status, outcome, undone_at, order_log_id FROM abs_live_application WHERE id = ${input.applicationId}::uuid FOR UPDATE`,
    );
    if (!a || a.outcome !== "applied") throw new LiveError("NOT_FOUND", "Automatic change not found.");
    if (a.undone_at) return { changed: false };
    const orderId = a.order_id as string | null;
    if (!orderId) throw new LiveError("PRECONDITION_FAILED", "The order no longer exists.");
    const [o] = await rows<{ status: string; order_number: number }>(tx, sql`SELECT status::text AS status, order_number FROM "order" WHERE id = ${orderId}::uuid FOR UPDATE`);
    if (!o) throw new LiveError("PRECONDITION_FAILED", "The order no longer exists.");
    if (o.status !== "delivered") throw new LiveError("CONFLICT", `Order #${o.order_number} is no longer Delivered; nothing to undo.`);
    const [later] = await rows<{ n: number }>(
      tx,
      sql`SELECT count(*)::int AS n FROM order_log l
          WHERE l.order_id = ${orderId}::uuid AND l.action IN ('status_changed', 'cancelled') AND l.id <> ${a.order_log_id as string}::uuid
            AND l.created_at > (SELECT created_at FROM order_log WHERE id = ${a.order_log_id as string}::uuid)`,
    );
    if (Number(later?.n ?? 0) > 0) throw new LiveError("CONFLICT", `Order #${o.order_number} was changed after the automatic Delivered; change it on the Orders page instead.`);
    const to = String(a.from_status) as OrderStatusValue;
    const res = await applyOrderStatusChange(tx, {
      orderId,
      newStatus: to,
      actor: { kind: "user", email: deps.actor, role: "admin", note: undoNote(String(a.awb), String(a.id), to) },
    });
    await tx.execute(sql`UPDATE abs_live_application SET undone_at = ${now.toISOString()}::timestamptz, undone_by = ${deps.actor}, undo_order_log_id = ${res.orderLogId}::uuid WHERE id = ${input.applicationId}::uuid`);
    await audit(
      tx,
      { actor: deps.actor, action: "live_undo", awb: String(a.awb), orderId, before: { orderStatus: "delivered", applicationId: a.id }, after: { orderStatus: to, orderNumber: o.order_number }, note: input.note },
      now,
    );
    return { changed: true, orderNumber: o.order_number, status: to };
  });
}

/**
 * "Don't mark this one automatically": a human suppresses a would-mark-delivered
 * decision (acknowledged_at / by / ack_note on THAT decision row). Live never
 * applies a suppressed decision; a later, different decision for the AWB is a
 * new row and is evaluated again.
 */
export async function suppressDecision(deps: { db: DatabaseClient; actor: string; now?: () => Date }, input: { decisionId: string; note: string }) {
  const now = (deps.now ?? (() => new Date()))();
  return await deps.db.transaction(async (tx) => {
    const [d] = await rows<Record<string, unknown>>(
      tx,
      sql`SELECT id, awb, order_id, decision, applied, acknowledged_at FROM abs_tracking_decision WHERE id = ${input.decisionId}::uuid FOR UPDATE`,
    );
    if (!d) throw new LiveError("NOT_FOUND", "Decision not found.");
    if (d.decision !== "would_mark_delivered") throw new LiveError("BAD_REQUEST", "Only a proposed Delivered can be suppressed.");
    if (d.applied === true) throw new LiveError("CONFLICT", "This one was already marked Delivered. Use Undo instead.");
    if (d.acknowledged_at) return { changed: false };
    await tx.execute(sql`UPDATE abs_tracking_decision SET acknowledged_at = ${now.toISOString()}::timestamptz, acknowledged_by = ${deps.actor}, ack_note = ${input.note} WHERE id = ${input.decisionId}::uuid`);
    await audit(
      tx,
      { actor: deps.actor, action: "live_suppress", awb: String(d.awb), orderId: (d.order_id as string) ?? null, before: { decisionId: d.id, suppressed: false }, after: { decisionId: d.id, suppressed: true }, note: input.note },
      now,
    );
    return { changed: true };
  });
}

/** The status bar's live block (live mode only: the 0072 tables are guaranteed then). SELECT only. */
export async function getLiveOverview(q: Q, cfg: AbsTrackingConfig, now: Date = new Date()) {
  const settings = await getLiveSettings(q);
  return {
    paused: settings.paused,
    pausedAt: settings.pausedAt,
    pausedBy: settings.pausedBy,
    pauseNote: settings.pauseNote,
    appliedToday: await liveAppliedToday(q, now),
    dailyCap: cfg.live.dailyCap,
    maxPerTick: cfg.live.maxPerTick,
    requireApproval: cfg.live.requireApproval,
    settleMinutes: cfg.live.settleMinutes,
    maxAgeDays: cfg.live.maxAgeDays,
  };
}
