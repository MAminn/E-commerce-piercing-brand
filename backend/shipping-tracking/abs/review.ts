import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { absAuditLog, absOrderLink, absTrackingDecision, order } from "#root/shared/database/drizzle/schema";
import type { LinkRole, LinkState } from "./types";
import { ACKNOWLEDGEABLE } from "./validation";

/**
 * Human decisions on the ABS review screen. Each mutation:
 *   - runs in ONE transaction and locks the row it changes (FOR UPDATE);
 *   - re-validates the current state inside that transaction;
 *   - writes abs_* tables only (abs_order_link / abs_tracking_decision) — the
 *     website order is only SELECTed to resolve a number or check it exists;
 *   - writes exactly one abs_audit_log row in the same transaction;
 *   - flags the link for recompute, so the next tick (or "Check ABS now")
 *     recomputes the AWB's shadow decision in the worker, not here.
 * A repeat of an action that is already in effect is a no-op (no audit row).
 */

export type ReviewErrorCode = "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT" | "PRECONDITION_FAILED" | "TOO_MANY_REQUESTS";
export class AbsReviewError extends Error {
  readonly code: ReviewErrorCode;
  constructor(code: ReviewErrorCode, message: string) {
    super(message);
    this.name = "AbsReviewError";
    this.code = code;
  }
}

export interface ReviewResult {
  changed: boolean;
  awb?: string;
  state?: string;
  orderNumber?: number | null;
}

export const NOTE_MIN = 3;
export const NOTE_MAX = 500;
export const POLL_NOW_COOLDOWN_MS = 120_000;

interface LinkRow {
  awb: string;
  state: LinkState;
  role: LinkRole;
  orderId: string | null;
  method: string | null;
  reasonCode: string | null;
  candidates: Array<{ orderId: string; orderNumber: number }>;
}

// ─── Pure state rules (unit-tested) ─────────────────────────────────────────

export type Plan = { ok: true; noop: boolean } | { ok: false; code: ReviewErrorCode; message: string };
const refuse = (code: ReviewErrorCode, message: string): Plan => ({ ok: false, code, message });
const go = (noop = false): Plan => ({ ok: true, noop });

/** Confirm: one of the listed candidates (needs_review), or the current auto link. */
export function planConfirm(link: Pick<LinkRow, "state" | "orderId" | "candidates">, orderId: string): Plan {
  if (link.state === "confirmed") return link.orderId === orderId ? go(true) : refuse("CONFLICT", "This shipment is already confirmed to another order. Unlink it first.");
  if (link.state === "auto") return link.orderId === orderId ? go() : refuse("BAD_REQUEST", "That order is not the one this shipment is linked to.");
  if (link.state === "rejected") return refuse("PRECONDITION_FAILED", "This link was rejected. Use \"Link to another order\" or unlink it first.");
  // needs_review / unmatched
  return link.candidates.some((c) => c.orderId === orderId) ? go() : refuse("BAD_REQUEST", "That order is not one of the listed candidates. Use \"Link to another order\".");
}

export function planReject(link: Pick<LinkRow, "state">): Plan {
  return link.state === "rejected" ? go(true) : go();
}

export function planManual(link: Pick<LinkRow, "state" | "orderId" | "role">, orderId: string, role: LinkRole): Plan {
  if (link.state === "confirmed") {
    return link.orderId === orderId && link.role === role ? go(true) : refuse("CONFLICT", "This shipment is already confirmed to an order. Unlink it first.");
  }
  return go();
}

export function planUnlink(link: Pick<LinkRow, "state">): Plan {
  return link.state === "needs_review" || link.state === "unmatched" ? refuse("PRECONDITION_FAILED", "This shipment is not linked to an order.") : go();
}

export function planAcknowledge(d: { decision: string; acknowledgedAt: Date | null }): Plan {
  if (!ACKNOWLEDGEABLE.includes(d.decision)) return refuse("BAD_REQUEST", "Only alerts and return confirmations can be acknowledged.");
  return d.acknowledgedAt ? go(true) : go();
}

