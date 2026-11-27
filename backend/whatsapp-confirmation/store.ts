import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  order,
  waInboundEvent,
  waOptOut,
  waOrderConfirmation,
  waOutbox,
  waReviewItem,
  waSettings,
} from "#root/shared/database/drizzle/schema";
import { SUPPORT_PHONE_NUMBER_ID, type WhatsAppConfirmConfig, type WhatsAppConfirmMode } from "#root/shared/config/whatsapp-confirmation";
import { toWhatsAppRecipient } from "#root/shared/whatsapp/phone";
import { applyOrderStatusChange, type Tx } from "#root/backend/orders/update-order-status/apply-status-change";
import { buildTemplateMessage, newConfirmationToken, parseButtonPayload } from "./payload";
import { decideResponse } from "./decide";
import { isOptOutText, type ParsedEvent } from "./webhook-parse";
import { CONSENT_SOURCE_CHECKOUT, CONSENT_SOURCE_SHADOW_NOT_ASKED, hasCheckoutConsent, maySendTo } from "./eligibility";
import { isOptedOut, recordOptOut } from "./opt-out";
import { CONSENT_TEXT_VERSION, WA_AWAITING_STATES, WA_STATUS_NOTE_PREFIX, type WaReviewType, type WaState } from "./types";

/**
 * All wa_* reads and writes. Every function takes the database explicitly
 * (no module singleton) so tests can run it against a test database.
 *
 * Writes outside wa_* tables: exactly one — `applyOrderStatusChange`
 * (pending → processing, system actor, note "[WA auto] …") from
 * applyButtonEvent. Nothing else in this feature touches "order", order_log,
 * order_item, product, payments, couriers or the ERP export.
 */

export const DEFAULT_CONFIRM_TEMPLATE = "order_confirmation_ar";
export const DEFAULT_REMINDER_TEMPLATE = "order_reminder_ar";

type Db = DatabaseClient | Tx;

async function rows<T>(db: Db, q: ReturnType<typeof sql>): Promise<T[]> {
  const res = (await db.execute(q)) as unknown as { rows: T[] };
  return res.rows;
}

export { maySendTo };

export async function isPaused(db: Db): Promise<boolean> {
  const [row] = await db.select({ paused: waSettings.paused }).from(waSettings).where(eq(waSettings.id, 1));
  return row?.paused ?? false;
}

/** Mode after the runtime pause flag: a paused pilot/live behaves as shadow. */
export async function runtimeMode(db: Db, mode: WhatsAppConfirmMode): Promise<WhatsAppConfirmMode> {
  if (mode === "pilot" || mode === "live") return (await isPaused(db)) ? "shadow" : mode;
  return mode;
}

export async function openReviewItem(db: Db, item: { orderId: string | null; type: WaReviewType; detail: string; customerText?: string | null }): Promise<void> {
  await db
    .insert(waReviewItem)
    .values({ orderId: item.orderId, type: item.type, status: "open", detail: item.detail.slice(0, 500), customerText: item.customerText?.slice(0, 2000) ?? null })
    .onConflictDoNothing();
}

// ─── Enqueue (called after the order commits) ───────────────────────────────

export interface EnqueueInput {
  orderId: string;
  whatsappOptIn: boolean;
  mode: WhatsAppConfirmMode;
  config: WhatsAppConfirmConfig;
  now?: Date;
}

export type EnqueueResult = { outcome: "off" } | { outcome: "exists" } | { outcome: "ineligible"; reason: string } | { outcome: "queued" } | { outcome: "shadow" };

/**
 * Creates the order's confirmation row and its outbox row, once.
 * Idempotent (unique order_id / dedupe_key). The caller wraps it so it can
 * never fail a checkout.
 */
