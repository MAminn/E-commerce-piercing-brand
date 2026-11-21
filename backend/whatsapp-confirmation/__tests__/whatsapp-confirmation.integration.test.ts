import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like, sql } from "drizzle-orm";

/**
 * WhatsApp order confirmation against real Postgres. Meta is never called:
 * the worker gets an injected fetch. Skipped without TEST_DATABASE_URL.
 *
 * Proves: one confirmation + one outbox row per order (idempotent enqueue);
 * shadow makes ZERO HTTP calls and changes nothing outside wa_*; pilot sends
 * only to allow-listed numbers; confirm moves pending → processing exactly
 * once through the shared status core (one order_log row, "[WA auto]" note);
 * duplicate webhook deliveries and duplicate presses have no second effect;
 * modify / cancel never touch the order or stock; ABS-linked orders are not
 * changed; a late confirm on a cancelled order only opens a review item;
 * permanent / ambiguous send failures go to staff and are never re-sent;
 * reminder exactly once; follow-up after 48 h; the ERP export of an order
 * changes only by the single status_changed event of a confirm; and
 * migration 0073 is idempotent.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

const ROOT = path.resolve(__dirname, "../../..");
const MIGRATION = path.join(ROOT, "shared/database/migrations/0073_whatsapp_order_confirmation.sql");
const TAG = "wa-it-";
const HOUR = 3_600_000;
const PILOT_PHONE = "01009990001";
const OTHER_PHONE = "01009990002";
const ENV = {
  WHATSAPP_CONFIRM_MODE: "pilot",
  WHATSAPP_GRAPH_API_VERSION: "v27.0",
  WHATSAPP_PHONE_NUMBER_ID: "100000000000001",
  WHATSAPP_WABA_ID: "200000000000002",
  WHATSAPP_ACCESS_TOKEN: "integration-token-NOT-REAL",
  WHATSAPP_APP_SECRET: "integration-secret",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify",
  WHATSAPP_TEMPLATE_CONFIRM_NAME: "order_confirmation_ar",
  WHATSAPP_TEMPLATE_REMINDER_NAME: "order_reminder_ar",
  WHATSAPP_PILOT_ALLOWLIST: "201009990001",
};

describeIfDb("WhatsApp order confirmation (integration)", () => {
  type Db = import("#root/shared/database/drizzle/db").DatabaseClient;
  let db: Db;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let store: typeof import("../store");
  let worker: typeof import("../worker");
  let cfgMod: typeof import("#root/shared/config/whatsapp-confirmation");
  let autoMigrate: typeof import("#root/shared/database/auto-migrate");
  let erp: typeof import("#root/backend/erp-sync/export-service");
  let seeded: { fileId: string; categoryId: string; productId: string; storeOwner: string };
  const createdOrders: string[] = [];
  let nextNumber = 9_600_001;

  const config = () => cfgMod.readWhatsAppConfirmConfig(ENV);
  const resetWa = async () => {
    await db.execute(sql`TRUNCATE wa_order_confirmation, wa_outbox, wa_inbound_event, wa_review_item, wa_opt_out`);
    await db.execute(sql`UPDATE wa_settings SET paused = false, daily_send_cap = 200 WHERE id = 1`);
  };

  const createOrder = async (o: { phone?: string; status?: "pending" | "processing" | "shipped" | "delivered" | "cancelled"; paymentMethod?: "cod" | "paymob" } = {}) => {
    const orderNumber = nextNumber++;
    const [row] = await db
      .insert(schema.order)
      .values({
        orderNumber,
        customerName: "منى اختبار",
        customerEmail: `${TAG}${orderNumber}@wa.test`,
        customerPhone: o.phone ?? PILOT_PHONE,
        shippingAddress: "1 Fixture Street",
        shippingCity: "Cairo",
        shippingState: "Cairo",
        shippingPostalCode: "",
        shippingCountry: "Egypt",
        subtotal: "450.00",
        shipping: "0.00",
        tax: "0.00",
        total: "450.00",
        status: o.status ?? "pending",
        paymentMethod: o.paymentMethod ?? "cod",
        paymentStatus: "not_required",
      })
      .returning({ id: schema.order.id });
    const id = row?.id as string;
    createdOrders.push(id);
    await db.insert(schema.orderItem).values({ orderId: id, productId: seeded.productId, vendorId: seeded.storeOwner, name: `${TAG}piece`, price: "450.00", quantity: 2 });
    await db.insert(schema.orderLog).values({ orderId: id, action: "created" });
    return { id, orderNumber };
  };

  const enqueue = (orderId: string, mode: "shadow" | "pilot" | "live" = "pilot", whatsappOptIn = true) =>
    store.enqueueConfirmation(db, { orderId, whatsappOptIn, mode, config: config() });

  let wamidSeq = 1;
  const okFetch = () =>
    vi.fn(async () => ({ status: 200, text: async () => JSON.stringify({ messages: [{ id: `wamid.IT${wamidSeq++}` }] }) }));
  const tick = (fetchImpl: ReturnType<typeof okFetch> | ((...a: unknown[]) => Promise<unknown>), mode: "shadow" | "pilot" | "live" = "pilot", now = new Date()) =>
    worker.runSendTick({ db, mode: () => mode, config, fetchImpl: fetchImpl as never, now: () => now });

  const conf = async (orderId: string) => (await db.select().from(schema.waOrderConfirmation).where(eq(schema.waOrderConfirmation.orderId, orderId)))[0];
  const orderRow = async (id: string) => (await db.select().from(schema.order).where(eq(schema.order.id, id)))[0];
  const statusLogs = async (id: string) =>
    db.select().from(schema.orderLog).where(and(eq(schema.orderLog.orderId, id), eq(schema.orderLog.action, "status_changed")));
  const reviews = async (orderId: string) => db.select().from(schema.waReviewItem).where(eq(schema.waReviewItem.orderId, orderId));
  const stock = async () => (await db.select({ s: schema.product.stock }).from(schema.product).where(eq(schema.product.id, seeded.productId)))[0]?.s;

  const press = async (orderId: string, action: "confirm" | "modify" | "cancel", opts: { wamid?: string; mode?: "shadow" | "pilot" | "live"; from?: string | null } = {}) => {
    const c = await conf(orderId);
    const payload = (await import("../payload")).buttonPayload(action, c?.token as string);
    const wamid = opts.wamid ?? `wamid.IN${wamidSeq++}`;
    const fresh = await store.recordInboundEvents(db, [
      { kind: "button", eventKey: wamid, wamid, phoneNumberId: ENV.WHATSAPP_PHONE_NUMBER_ID, from: opts.from === undefined ? (c?.phoneE164 ?? null) : opts.from, userId: null, contextId: c?.outboundWamid ?? null, payload, text: action, raw: {} },
    ]);
    const results: string[] = [];
    for (const ev of fresh) results.push(await store.processInboundEvent(db, ev, { mode: opts.mode ?? "pilot", config: config() }));
    return results;
  };

  /** Every table except wa_*: row count + md5 over all rows. */
  const snapshotNonWa = async () => {
    const tables = (await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'wa\\_%' AND table_name <> '__drizzle_migrations'
      ORDER BY table_name`)) as unknown as { rows: Array<{ table_name: string }> };
    const out: Record<string, string> = {};
    for (const { table_name } of tables.rows) {
      const r = (await db.execute(sql.raw(`SELECT count(*)::int AS n, coalesce(md5(string_agg(md5(t::text), '' ORDER BY md5(t::text))), '-') AS h FROM "${table_name}" t`))) as unknown as {
        rows: Array<{ n: number; h: string }>;
      };
      out[table_name] = `${r.rows[0]?.n}:${r.rows[0]?.h}`;
    }
    return out;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema }) as unknown as Db;
    store = await import("../store");
    worker = await import("../worker");
    cfgMod = await import("#root/shared/config/whatsapp-confirmation");
    autoMigrate = await import("#root/shared/database/auto-migrate");
    erp = await import("#root/backend/erp-sync/export-service");

    // Apply 0073 exactly as auto-migrate would — twice, to prove it is idempotent.
    for (let i = 0; i < 2; i++) {
      for (const stmt of autoMigrate.splitMigrationStatements(readFileSync(MIGRATION, "utf8"))) await db.execute(sql.raw(stmt));
    }

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    const [cat] = await db.insert(schema.category).values({ name: `${TAG}cat`, slug: `${TAG}cat-${Date.now()}`, type: "general" }).returning();
    const [prod] = await db
      .insert(schema.product)
      .values({ name: `${TAG}piece`, description: "wa fixture", imageId: file?.id as string, categoryId: cat?.id as string, price: "225.00", vendorId: storeOwner, stock: 50 })
      .returning();
    seeded = { fileId: file?.id as string, categoryId: cat?.id as string, productId: prod?.id as string, storeOwner };
    const stale = await db.select({ id: schema.order.id }).from(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    if (stale.length) await db.delete(schema.order).where(inArray(schema.order.id, stale.map((s) => s.id)));
  }, 120_000);

  beforeEach(async () => {
    await resetWa();
  });

  afterAll(async () => {
    if (!db) return;
    await resetWa();
    if (createdOrders.length) {
      await db.delete(schema.scheduledEmail).where(inArray(schema.scheduledEmail.dedupeKey, createdOrders.map((id) => `review_check:${id}`)));
      await db.delete(schema.orderLog).where(inArray(schema.orderLog.orderId, createdOrders));
      await db.delete(schema.orderItem).where(inArray(schema.orderItem.orderId, createdOrders));
      await db.delete(schema.order).where(inArray(schema.order.id, createdOrders));
    }
    if (seeded) {
      await db.delete(schema.product).where(eq(schema.product.id, seeded.productId));
      await db.delete(schema.category).where(eq(schema.category.id, seeded.categoryId));
      await db.delete(schema.file).where(eq(schema.file.id, seeded.fileId));
    }
    await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  });

  it("enqueue is idempotent: one confirmation, one outbox row", async () => {
    const o = await createOrder();
    expect((await enqueue(o.id)).outcome).toBe("queued");
    expect((await enqueue(o.id)).outcome).toBe("exists");
    const box = await db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, o.id));
    expect(box).toHaveLength(1);
    expect(box[0]?.dedupeKey).toBe(`wa:confirm:${o.id}`);
  });

  it("ineligible orders are never queued and go to the manual list", async () => {
    const noConsent = await createOrder();
    expect(await enqueue(noConsent.id, "pilot", false)).toEqual({ outcome: "ineligible", reason: "no_consent" });
    const landline = await createOrder({ phone: "0223456789" });
    expect(await enqueue(landline.id)).toEqual({ outcome: "ineligible", reason: "invalid_phone" });
    const online = await createOrder({ paymentMethod: "paymob" });
    expect(await enqueue(online.id)).toEqual({ outcome: "ineligible", reason: "not_cod" });
    // no_consent is the normal case: listed, not queued for staff action.
    expect(await reviews(noConsent.id)).toHaveLength(0);
    expect((await reviews(landline.id)).map((r) => r.type)).toEqual(["ineligible"]);
    expect(await reviews(online.id)).toHaveLength(0);
    expect(await db.select().from(schema.waOutbox)).toHaveLength(0);
  });

  it("shadow: zero HTTP calls and nothing outside wa_* changes, even after simulated replies", async () => {
    const o = await createOrder();
    const before = await snapshotNonWa();
    const erpBefore = (await erp.getOrdersForExport(db, [o.id]))[0]?.version;
    expect((await enqueue(o.id, "shadow")).outcome).toBe("shadow");
    const fetchImpl = okFetch();
    expect((await tick(fetchImpl, "shadow")).skipped).toBe("mode_shadow");
    await press(o.id, "confirm", { mode: "shadow" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await snapshotNonWa()).toEqual(before);
    expect((await erp.getOrdersForExport(db, [o.id]))[0]?.version).toBe(erpBefore);
    expect(await conf(o.id)).toMatchObject({ state: "confirmed", statusApplied: false, statusSkipReason: "shadow", wouldApply: "apply" });
  });

  it("pilot: sends only to allow-listed numbers", async () => {
    const pilot = await createOrder();
    const other = await createOrder({ phone: OTHER_PHONE });
    await enqueue(pilot.id);
    expect((await enqueue(other.id)).outcome).toBe("shadow");
    const fetchImpl = okFetch();
    const r = await tick(fetchImpl);
    expect(r.sent).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.to).toBe("201009990001");
    expect(await conf(pilot.id)).toMatchObject({ state: "sent" });
    expect((await conf(pilot.id))?.outboundWamid).toMatch(/^wamid\.IT/);
    expect((await tick(okFetch())).claimed).toBe(0); // never sent twice
  });

  it("confirm: pending → processing exactly once, through the status core; duplicates are no-ops", async () => {
    const o = await createOrder();
    await enqueue(o.id);
    await tick(okFetch());
    const erpBefore = (await erp.getOrdersForExport(db, [o.id]))[0];
    const wamid = `wamid.DUP${Date.now()}`;
    expect(await press(o.id, "confirm", { wamid })).toEqual(["button:confirm:applied"]);
    expect(await press(o.id, "confirm", { wamid })).toEqual([]); // Meta re-delivered the same event
    expect(await press(o.id, "confirm")).toEqual(["button:confirm:duplicate"]); // customer pressed again
    expect((await orderRow(o.id))?.status).toBe("processing");
    const logs = await statusLogs(o.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ oldStatus: "pending", newStatus: "processing", userId: null });
    expect(logs[0]?.note).toMatch(/^\[WA auto\]/);
    // ERP: only the one status_changed event was added; nothing else in the export moved.
    const erpAfter = (await erp.getOrdersForExport(db, [o.id]))[0];
    expect(erpAfter?.status).toBe("processing");
    expect(erpAfter?.events.length).toBe((erpBefore?.events.length ?? 0) + 1);
    expect({ ...erpAfter, status: undefined, events: undefined, version: undefined }).toEqual({ ...erpBefore, status: undefined, events: undefined, version: undefined });
    expect(await reviews(o.id)).toHaveLength(0);
  });

  it("modify and cancel never change the order or stock; they open staff items", async () => {
    const m = await createOrder();
    const c = await createOrder();
    for (const o of [m, c]) {
      await enqueue(o.id);
    }
    await tick(okFetch());
    const stockBefore = await stock();
    await press(m.id, "modify");
    await press(c.id, "cancel");
    expect((await orderRow(m.id))?.status).toBe("pending");
    expect((await orderRow(c.id))?.status).toBe("pending");
    expect(await statusLogs(c.id)).toHaveLength(0);
    expect(await stock()).toBe(stockBefore);
    expect((await reviews(m.id)).map((r) => r.type)).toEqual(["modify"]);
    expect((await reviews(c.id)).map((r) => r.type)).toEqual(["cancel"]);
    expect(await conf(c.id)).toMatchObject({ state: "cancel_requested", response: "cancel" });
  });

  it("ABS-linked orders and late replies never change the order", async () => {
    const linked = await createOrder();
    await enqueue(linked.id);
    await tick(okFetch());
    const absReady = ((await db.execute(sql`SELECT to_regclass('public.abs_order_link') IS NOT NULL AS ok`)) as unknown as { rows: Array<{ ok: boolean }> }).rows[0]?.ok;
    if (absReady) {
      await db.execute(sql`INSERT INTO abs_order_link (id, awb, order_id, link_role, state, method) VALUES (gen_random_uuid(), ${`WAIT${linked.orderNumber}`}, ${linked.id}::uuid, 'primary', 'auto', 'reference')`).catch(() => undefined);
      if (await store.hasAbsLink(db, linked.id)) {
        await press(linked.id, "confirm");
        expect((await orderRow(linked.id))?.status).toBe("pending");
        expect(await conf(linked.id)).toMatchObject({ statusApplied: false, statusSkipReason: "abs_linked" });
      }
      await db.execute(sql`DELETE FROM abs_order_link WHERE order_id = ${linked.id}::uuid`);
    }

    const cancelled = await createOrder();
    await enqueue(cancelled.id);
    await tick(okFetch());
    await db.update(schema.order).set({ status: "cancelled" }).where(eq(schema.order.id, cancelled.id));
    await press(cancelled.id, "confirm");
    expect((await orderRow(cancelled.id))?.status).toBe("cancelled");
    expect((await reviews(cancelled.id)).map((r) => r.type)).toEqual(["late_reply"]);
  });

  it("a reply that does not match the message or number is not applied", async () => {
    const o = await createOrder();
    await enqueue(o.id);
    await tick(okFetch());
    expect(await press(o.id, "confirm", { from: "201234567890" })).toEqual(["button:mismatch"]);
    expect((await orderRow(o.id))?.status).toBe("pending");
    expect((await reviews(o.id)).map((r) => r.type)).toEqual(["unmatched"]);
  });

  it("permanent and ambiguous failures go to staff and are never re-sent", async () => {
    const bad = await createOrder();
    await enqueue(bad.id);
    await tick(vi.fn(async () => ({ status: 400, text: async () => JSON.stringify({ error: { code: 131026, message: "undeliverable" } }) })));
    expect(await conf(bad.id)).toMatchObject({ state: "failed" });
    expect((await reviews(bad.id)).map((r) => r.type)).toEqual(["failed_send"]);

    await resetWa();
    const slow = await createOrder();
    await enqueue(slow.id);
    await tick(vi.fn(async () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    expect((await db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, slow.id)))[0]?.status).toBe("failed");
    const again = okFetch();
    await tick(again);
    expect(again).not.toHaveBeenCalled();
    expect((await reviews(slow.id)).map((r) => r.type)).toEqual(["failed_send"]);
  });

  it("transient errors retry with backoff", async () => {
    const o = await createOrder();
    await enqueue(o.id);
    const now = new Date();
    const r = await tick(vi.fn(async () => ({ status: 429, text: async () => JSON.stringify({ error: { code: 130429 } }) })), "pilot", now);
    expect(r.retried).toBe(1);
    const [box] = await db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, o.id));
    expect(box?.status).toBe("pending");
    expect(box?.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("reminder exactly once after 24 h, follow-up after 48 h, superseded when staff act", async () => {
    const o = await createOrder();
    await enqueue(o.id);
    await tick(okFetch());
    await db.update(schema.waOrderConfirmation).set({ sentAt: new Date(Date.now() - 25 * HOUR) }).where(eq(schema.waOrderConfirmation.orderId, o.id));
    const ctx = { mode: "pilot" as const, config: config() };
    expect((await store.runScheduler(db, ctx)).reminders).toBe(1);
    expect((await store.runScheduler(db, ctx)).reminders).toBe(0);
    await tick(okFetch());
    expect(await conf(o.id)).toMatchObject({ state: "reminder_sent" });

    await db.update(schema.waOrderConfirmation).set({ sentAt: new Date(Date.now() - 49 * HOUR) }).where(eq(schema.waOrderConfirmation.orderId, o.id));
    expect((await store.runScheduler(db, ctx)).followUps).toBe(1);
    expect((await reviews(o.id)).map((r) => r.type)).toEqual(["no_reply_48h"]);

    await db.update(schema.order).set({ status: "processing" }).where(eq(schema.order.id, o.id));
    expect((await store.runScheduler(db, ctx)).superseded).toBe(1);
    expect(await conf(o.id)).toMatchObject({ state: "superseded" });
  });

  it("daily cap and pause stop sending", async () => {
    await db.execute(sql`UPDATE wa_settings SET daily_send_cap = 1 WHERE id = 1`);
    const a = await createOrder();
    const b = await createOrder();
    await enqueue(a.id);
    await enqueue(b.id);
    expect((await tick(okFetch())).sent).toBe(1);
    expect((await tick(okFetch())).skipped).toBe("daily_cap");

    await db.execute(sql`UPDATE wa_settings SET paused = true, daily_send_cap = 200 WHERE id = 1`);
    const fetchImpl = okFetch();
    expect((await tick(fetchImpl)).skipped).toBe("mode_shadow");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("status webhooks: delivered/read update the row; failed opens a review; callback data recovers an ambiguous send", async () => {
    const o = await createOrder();
    await enqueue(o.id);
    await tick(vi.fn(async () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    const [box] = await db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, o.id));
    const evs = await store.recordInboundEvents(db, [
      { kind: "status", eventKey: "wamid.REC:delivered", wamid: "wamid.REC", phoneNumberId: ENV.WHATSAPP_PHONE_NUMBER_ID, status: "delivered", recipient: "201009990001", callbackData: box?.id ?? null, errorCode: null, errorTitle: null, raw: {} },
    ]);
    for (const ev of evs) await store.processInboundEvent(db, ev, { mode: "pilot", config: config() });
    expect(await conf(o.id)).toMatchObject({ outboundWamid: "wamid.REC", state: "delivered" });
    expect(await press(o.id, "confirm")).toEqual(["button:confirm:applied"]);
  });

  it("events for the support number (or any other number) never act", async () => {
    const o = await createOrder();
    await enqueue(o.id);
    await tick(okFetch());
    const c = await conf(o.id);
    const payload = (await import("../payload")).buttonPayload("confirm", c?.token as string);
    for (const phoneNumberId of [cfgMod.SUPPORT_PHONE_NUMBER_ID, "123456789012345"]) {
      const wamid = `wamid.SUP${phoneNumberId}${Date.now()}`;
      const fresh = await store.recordInboundEvents(db, [
        { kind: "button", eventKey: wamid, wamid, phoneNumberId, from: c?.phoneE164 ?? null, userId: null, contextId: c?.outboundWamid ?? null, payload, text: "x", raw: {} },
      ]);
      const [res] = await Promise.all(fresh.map((ev) => store.processInboundEvent(db, ev, { mode: "pilot", config: config() })));
      expect(res).toMatch(/^ignored:/);
    }
    expect((await orderRow(o.id))?.status).toBe("pending");
    expect(await reviews(o.id)).toHaveLength(0);
  });

  it("a stored event whose processing was lost is re-run once by the scheduler", async () => {
    const o = await createOrder();
    await enqueue(o.id);
    await tick(okFetch());
    const c = await conf(o.id);
    const wamid = `wamid.LOST${Date.now()}`;
    await store.recordInboundEvents(db, [
      {
        kind: "button",
        eventKey: wamid,
        wamid,
        phoneNumberId: ENV.WHATSAPP_PHONE_NUMBER_ID,
        from: c?.phoneE164 ?? null,
        userId: null,
        contextId: c?.outboundWamid ?? null,
        payload: (await import("../payload")).buttonPayload("confirm", c?.token as string),
        text: "تأكيد الطلب",
        raw: {},
      },
    ]);
    // Simulate the crash: never processed, received 2 minutes ago.
    await db.execute(sql`UPDATE wa_inbound_event SET received_at = now() - interval '2 minutes' WHERE event_key = ${wamid}`);
    const ctx = { mode: "pilot" as const, config: config() };
    expect(await store.reprocessStaleInbound(db, ctx)).toBe(1);
    expect(await store.reprocessStaleInbound(db, ctx)).toBe(0);
    expect((await orderRow(o.id))?.status).toBe("processing");
    expect(await statusLogs(o.id)).toHaveLength(1);
  });

  it("orders placed while paused wait and are sent after resume", async () => {
    await db.execute(sql`UPDATE wa_settings SET paused = true WHERE id = 1`);
    const o = await createOrder();
    expect((await enqueue(o.id)).outcome).toBe("queued");
    const f1 = okFetch();
    await tick(f1);
    expect(f1).not.toHaveBeenCalled();
    await db.execute(sql`UPDATE wa_settings SET paused = false WHERE id = 1`);
    expect((await tick(okFetch())).sent).toBe(1);
  });
});