export function checkNote(note: string | null | undefined, required: boolean): string | null {
  const v = (note ?? "").trim();
  if (!v) {
    if (required) throw new AbsReviewError("BAD_REQUEST", "A note is required.");
    return null;
  }
  if (v.length < NOTE_MIN) throw new AbsReviewError("BAD_REQUEST", `The note must be at least ${NOTE_MIN} characters.`);
  if (v.length > NOTE_MAX) throw new AbsReviewError("BAD_REQUEST", `The note must be at most ${NOTE_MAX} characters.`);
  return v;
}

/** pollNow: at most once per 2 minutes (the last manual run is read from abs_sync_run). */
export function pollNowCooldown(lastManualStartedAt: Date | null, now: Date): { allowed: boolean; retryAfterMs: number; nextAllowedAt: Date | null } {
  if (!lastManualStartedAt) return { allowed: true, retryAfterMs: 0, nextAllowedAt: null };
  const next = lastManualStartedAt.getTime() + POLL_NOW_COOLDOWN_MS;
  const wait = next - now.getTime();
  return wait > 0 ? { allowed: false, retryAfterMs: wait, nextAllowedAt: new Date(next) } : { allowed: true, retryAfterMs: 0, nextAllowedAt: null };
}

// ─── Transactions ───────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

function unwrap(plan: Plan): boolean {
  if (!plan.ok) throw new AbsReviewError(plan.code, plan.message);
  return plan.noop;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

const last4 = (awb: string) => `…${awb.slice(-4)}`;

async function lockLink(tx: Tx, awb: string): Promise<LinkRow> {
  const [row] = await tx
    .select({
      awb: absOrderLink.awb,
      state: absOrderLink.state,
      role: absOrderLink.linkRole,
      orderId: absOrderLink.orderId,
      method: absOrderLink.method,
      reasonCode: absOrderLink.reasonCode,
      candidates: absOrderLink.candidates,
    })
    .from(absOrderLink)
    .where(eq(absOrderLink.awb, awb))
    .for("update");
  if (!row) throw new AbsReviewError("NOT_FOUND", "Shipment not found.");
  const candidates = (Array.isArray(row.candidates) ? row.candidates : []) as LinkRow["candidates"];
  return { ...row, state: row.state as LinkState, role: row.role as LinkRole, candidates };
}

/** SELECT only. */
async function readOrder(tx: Tx, by: { id: string } | { orderNumber: number }) {
  const [row] = await tx
    .select({ id: order.id, orderNumber: order.orderNumber })
    .from(order)
    .where("id" in by ? eq(order.id, by.id) : eq(order.orderNumber, by.orderNumber))
    .limit(1);
  if (!row) throw new AbsReviewError("NOT_FOUND", "Order not found.");
  return row;
}

/** One primary auto|confirmed link per order (the partial unique index), with a readable error. */
async function assertPrimarySlotFree(tx: Tx, orderId: string, orderNumber: number, awb: string) {
  const [other] = await tx
    .select({ awb: absOrderLink.awb })
    .from(absOrderLink)
    .where(and(eq(absOrderLink.orderId, orderId), eq(absOrderLink.linkRole, "primary"), inArray(absOrderLink.state, ["auto", "confirmed"]), ne(absOrderLink.awb, awb)))
    .limit(1);
  if (other) {
    throw new AbsReviewError("CONFLICT", `Order #${orderNumber} is already linked to shipment ${last4(other.awb)}. Reject or unlink that shipment first.`);
  }
}

const snapshot = (l: LinkRow, orderNumber?: number | null) => ({
  state: l.state,
  role: l.role,
  orderId: l.orderId,
  orderNumber: orderNumber ?? null,
  method: l.method,
  reasonCode: l.reasonCode,
  candidates: l.candidates.slice(0, 5).map((c) => ({ orderId: c.orderId, orderNumber: c.orderNumber })),
});

async function audit(tx: Tx, row: { actor: string; action: string; awb?: string | null; orderId?: string | null; before?: unknown; after?: unknown; note?: string | null }, now: Date) {
  await tx.insert(absAuditLog).values({
    at: now,
    actor: row.actor,
    action: row.action,
    awb: row.awb ?? null,
    orderId: row.orderId ?? null,
    before: (row.before ?? null) as Record<string, unknown> | null,
    after: (row.after ?? null) as Record<string, unknown> | null,
    note: row.note ?? null,
  });
}

async function updateLink(tx: Tx, awb: string, set: Partial<typeof absOrderLink.$inferInsert>, ctx: { orderNumber: number; awb: string }) {
  try {
    await tx.update(absOrderLink).set(set).where(eq(absOrderLink.awb, awb));
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AbsReviewError("CONFLICT", `Order #${ctx.orderNumber} is already linked to another shipment.`);
    }
    throw err;
  }
}