export async function enqueueConfirmation(db: DatabaseClient, input: EnqueueInput): Promise<EnqueueResult> {
  if (input.mode === "off") return { outcome: "off" };
  const now = input.now ?? new Date();
  const [o] = await db
    .select({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      total: order.total,
      paymentMethod: order.paymentMethod,
      status: order.status,
    })
    .from(order)
    .where(eq(order.id, input.orderId));
  if (!o) return { outcome: "ineligible", reason: "order_missing" };

  // The pause flag is NOT applied here: while paused the worker sends
  // nothing, and these rows wait in the outbox (the scheduler retires any
  // whose order staff handled meanwhile). Applying it here would turn every
  // order placed during a pause into a permanent, never-sent shadow row.
  const mode = input.mode;
  const phone = toWhatsAppRecipient(o.customerPhone);
  // Could this order be messaged for real in this mode (live, or pilot +
  // allow-listed)? Only those orders need — and are refused without — the
  // shopper's tick. Every other order is a shadow record that is never sent,
  // so it needs no consent (see eligibility.ts). The allow-list decides who
  // MAY be messaged; it never counts as consent.
  const realRecipient = maySendTo(mode, input.config, phone);
  const consented = input.whatsappOptIn === true;
  let ineligible: string | null = null;
  if (o.paymentMethod !== "cod") ineligible = "not_cod";
  else if (o.status !== "pending") ineligible = "not_pending";
  else if (mode === "live" && !consented) ineligible = "no_consent";
  else if (!phone) ineligible = "invalid_phone";
  else if (realRecipient && !consented) ineligible = "no_consent";
  else {
    const [opt] = await db.select({ p: waOptOut.phoneE164 }).from(waOptOut).where(eq(waOptOut.phoneE164, phone));
    if (opt) ineligible = "opted_out";
  }

  const token = newConfirmationToken();
  const send = !ineligible && realRecipient && consented;
  const state: WaState = ineligible ? "ineligible" : send ? "queued" : "shadow";
  const consentSource = consented ? CONSENT_SOURCE_CHECKOUT : state === "shadow" ? CONSENT_SOURCE_SHADOW_NOT_ASKED : null;

  return await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(waOrderConfirmation)
      .values({
        orderId: o.id,
        orderNumber: o.orderNumber,
        state,
        mode,
        phoneE164: phone,
        ineligibleReason: ineligible,
        token,
        consentAt: consented ? now : null,
        consentSource,
        consentTextVersion: consented ? CONSENT_TEXT_VERSION : null,
      })
      .onConflictDoNothing()
      .returning({ id: waOrderConfirmation.id });
    if (inserted.length === 0) return { outcome: "exists" } as const;

    if (ineligible) {
      // not_cod: online orders are paid; nothing for staff to do here.
      // no_consent is the normal case for most orders: staff already confirm
      // those by hand, so it is listed (Not sent tab) but not queued for action.
      // invalid_phone / opted_out need a staff item only when the shopper
      // actually asked for WhatsApp (ticked the box) and will not get it; a
      // shadow record made without asking is just listed.
      if (consented && (ineligible === "invalid_phone" || ineligible === "opted_out")) {
        await openReviewItem(tx, {
          orderId: o.id,
          type: "ineligible",
          detail: `${mode === "shadow" ? "[SHADOW] " : ""}No automatic WhatsApp confirmation (${ineligible}) — confirm manually`,
        });
      }
      return { outcome: "ineligible", reason: ineligible } as const;
    }

    const outboxId = randomUUID();
    const payload = buildTemplateMessage({
      kind: "confirm",
      to: phone as string,
      templateName: input.config.confirmTemplateName ?? DEFAULT_CONFIRM_TEMPLATE,
      language: input.config.templateLanguage,
      customerName: o.customerName,
      orderNumber: o.orderNumber,
      total: o.total,
      token,
      callbackData: outboxId,
    });
    await tx
      .insert(waOutbox)
      .values({
        id: outboxId,
        orderId: o.id,
        kind: "confirm",
        dedupeKey: `wa:confirm:${o.id}`,
        mode,
        status: send ? "pending" : "shadow_skipped",
        payload,
        nextAttemptAt: now,
      })
      .onConflictDoNothing();
    return send ? ({ outcome: "queued" } as const) : ({ outcome: "shadow" } as const);
  });
}

// ─── Inbound webhook events ─────────────────────────────────────────────────

export interface InboundContext {
  mode: WhatsAppConfirmMode;
  config: WhatsAppConfirmConfig;
  now?: Date;
}

/**
 * Stores each event once (unique event_key) and returns only the NEW ones —
 * Meta retries deliveries, and a retried event must have no second effect.
 */
