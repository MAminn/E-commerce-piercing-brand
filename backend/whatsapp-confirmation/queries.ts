import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { order, waInboundEvent, waOrderConfirmation, waOutbox, waReviewItem, waSettings } from "#root/shared/database/drizzle/schema";
import { getWhatsAppConfirmBootStatus, effectiveWhatsAppConfirmMode } from "#root/shared/config/whatsapp-confirmation";
import { redactPhone } from "#root/shared/whatsapp/phone";
import { sentToday } from "./worker";

/** Admin read models for the WhatsApp Confirmations screen. SELECT-only except the three settings/review mutations. */

export const CONFIRMATION_FILTERS = ["awaiting", "follow_up", "failed", "confirmed", "requests", "ineligible", "shadow", "all"] as const;
export type ConfirmationFilter = (typeof CONFIRMATION_FILTERS)[number];

const FILTER_STATES: Record<Exclude<ConfirmationFilter, "all">, string[]> = {
  awaiting: ["queued", "sent", "delivered", "read", "reminder_sent"],
  follow_up: ["follow_up"],
  failed: ["failed"],
  confirmed: ["confirmed"],
  requests: ["modify_requested", "cancel_requested"],
  ineligible: ["ineligible"],
  shadow: ["shadow"],
};

export async function getOverview(db: DatabaseClient | null) {
  const boot = getWhatsAppConfirmBootStatus();
  const base = { mode: effectiveWhatsAppConfirmMode(), requestedMode: boot?.requestedMode ?? "off", problems: boot?.problems ?? [] };
  if (!db) return { ...base, paused: false, dailySendCap: 0, sentToday: 0, byState: {} as Record<string, number>, openReview: {} as Record<string, number> };
  const [settings] = await db.select().from(waSettings).where(eq(waSettings.id, 1));
  const byState = await db
    .select({ state: waOrderConfirmation.state, n: sql<number>`count(*)::int` })
    .from(waOrderConfirmation)
    .where(sql`${waOrderConfirmation.createdAt} > now() - interval '30 days'`)
    .groupBy(waOrderConfirmation.state);
  const open = await db
    .select({ type: waReviewItem.type, n: sql<number>`count(*)::int` })
    .from(waReviewItem)
    .where(inArray(waReviewItem.status, ["open", "in_progress"]))
    .groupBy(waReviewItem.type);
  return {
    ...base,
    paused: settings?.paused ?? false,
    dailySendCap: settings?.dailySendCap ?? 200,
    sentToday: await sentToday(db),
    byState: Object.fromEntries(byState.map((r) => [r.state, r.n])),
    openReview: Object.fromEntries(open.map((r) => [r.type, r.n])),
  };
}

export async function listConfirmations(db: DatabaseClient, filter: ConfirmationFilter, limit = 100) {
  const where = filter === "all" ? undefined : inArray(waOrderConfirmation.state, FILTER_STATES[filter]);
  const rows = await db
    .select({
      id: waOrderConfirmation.id,
      orderId: waOrderConfirmation.orderId,
      orderNumber: waOrderConfirmation.orderNumber,
      state: waOrderConfirmation.state,
      mode: waOrderConfirmation.mode,
      phone: waOrderConfirmation.phoneE164,
      ineligibleReason: waOrderConfirmation.ineligibleReason,
      response: waOrderConfirmation.response,
      statusApplied: waOrderConfirmation.statusApplied,
      statusSkipReason: waOrderConfirmation.statusSkipReason,
      wouldApply: waOrderConfirmation.wouldApply,
      sentAt: waOrderConfirmation.sentAt,
      deliveredAt: waOrderConfirmation.deliveredAt,
      readAt: waOrderConfirmation.readAt,
      respondedAt: waOrderConfirmation.respondedAt,
      reminderSentAt: waOrderConfirmation.reminderSentAt,
      lastError: waOrderConfirmation.lastError,
      createdAt: waOrderConfirmation.createdAt,
      customerName: order.customerName,
      orderStatus: order.status,
      total: order.total,
    })
    .from(waOrderConfirmation)
    .leftJoin(order, eq(order.id, waOrderConfirmation.orderId))
    .where(where)
    .orderBy(desc(waOrderConfirmation.createdAt))
    .limit(Math.min(Math.max(limit, 1), 300));
  // Staff see the full number (they must call the customer); it never goes to logs.
  return rows;
}