export interface ReviewDeps {
  db: DatabaseClient;
  actor: string;
  now?: () => Date;
}

export async function confirmLink(deps: ReviewDeps, input: { awb: string; orderId: string }): Promise<ReviewResult> {
  const now = (deps.now ?? (() => new Date()))();
  return await deps.db.transaction(async (tx) => {
    const link = await lockLink(tx, input.awb);
    if (unwrap(planConfirm(link, input.orderId))) return { changed: false, awb: link.awb, state: link.state };
    const o = await readOrder(tx, { id: input.orderId });
    if (link.role === "primary") await assertPrimarySlotFree(tx, o.id, o.orderNumber, link.awb);
    const after = { ...link, state: "confirmed" as LinkState, orderId: o.id };
    await updateLink(
      tx,
      link.awb,
      { state: "confirmed", orderId: o.id, decidedBy: deps.actor, decidedAt: now, recomputeRequestedAt: now, updatedAt: now },
      { orderNumber: o.orderNumber, awb: link.awb },
    );
    await audit(tx, { actor: deps.actor, action: "link_confirm", awb: link.awb, orderId: o.id, before: snapshot(link), after: snapshot(after, o.orderNumber) }, now);
    return { changed: true, awb: link.awb, state: "confirmed", orderNumber: o.orderNumber };
  });
}

export async function rejectLink(deps: ReviewDeps, input: { awb: string; note: string }): Promise<ReviewResult> {
  const note = checkNote(input.note, true);
  const now = (deps.now ?? (() => new Date()))();
  return await deps.db.transaction(async (tx) => {
    const link = await lockLink(tx, input.awb);
    if (unwrap(planReject(link))) return { changed: false, awb: link.awb, state: link.state };
    const after = { ...link, state: "rejected" as LinkState, orderId: null, reasonCode: "rejected_by_admin" };
    await tx
      .update(absOrderLink)
      .set({ state: "rejected", orderId: null, reasonCode: "rejected_by_admin", decidedBy: deps.actor, decidedAt: now, recomputeRequestedAt: now, updatedAt: now })
      .where(eq(absOrderLink.awb, link.awb));
    await audit(tx, { actor: deps.actor, action: "link_reject", awb: link.awb, orderId: link.orderId, before: snapshot(link), after: snapshot(after), note }, now);
    return { changed: true, awb: link.awb, state: "rejected" };
  });
}

export async function manualLink(deps: ReviewDeps, input: { awb: string; orderNumber: number; role: LinkRole; note: string }): Promise<ReviewResult> {
  const note = checkNote(input.note, true);
  const now = (deps.now ?? (() => new Date()))();
  return await deps.db.transaction(async (tx) => {
    const link = await lockLink(tx, input.awb);
    const o = await readOrder(tx, { orderNumber: input.orderNumber });
    if (unwrap(planManual(link, o.id, input.role))) return { changed: false, awb: link.awb, state: link.state, orderNumber: o.orderNumber };
    if (input.role === "primary") await assertPrimarySlotFree(tx, o.id, o.orderNumber, link.awb);
    const after = { ...link, state: "confirmed" as LinkState, role: input.role, orderId: o.id, method: "manual", reasonCode: "manual_link" };
    await updateLink(
      tx,
      link.awb,
      { state: "confirmed", linkRole: input.role, orderId: o.id, method: "manual", reasonCode: "manual_link", confidence: 100, decidedBy: deps.actor, decidedAt: now, recomputeRequestedAt: now, updatedAt: now },
      { orderNumber: o.orderNumber, awb: link.awb },
    );
    await audit(tx, { actor: deps.actor, action: "link_manual", awb: link.awb, orderId: o.id, before: snapshot(link), after: snapshot(after, o.orderNumber), note }, now);
    return { changed: true, awb: link.awb, state: "confirmed", orderNumber: o.orderNumber };
  });
}