export async function recordInboundEvents(db: DatabaseClient, events: ParsedEvent[]): Promise<ParsedEvent[]> {
  const fresh: ParsedEvent[] = [];
  for (const ev of events) {
    const from = ev.kind === "button" || ev.kind === "message" ? ev.from : ev.kind === "status" ? ev.recipient : null;
    const inserted = await db
      .insert(waInboundEvent)
      .values({
        eventKey: ev.eventKey,
        kind: ev.kind,
        wamid: "wamid" in ev ? ev.wamid : null,
        fromE164: from,
        // The parsed event itself, so an event whose processing was lost
        // (crash / restart after the 200) can be re-run by the scheduler.
        payload: JSON.parse(JSON.stringify(ev)) as object,
      })
      .onConflictDoNothing()
      .returning({ id: waInboundEvent.id });
    if (inserted.length > 0) fresh.push(ev);
  }
  return fresh;
}

async function markEvent(db: Db, eventKey: string, result: string, orderId: string | null): Promise<void> {
  await db
    .update(waInboundEvent)
    .set({ result: result.slice(0, 200), orderId, processedAt: new Date() })
    .where(eq(waInboundEvent.eventKey, eventKey));
}

export async function processInboundEvent(db: DatabaseClient, ev: ParsedEvent, ctx: InboundContext): Promise<string> {
  // Only events for OUR sender number. The support number is never acted on,
  // whatever the config says. With no sender configured, real Meta events
  // (which always carry a phone_number_id) are stored but not acted on; only
  // shadow simulations (no phone_number_id) are processed.
  if (ev.phoneNumberId === SUPPORT_PHONE_NUMBER_ID) {
    await markEvent(db, ev.eventKey, "ignored:support_number", null);
    return "ignored:support_number";
  }
  if (ev.phoneNumberId && ev.phoneNumberId !== ctx.config.phoneNumberId) {
    const why = ctx.config.phoneNumberId ? "ignored:other_number" : "ignored:no_sender_configured";
    await markEvent(db, ev.eventKey, why, null);
    return why;
  }
  switch (ev.kind) {
    case "status":
      return await applyStatusEvent(db, ev, ctx);
    case "button":
      return await applyButtonEvent(db, ev, ctx);
    case "message":
      return await applyMessageEvent(db, ev);
    default:
      await markEvent(db, ev.eventKey, `stored:${ev.field}`, null);
      return `stored:${ev.field}`;
  }
}

async function applyStatusEvent(db: DatabaseClient, ev: Extract<ParsedEvent, { kind: "status" }>, ctx: InboundContext): Promise<string> {
  const now = ctx.now ?? new Date();
  let [conf] = await db
    .select()
    .from(waOrderConfirmation)
    .where(sql`${waOrderConfirmation.outboundWamid} = ${ev.wamid} OR ${waOrderConfirmation.reminderWamid} = ${ev.wamid}`)
    .limit(1);

  // Ambiguous send: recover the wamid from biz_opaque_callback_data (= outbox id).
  if (!conf && ev.callbackData && /^[0-9a-f-]{36}$/i.test(ev.callbackData)) {
    const [box] = await db.select().from(waOutbox).where(eq(waOutbox.id, ev.callbackData));
    if (box) {
      await db.update(waOutbox).set({ wamid: ev.wamid, status: "sent", sentAt: box.sentAt ?? now, updatedAt: now }).where(eq(waOutbox.id, box.id));
      const field = box.kind === "reminder" ? { reminderWamid: ev.wamid } : { outboundWamid: ev.wamid, sentAt: box.sentAt ?? box.updatedAt };
      await db.update(waOrderConfirmation).set({ ...field, updatedAt: now }).where(eq(waOrderConfirmation.orderId, box.orderId));
      [conf] = await db.select().from(waOrderConfirmation).where(eq(waOrderConfirmation.orderId, box.orderId));
    }
  }
  if (!conf) {
    await markEvent(db, ev.eventKey, "status:unknown_message", null);
    return "status:unknown_message";
  }

  const answered = conf.response !== null;
  const set: Partial<typeof waOrderConfirmation.$inferInsert> = { updatedAt: now };
  if (ev.status === "delivered") {
    set.deliveredAt = conf.deliveredAt ?? now;
    if (!answered && (conf.state === "sent" || conf.state === "failed")) set.state = "delivered";
  } else if (ev.status === "read") {
    set.readAt = conf.readAt ?? now;
    if (!answered && ["sent", "delivered", "failed"].includes(conf.state)) set.state = "read";
  } else if (ev.status === "failed") {
    set.failedAt = now;
    set.lastError = `${ev.errorCode ?? "?"} ${ev.errorTitle ?? ""}`.trim().slice(0, 300);
    if (!answered && conf.state !== "superseded" && conf.state !== "follow_up") {
      set.state = "failed";
      await openReviewItem(db, { orderId: conf.orderId, type: "failed_send", detail: `WhatsApp could not deliver the message (${set.lastError}) — confirm manually` });
    }
  }
  await db.update(waOrderConfirmation).set(set).where(eq(waOrderConfirmation.id, conf.id));
  await markEvent(db, ev.eventKey, `status:${ev.status}`, conf.orderId);
  return `status:${ev.status}`;
}