export async function listReviewItems(db: DatabaseClient, includeClosed = false, limit = 200) {
  return await db
    .select({
      id: waReviewItem.id,
      orderId: waReviewItem.orderId,
      type: waReviewItem.type,
      status: waReviewItem.status,
      detail: waReviewItem.detail,
      customerText: waReviewItem.customerText,
      assignedTo: waReviewItem.assignedTo,
      createdAt: waReviewItem.createdAt,
      resolvedAt: waReviewItem.resolvedAt,
      resolvedBy: waReviewItem.resolvedBy,
      note: waReviewItem.note,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      orderStatus: order.status,
      total: order.total,
    })
    .from(waReviewItem)
    .leftJoin(order, eq(order.id, waReviewItem.orderId))
    .where(includeClosed ? undefined : inArray(waReviewItem.status, ["open", "in_progress"]))
    .orderBy(desc(waReviewItem.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function resolveReviewItem(db: DatabaseClient, input: { id: string; status: "in_progress" | "done" | "dismissed"; note: string | null; actor: string }) {
  const closing = input.status !== "in_progress";
  const updated = await db
    .update(waReviewItem)
    .set({
      status: input.status,
      note: input.note,
      assignedTo: input.status === "in_progress" ? input.actor : undefined,
      resolvedAt: closing ? new Date() : null,
      resolvedBy: closing ? input.actor : null,
    })
    .where(and(eq(waReviewItem.id, input.id), inArray(waReviewItem.status, ["open", "in_progress"])))
    .returning({ id: waReviewItem.id });
  return { updated: updated.length };
}

export async function setPaused(db: DatabaseClient, paused: boolean, actor: string) {
  await db.update(waSettings).set({ paused, updatedBy: actor, updatedAt: new Date() }).where(eq(waSettings.id, 1));
  return { paused };
}

export async function setDailyCap(db: DatabaseClient, cap: number, actor: string) {
  await db.update(waSettings).set({ dailySendCap: cap, updatedBy: actor, updatedAt: new Date() }).where(eq(waSettings.id, 1));
  return { dailySendCap: cap };
}

/** Everything WhatsApp knows about one order, oldest first. Raw webhook payloads are not returned. */
export async function getOrderTimeline(db: DatabaseClient, orderId: string) {
  const [confirmation] = await db.select().from(waOrderConfirmation).where(eq(waOrderConfirmation.orderId, orderId));
  const outbox = await db
    .select({ kind: waOutbox.kind, status: waOutbox.status, attempts: waOutbox.attempts, lastErrorCode: waOutbox.lastErrorCode, lastError: waOutbox.lastError, sentAt: waOutbox.sentAt, createdAt: waOutbox.createdAt })
    .from(waOutbox)
    .where(eq(waOutbox.orderId, orderId))
    .orderBy(waOutbox.createdAt);
  const events = await db
    .select({ kind: waInboundEvent.kind, result: waInboundEvent.result, receivedAt: waInboundEvent.receivedAt })
    .from(waInboundEvent)
    .where(eq(waInboundEvent.orderId, orderId))
    .orderBy(waInboundEvent.receivedAt);
  const reviews = await db.select().from(waReviewItem).where(eq(waReviewItem.orderId, orderId)).orderBy(waReviewItem.createdAt);
  return {
    confirmation: confirmation ? { ...confirmation, token: undefined, phoneMasked: redactPhone(confirmation.phoneE164) } : null,
    outbox,
    events,
    reviews,
  };
}