/** Back to needs_review: the matcher may PROPOSE again on the next tick (never auto-link a human-touched AWB). */
export async function unlink(deps: ReviewDeps, input: { awb: string; note: string }): Promise<ReviewResult> {
  const note = checkNote(input.note, true);
  const now = (deps.now ?? (() => new Date()))();
  return await deps.db.transaction(async (tx) => {
    const link = await lockLink(tx, input.awb);
    unwrap(planUnlink(link));
    const after = { ...link, state: "needs_review" as LinkState, orderId: null, reasonCode: "unlinked_by_admin" };
    // Only THIS AWB's row: other AWBs' links (confirmed or not) are never touched.
    await tx
      .update(absOrderLink)
      .set({ state: "needs_review", orderId: null, reasonCode: "unlinked_by_admin", decidedBy: deps.actor, decidedAt: now, recomputeRequestedAt: now, updatedAt: now })
      .where(eq(absOrderLink.awb, link.awb));
    await audit(tx, { actor: deps.actor, action: "link_unlink", awb: link.awb, orderId: link.orderId, before: snapshot(link), after: snapshot(after), note }, now);
    return { changed: true, awb: link.awb, state: "needs_review" };
  });
}

/**
 * Alerts and needs_return_confirmation only. Acknowledging hides THIS row
 * (this dedupe key) from the open lists; a new decision for the same AWB is a
 * new row and is never hidden by an older acknowledgement.
 */
export async function acknowledgeDecision(deps: ReviewDeps, input: { decisionId: string; note: string }): Promise<ReviewResult> {
  const note = checkNote(input.note, true);
  const now = (deps.now ?? (() => new Date()))();
  return await deps.db.transaction(async (tx) => {
    const [d] = await tx
      .select({
        id: absTrackingDecision.id,
        awb: absTrackingDecision.awb,
        orderId: absTrackingDecision.orderId,
        decision: absTrackingDecision.decision,
        reasonCode: absTrackingDecision.reasonCode,
        acknowledgedAt: absTrackingDecision.acknowledgedAt,
      })
      .from(absTrackingDecision)
      .where(eq(absTrackingDecision.id, input.decisionId))
      .for("update");
    if (!d) throw new AbsReviewError("NOT_FOUND", "Decision not found.");
    if (unwrap(planAcknowledge(d))) return { changed: false, awb: d.awb };
    await tx
      .update(absTrackingDecision)
      .set({ acknowledgedAt: now, acknowledgedBy: deps.actor, ackNote: note })
      .where(and(eq(absTrackingDecision.id, d.id), sql`${absTrackingDecision.acknowledgedAt} is null`));
    await audit(
      tx,
      {
        actor: deps.actor,
        action: "alert_ack",
        awb: d.awb,
        orderId: d.orderId,
        before: { decisionId: d.id, decision: d.decision, reasonCode: d.reasonCode, acknowledgedAt: null },
        after: { decisionId: d.id, decision: d.decision, reasonCode: d.reasonCode, acknowledgedAt: now.toISOString(), acknowledgedBy: deps.actor },
        note,
      },
      now,
    );
    return { changed: true, awb: d.awb };
  });
}

/** The poll_now audit row (the tick itself is many transactions; this records who asked and what happened). */
export async function auditPollNow(db: DatabaseClient, actor: string, summary: Record<string, unknown>, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await audit(tx, { actor, action: "poll_now", after: summary }, now);
  });
}