async function applyButtonEvent(db: DatabaseClient, ev: Extract<ParsedEvent, { kind: "button" }>, ctx: InboundContext): Promise<string> {
  const now = ctx.now ?? new Date();
  const parsed = parseButtonPayload(ev.payload);
  if (!parsed) {
    await openReviewItem(db, { orderId: null, type: "unmatched", detail: "Button reply with an unknown payload", customerText: ev.text });
    await markEvent(db, ev.eventKey, "button:bad_payload", null);
    return "button:bad_payload";
  }
  const mode = await runtimeMode(db, ctx.mode);

  const result = await db.transaction(async (tx) => {
    const [conf] = await tx.select().from(waOrderConfirmation).where(eq(waOrderConfirmation.token, parsed.token)).for("update");
    if (!conf) return { result: "button:unknown_token", orderId: null as string | null, unmatched: "Button reply for an unknown confirmation" };

    // The reply must quote one of OUR messages for this order, and come from
    // the order's number when Meta tells us the number.
    const contextOk = !ev.contextId || ev.contextId === conf.outboundWamid || ev.contextId === conf.reminderWamid;
    const fromOk = !ev.from || !conf.phoneE164 || ev.from === conf.phoneE164;
    if (!contextOk || !fromOk) {
      return { result: "button:mismatch", orderId: conf.orderId, unmatched: `Button reply did not match the message/number on file (${!contextOk ? "context" : "sender"})` };
    }

    const [o] = await tx
      .select({ id: order.id, status: order.status, archivedAt: order.archivedAt })
      .from(order)
      .where(eq(order.id, conf.orderId))
      .for("update");
    const absLinked = o ? await hasAbsLink(tx, o.id) : false;

    const decision = decideResponse({
      action: parsed.action,
      // A reply may change the order only for a number this mode may message
      // AND whose row carries the shopper's own checkout consent.
      canAct: maySendTo(mode, ctx.config, conf.phoneE164),
      consented: hasCheckoutConsent(conf),
      orderStatus: (o?.status as never) ?? null,
      archived: !!o?.archivedAt,
      absLinked,
      current: { state: conf.state as WaState, response: conf.response, statusApplied: conf.statusApplied },
    });
    if (decision.noop) return { result: `button:${parsed.action}:duplicate`, orderId: conf.orderId, unmatched: null };

    let statusApplied = conf.statusApplied;
    if (decision.applyProcessing && o) {
      await applyOrderStatusChange(tx, {
        orderId: o.id,
        newStatus: "processing",
        actor: { kind: "system", note: `${WA_STATUS_NOTE_PREFIX} Customer confirmed the order on WhatsApp` },
      });
      statusApplied = true;
    }
    await tx
      .update(waOrderConfirmation)
      .set({
        state: decision.newState,
        response: decision.response,
        respondedAt: now,
        statusApplied,
        statusSkipReason: decision.applyProcessing ? null : decision.skipReason,
        wouldApply: decision.wouldApply,
        waUserId: conf.waUserId ?? ev.userId,
        resolvedAt: decision.newState === "confirmed" && !decision.review ? now : null,
        updatedAt: now,
      })
      .where(eq(waOrderConfirmation.id, conf.id));
    if (decision.review) {
      await openReviewItem(tx, {
        orderId: conf.orderId,
        type: decision.review.type,
        detail: `${mode === "shadow" ? "[SHADOW] " : ""}${decision.review.detail}`,
        customerText: ev.text,
      });
    }
    const tag = decision.applyProcessing ? "applied" : decision.skipReason ?? "recorded";
    return { result: `button:${parsed.action}:${tag}`, orderId: conf.orderId, unmatched: null };
  });

  if (result.unmatched) await openReviewItem(db, { orderId: result.orderId, type: "unmatched", detail: result.unmatched, customerText: ev.text });
  await markEvent(db, ev.eventKey, result.result, result.orderId);
  return result.result;
}

async function applyMessageEvent(db: DatabaseClient, ev: Extract<ParsedEvent, { kind: "message" }>): Promise<string> {
  // Which order is this about? The quoted message first, then the newest
  // confirmation for this number that is still open.
  let conf: typeof waOrderConfirmation.$inferSelect | undefined;
  if (ev.contextId) {
    [conf] = await db
      .select()
      .from(waOrderConfirmation)
      .where(sql`${waOrderConfirmation.outboundWamid} = ${ev.contextId} OR ${waOrderConfirmation.reminderWamid} = ${ev.contextId}`)
      .limit(1);
  }
  if (!conf && ev.from) {
    [conf] = await db.select().from(waOrderConfirmation).where(eq(waOrderConfirmation.phoneE164, ev.from)).orderBy(desc(waOrderConfirmation.createdAt)).limit(1);
  }

  const optOut = ev.from !== null && ev.from !== undefined && isOptOutText(ev.text);
  if (optOut) {
    // Recorded and everything queued for the number cancelled, in one step
    // under the recipient lock (opt-out.ts): nothing is sent after this.
    const r = await recordOptOut(db, ev.from as string, "inbound_text");
    for (const orderId of r.orderIds) {
      if (orderId === conf?.orderId) continue;
      await openReviewItem(db, { orderId, type: "ineligible", detail: "Customer opted out of WhatsApp (STOP) — confirm manually", customerText: ev.text });
    }
  }
  await openReviewItem(db, {
    orderId: conf?.orderId ?? null,
    type: conf ? "free_text" : "unmatched",
    detail: optOut
      ? "Customer opted out of WhatsApp (STOP) — no further WhatsApp messages will be sent; confirm manually"
      : conf
        ? `Customer wrote (${ev.messageType}) instead of using the buttons`
        : `Message (${ev.messageType}) from a number with no confirmation on file`,
    customerText: ev.text,
  });
  await markEvent(db, ev.eventKey, conf ? "message:review" : "message:unmatched", conf?.orderId ?? null);
  return conf ? "message:review" : "message:unmatched";
}

/** Any ABS link or decision for the order (tables exist only after migration 0070). */
export async function hasAbsLink(db: Db, orderId: string): Promise<boolean> {
  const [t] = await rows<{ ok: boolean }>(db, sql`SELECT to_regclass('public.abs_order_link') IS NOT NULL AS ok`);
  if (!t?.ok) return false;
  const [r] = await rows<{ hit: boolean }>(
    db,
    sql`SELECT EXISTS (SELECT 1 FROM abs_order_link WHERE order_id = ${orderId}::uuid)
            OR EXISTS (SELECT 1 FROM abs_tracking_decision WHERE order_id = ${orderId}::uuid) AS hit`,
  );
  return r?.hit === true;
}

// ─── Scheduler: superseded / reminder / follow-up ───────────────────────────

export interface ScheduleReport {
  superseded: number;
  reminders: number;
  followUps: number;
}

export async function runScheduler(db: DatabaseClient, ctx: InboundContext): Promise<ScheduleReport> {
  const now = ctx.now ?? new Date();
  const report: ScheduleReport = { superseded: 0, reminders: 0, followUps: 0 };
  const mode = await runtimeMode(db, ctx.mode);

  // 1. Orders that left `pending` (staff confirmed/cancelled by hand) stop being chased.
  const gone = await rows<{ id: string; order_id: string }>(
    db,
    sql`SELECT c.id, c.order_id FROM wa_order_confirmation c JOIN "order" o ON o.id = c.order_id
        WHERE c.state IN ('queued','shadow','sent','delivered','read','reminder_sent','follow_up')
          AND (o.status <> 'pending' OR o.archived_at IS NOT NULL)
        LIMIT 200`,
  );
  for (const g of gone) {
    await db.update(waOrderConfirmation).set({ state: "superseded", resolvedAt: now, updatedAt: now }).where(eq(waOrderConfirmation.id, g.id));
    await db
      .update(waOutbox)
      .set({ status: "cancelled", updatedAt: now })
      .where(and(eq(waOutbox.orderId, g.order_id), inArray(waOutbox.status, ["pending"])));
    report.superseded++;
  }

  // 2. One reminder, after reminderAfterHours of silence.
  const remindBefore = new Date(now.getTime() - ctx.config.reminderAfterHours * 3_600_000);
  const due = await db
    .select()
    .from(waOrderConfirmation)
    .where(
      and(
        inArray(waOrderConfirmation.state, ["sent", "delivered", "read"]),
        sql`${waOrderConfirmation.response} IS NULL AND ${waOrderConfirmation.reminderSentAt} IS NULL AND ${waOrderConfirmation.sentAt} < ${remindBefore.toISOString()}::timestamptz`,
      ),
    )
    .limit(50);
  for (const c of due) {
    if (!maySendTo(mode, ctx.config, c.phoneE164)) continue;
    // Never a reminder to a number that sent STOP (the worker checks again).
    if (await isOptedOut(db, c.phoneE164)) continue;
    const [o] = await db.select({ customerName: order.customerName, total: order.total }).from(order).where(eq(order.id, c.orderId));
    if (!o) continue;
    const outboxId = randomUUID();
    const inserted = await db
      .insert(waOutbox)
      .values({
        id: outboxId,
        orderId: c.orderId,
        kind: "reminder",
        dedupeKey: `wa:reminder:${c.orderId}`,
        mode,
        status: "pending",
        payload: buildTemplateMessage({
          kind: "reminder",
          to: c.phoneE164 as string,
          templateName: ctx.config.reminderTemplateName ?? DEFAULT_REMINDER_TEMPLATE,
          language: ctx.config.templateLanguage,
          customerName: o.customerName,
          orderNumber: c.orderNumber,
          total: o.total,
          token: c.token,
          callbackData: outboxId,
        }),
        nextAttemptAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: waOutbox.id });
    // reminder_sent_at marks "reminder scheduled" so it is never queued twice.
    await db.update(waOrderConfirmation).set({ reminderSentAt: now, updatedAt: now }).where(eq(waOrderConfirmation.id, c.id));
    if (inserted.length) report.reminders++;
  }

  // 3. Follow-up list after followUpAfterHours with no answer.
  const followBefore = new Date(now.getTime() - ctx.config.followUpAfterHours * 3_600_000);
  const silent = await db
    .select({ id: waOrderConfirmation.id, orderId: waOrderConfirmation.orderId })
    .from(waOrderConfirmation)
    .where(
      and(
        inArray(waOrderConfirmation.state, WA_AWAITING_STATES as unknown as string[]),
        sql`${waOrderConfirmation.response} IS NULL AND ${waOrderConfirmation.sentAt} < ${followBefore.toISOString()}::timestamptz`,
      ),
    )
    .limit(200);
  for (const c of silent) {
    await db.update(waOrderConfirmation).set({ state: "follow_up", followUpAt: now, updatedAt: now }).where(eq(waOrderConfirmation.id, c.id));
    await openReviewItem(db, { orderId: c.orderId, type: "no_reply_48h", detail: "No reply on WhatsApp — follow up manually" });
    report.followUps++;
  }
  return report;
}

/**
 * Events stored (200 returned to Meta) whose processing never finished —
 * process crash or restart between the insert and the async step. Meta will
 * not resend them, so the scheduler re-runs them once they are a minute old.
 */
export async function reprocessStaleInbound(db: DatabaseClient, ctx: InboundContext): Promise<number> {
  const stale = await db
    .select({ payload: waInboundEvent.payload })
    .from(waInboundEvent)
    // Older than a day: left for staff (the 48 h follow-up already covers the order).
    .where(sql`${waInboundEvent.processedAt} IS NULL AND ${waInboundEvent.receivedAt} < now() - interval '1 minute' AND ${waInboundEvent.receivedAt} > now() - interval '1 day'`)
    .orderBy(waInboundEvent.receivedAt)
    .limit(100);
  let n = 0;
  for (const row of stale) {
    const ev = row.payload as ParsedEvent;
    if (!ev || typeof ev !== "object" || !("kind" in ev) || !("eventKey" in ev)) continue;
    try {
      await processInboundEvent(db, ev, ctx);
      n++;
    } catch (err) {
      // Second failure: stop replaying it and hand it to staff once.
      const msg = String((err as Error)?.message ?? err).slice(0, 150);
      console.error(`[WhatsApp webhook] reprocess ${ev.kind} failed: ${msg}`);
      await markEvent(db, ev.eventKey, `failed:${msg}`, null);
      await openReviewItem(db, { orderId: null, type: "unmatched", detail: `A WhatsApp ${ev.kind} event could not be processed (${msg}) — check the chat` });
    }
  }
  return n;
}
