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
 * changes only by the single status_changed event of a confirm; checkout
 * refuses a COD order that must carry the WhatsApp tick without it and
 * stores the consent evidence with the order; the scheduler backfills a
 * consented order whose enqueue was lost (and never one without evidence);
 * and migrations 0073 / 0074 are idempotent.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

const ROOT = path.resolve(__dirname, "../../..");
const MIGRATIONS = ["0073_whatsapp_order_confirmation.sql", "0074_whatsapp_checkout_consent.sql"].map((f) => path.join(ROOT, "shared/database/migrations", f));
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
    await db.execute(sql`TRUNCATE wa_order_confirmation, wa_outbox, wa_inbound_event, wa_review_item, wa_opt_out, wa_checkout_consent`);
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

    // Apply 0073 and 0074 exactly as auto-migrate would — twice, to prove they are idempotent.
    for (let i = 0; i < 2; i++) {
      for (const file of MIGRATIONS) {
        for (const stmt of autoMigrate.splitMigrationStatements(readFileSync(file, "utf8"))) await db.execute(sql.raw(stmt));
      }
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
    await db.execute(sql`DELETE FROM abs_shipment WHERE awb LIKE 'WAIT%'`).catch(() => undefined);
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
    // The test DB has every migration (0070 included), so the ABS half must
    // really run: no swallowed insert, no conditional assertions. (The
    // abs_order_link / abs_tracking_decision AWBs reference abs_shipment.)
    const absReady = ((await db.execute(sql`SELECT to_regclass('public.abs_order_link') IS NOT NULL AS ok`)) as unknown as { rows: Array<{ ok: boolean }> }).rows[0]?.ok;
    expect(absReady, "ABS tables (migration 0070) missing from the test DB").toBe(true);
    // Order numbers restart every run: clear fixtures an interrupted run left.
    await db.execute(sql`DELETE FROM abs_shipment WHERE awb LIKE 'WAIT%'`);

    const absCases = [
      { kind: "link" as const, order: await createOrder() },
      { kind: "decision" as const, order: await createOrder() },
    ];
    for (const { kind, order: o } of absCases) {
      await enqueue(o.id);
      await tick(okFetch());
      const awb = `WAIT${kind[0]}${o.orderNumber}`;
      await db.execute(sql`INSERT INTO abs_shipment (awb, status, raw) VALUES (${awb}, 'in_transit', '{}'::jsonb)`);
      if (kind === "link") {
        await db.execute(sql`INSERT INTO abs_order_link (id, awb, order_id, link_role, state, method) VALUES (gen_random_uuid(), ${awb}, ${o.id}::uuid, 'primary', 'auto', 'reference')`);
      } else {
        await db.execute(
          sql`INSERT INTO abs_tracking_decision (id, awb, order_id, shipment_status, decision, mode, dedupe_key) VALUES (gen_random_uuid(), ${awb}, ${o.id}::uuid, 'in_transit', 'would_mark_shipped', 'shadow', ${`${TAG}${awb}`})`,
        );
      }
      expect(await store.hasAbsLink(db, o.id), kind).toBe(true);
      expect(await press(o.id, "confirm"), kind).toEqual(["button:confirm:abs_linked"]);
      expect((await orderRow(o.id))?.status, kind).toBe("pending");
      expect(await statusLogs(o.id), kind).toHaveLength(0);
      expect(await conf(o.id), kind).toMatchObject({ statusApplied: false, statusSkipReason: "abs_linked" });
      await db.execute(sql`DELETE FROM abs_shipment WHERE awb = ${awb}`); // cascades to the link / decision
      expect(await store.hasAbsLink(db, o.id), `${kind} cleaned up`).toBe(false);
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

  it("consent is enforced at send and at reply time: a row without a checkout tick is never sent and never changes the order", async () => {
    // Two shadow records made without asking (the shadow rule).
    const a = await createOrder();
    const b = await createOrder({ phone: OTHER_PHONE });
    expect(await enqueue(a.id, "shadow", false)).toEqual({ outcome: "shadow" });
    expect(await enqueue(b.id, "shadow", false)).toEqual({ outcome: "shadow" });
    expect(await conf(a.id)).toMatchObject({ consentSource: "shadow_not_asked", consentAt: null });

    // Shadow simulation (the superadmin "Sim confirm" path) never changes the order.
    expect(await press(a.id, "confirm", { mode: "shadow" })).toEqual(["button:confirm:shadow"]);
    expect((await orderRow(a.id))?.status).toBe("pending");

    // Forged: a shadow row made to look exactly like a queued send (outbox
    // pending, confirmation queued). Only the consent check stands in the way.
    await db.update(schema.waOutbox).set({ status: "pending" }).where(eq(schema.waOutbox.orderId, b.id));
    await db.update(schema.waOrderConfirmation).set({ state: "queued" }).where(eq(schema.waOrderConfirmation.orderId, b.id));
    const fetchImpl = okFetch();
    expect((await tick(fetchImpl, "live")).cancelled).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, b.id)))[0]?.status).toBe("cancelled");

    // Forged: a live reply to a row that has no consent. Never applied.
    await db.update(schema.waOrderConfirmation).set({ state: "sent", outboundWamid: "wamid.FORGED1" }).where(eq(schema.waOrderConfirmation.orderId, b.id));
    expect(await press(b.id, "confirm", { mode: "live" })).toEqual(["button:confirm:no_consent"]);
    expect((await orderRow(b.id))?.status).toBe("pending");
    expect(await statusLogs(b.id)).toHaveLength(0);
    expect(await conf(b.id)).toMatchObject({ statusApplied: false, statusSkipReason: "no_consent" });

    // Shadow records do not open staff items, even for an invalid number.
    const landline = await createOrder({ phone: "0225551234" });
    expect(await enqueue(landline.id, "shadow", false)).toEqual({ outcome: "ineligible", reason: "invalid_phone" });
    expect(await reviews(landline.id)).toHaveLength(0);
  });

  it("checkout wiring: the real order.create procedure requires the tick where it applies, records the evidence and queues; a WhatsApp failure never fails an order", async () => {
    // The real tRPC procedure + create-order service, so the input schema,
    // the consent refusal, the in-transaction evidence, the COD branch and
    // queueWhatsAppConfirmation are all exercised. The mode is the in-process
    // boot status (never WHATSAPP_CONFIRM_MODE).
    const { t } = await import("#root/shared/trpc/server");
    const { createOrderProcedure } = await import("#root/backend/orders/create-order/trpc");
    const { queueWhatsAppConfirmation } = await import("../enqueue");
    const { WHATSAPP_CONSENT_REQUIRED_MESSAGE, WHATSAPP_CONSENT_TEXTS } = await import("#root/shared/whatsapp/consent-text");
    const UA = "Mozilla/5.0 (integration test)";
    const IP = "203.0.113.7";
    const caller = t
      .router({ create: createOrderProcedure })
      .createCaller({ db, clientSession: null, emailService: { sendEmail: async () => undefined }, ipAddress: IP, userAgent: UA } as never);
    const placed: string[] = [];
    type Extra = { paymentMethod?: "cod" | "paymob"; whatsappConsentVersion?: string; whatsappConsentLocale?: "en" | "ar" };
    const attempt = async (whatsappOptIn: boolean | undefined, customerPhone: string, extra: Extra = {}) => {
      const email = `${TAG}checkout-${Date.now()}-${Math.random().toString(16).slice(2)}@wa.test`;
      const res = (await caller.create({
        customerName: "منى اختبار",
        customerEmail: email,
        customerPhone,
        shippingAddress: "1 Fixture Street",
        shippingCity: "Cairo",
        shippingState: "Cairo",
        shippingPostalCode: "11511",
        shippingCountry: "Egypt",
        items: [{ productId: seeded.productId, quantity: 1 }],
        bundles: [],
        paymentMethod: extra.paymentMethod ?? "cod",
        ...(whatsappOptIn === undefined ? {} : { whatsappOptIn }),
        ...(extra.whatsappConsentVersion === undefined ? {} : { whatsappConsentVersion: extra.whatsappConsentVersion }),
        ...(extra.whatsappConsentLocale === undefined ? {} : { whatsappConsentLocale: extra.whatsappConsentLocale }),
      } as never)) as { success: boolean; result?: { id: string; status: string }; error?: unknown };
      if (res.success) {
        placed.push(res.result?.id as string);
        createdOrders.push(res.result?.id as string);
      }
      return { res, email };
    };
    const place = async (whatsappOptIn: boolean | undefined, customerPhone = PILOT_PHONE, extra: Extra = { whatsappConsentVersion: "checkout-v2", whatsappConsentLocale: "en" }) => {
      const { res } = await attempt(whatsappOptIn, customerPhone, extra);
      expect(res.success, JSON.stringify(res.error ?? null)).toBe(true);
      expect(res.result?.status).toBe("pending");
      return res.result?.id as string;
    };
    /** Refused with the consent message, and NOTHING was written: no order, no wa_* row. */
    const expectRefused = async (whatsappOptIn: boolean | undefined, customerPhone: string) => {
      const waBefore = await db.execute(sql`SELECT (SELECT count(*) FROM wa_order_confirmation) + (SELECT count(*) FROM wa_checkout_consent) + (SELECT count(*) FROM wa_outbox) AS n`);
      const { res, email } = await attempt(whatsappOptIn, customerPhone, { whatsappConsentVersion: "checkout-v2" });
      expect(res).toEqual({ success: false, error: WHATSAPP_CONSENT_REQUIRED_MESSAGE });
      expect(await db.select({ id: schema.order.id }).from(schema.order).where(eq(schema.order.customerEmail, email))).toHaveLength(0);
      const waAfter = await db.execute(sql`SELECT (SELECT count(*) FROM wa_order_confirmation) + (SELECT count(*) FROM wa_checkout_consent) + (SELECT count(*) FROM wa_outbox) AS n`);
      expect((waAfter as unknown as { rows: unknown[] }).rows).toEqual((waBefore as unknown as { rows: unknown[] }).rows);
    };
    const evidence = async (orderId: string) => (await db.select().from(schema.waCheckoutConsent).where(eq(schema.waCheckoutConsent.orderId, orderId)))[0];
    const boot = (mode: "off" | "shadow" | "pilot" | "live") =>
      cfgMod.setWhatsAppConfirmBootStatus({ requestedMode: mode, effectiveMode: mode, tablesReady: true, problems: [], checkedAt: new Date().toISOString() });
    const outbox = async (orderId: string) => db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, orderId));
    // The service and queueWhatsAppConfirmation read the config from
    // process.env: only the pilot allow-list is needed (never the mode).
    const savedAllowlist = process.env.WHATSAPP_PILOT_ALLOWLIST;
    process.env.WHATSAPP_PILOT_ALLOWLIST = ENV.WHATSAPP_PILOT_ALLOWLIST;
    // Mandatory consent ON for the first part (the rollout switch); the
    // optional (switch off) behaviour is checked at the end.
    const savedRequired = process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED;
    const savedDetails = process.env.WHATSAPP_CONSENT_REQUEST_DETAILS;
    process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED = "true";
    Reflect.deleteProperty(process.env, "WHATSAPP_CONSENT_REQUEST_DETAILS");

    try {
      // off (the default): nothing required, nothing recorded, not even an opted-in order.
      cfgMod.setWhatsAppConfirmBootStatus(null);
      const offNoTick = await place(undefined);
      const offId = await place(true);
      for (const id of [offNoTick, offId]) {
        expect(await conf(id)).toBeUndefined();
        expect(await evidence(id)).toBeUndefined();
      }

      // shadow: the box is hidden, so nothing is required; every eligible COD
      // order is recorded for simulation WITHOUT asking — never queued.
      boot("shadow");
      const shadowNotAsked = await place(undefined);
      expect(await conf(shadowNotAsked)).toMatchObject({
        state: "shadow",
        mode: "shadow",
        phoneE164: "201009990001",
        consentSource: "shadow_not_asked",
        consentAt: null,
        consentTextVersion: null,
      });
      expect(await evidence(shadowNotAsked)).toBeUndefined();
      expect(await outbox(shadowNotAsked)).toMatchObject([{ kind: "confirm", status: "shadow_skipped", dedupeKey: `wa:confirm:${shadowNotAsked}` }]);
      // Even a tick in shadow stays a shadow record (it is recorded as given, not required).
      const shadowTicked = await place(true);
      expect(await conf(shadowTicked)).toMatchObject({ state: "shadow", consentSource: "checkout" });
      expect(await evidence(shadowTicked)).toMatchObject({ required: false, mode: "shadow" });
      expect(await outbox(shadowTicked)).toMatchObject([{ status: "shadow_skipped" }]);

      // pilot: REQUIRED for an allow-listed number; not asked for any other.
      boot("pilot");
      await expectRefused(false, PILOT_PHONE);
      await expectRefused(undefined, "+20 100 999 0001");
      const pilotTicked = await place(true, PILOT_PHONE);
      expect(await conf(pilotTicked)).toMatchObject({ state: "queued", mode: "pilot", consentSource: "checkout", consentTextVersion: "checkout-v2" });
      expect(await evidence(pilotTicked)).toMatchObject({ required: true, mode: "pilot", phoneE164: "201009990001" });
      expect(await outbox(pilotTicked)).toMatchObject([{ status: "pending" }]);
      const pilotOther = await place(false, OTHER_PHONE);
      expect(await conf(pilotOther)).toMatchObject({ state: "shadow", mode: "pilot", consentSource: "shadow_not_asked" });
      expect(await evidence(pilotOther)).toBeUndefined();
      expect(await outbox(pilotOther)).toMatchObject([{ status: "shadow_skipped" }]);

      // live: REQUIRED for every COD order to a mobile number.
      boot("live");
      await expectRefused(false, OTHER_PHONE);
      await expectRefused(undefined, OTHER_PHONE);
      const liveTicked = await place(true, OTHER_PHONE, { whatsappConsentVersion: "checkout-v2", whatsappConsentLocale: "ar" });
      const ev = await evidence(liveTicked);
      expect(ev).toMatchObject({
        phoneRaw: OTHER_PHONE,
        phoneE164: "201009990002",
        consentTextVersion: "checkout-v2",
        consentLocale: "ar",
        consentText: WHATSAPP_CONSENT_TEXTS["checkout-v2"].ar,
        required: true,
        mode: "live",
        source: "checkout",
        // Default WHATSAPP_CONSENT_REQUEST_DETAILS=anonymized: host octet zeroed, no user agent.
        ipAddress: "203.0.113.0",
        userAgent: null,
      });
      expect(ev?.orderNumber).toBe((await orderRow(liveTicked))?.orderNumber);
      const liveConf = await conf(liveTicked);
      expect(liveConf).toMatchObject({ state: "queued", mode: "live", consentSource: "checkout", consentTextVersion: "checkout-v2" });
      // The confirmation row carries the evidence's own time.
      expect(liveConf?.consentAt?.toISOString()).toBe(ev?.consentedAt.toISOString());
      // An older browser build (optional box, no version sent) that ticked: accepted, recorded as the text it showed.
      const legacyTicked = await place(true, OTHER_PHONE, {});
      expect(await evidence(legacyTicked)).toMatchObject({ consentTextVersion: "checkout-v1", consentLocale: "en", consentText: WHATSAPP_CONSENT_TEXTS["checkout-v1"].en });
      expect(await conf(legacyTicked)).toMatchObject({ state: "queued", consentTextVersion: "checkout-v1" });
      // Not required: a card payment (nothing is sent for it) and a landline.
      const liveCard = await place(undefined, OTHER_PHONE, { paymentMethod: "paymob" });
      expect(await conf(liveCard)).toBeUndefined();
      expect(await evidence(liveCard)).toBeUndefined();
      const liveCardTicked = await place(true, OTHER_PHONE, { paymentMethod: "paymob" });
      expect(await evidence(liveCardTicked)).toBeUndefined();
      const liveLandline = await place(false, "0225551234");
      // Accepted without the tick (it cannot receive WhatsApp); listed for manual confirmation.
      expect(await conf(liveLandline)).toMatchObject({ state: "ineligible", ineligibleReason: "no_consent" });
      expect(await evidence(liveLandline)).toBeUndefined();

      // The worker (mocked Graph API) sends exactly the consented orders —
      // nothing from shadow, nothing un-ticked. Running PILOT first: the
      // live-queued order for a non-allow-listed number is deferred, not sent.
      const recipients = (f: ReturnType<typeof okFetch>) => f.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body).to).sort();
      const pilotFetch = okFetch();
      const pilotTick = await tick(pilotFetch, "pilot");
      expect(recipients(pilotFetch)).toEqual(["201009990001"]);
      expect(pilotTick.deferredNotRecipient).toBe(2);
      expect((await conf(liveTicked))?.state).toBe("queued");
      // Back in live, the deferred orders go out once their retry time comes.
      const liveFetch = okFetch();
      await tick(liveFetch, "live", new Date(Date.now() + 16 * 60_000));
      expect(recipients(liveFetch)).toEqual(["201009990002", "201009990002"]);
      for (const id of [pilotTicked, liveTicked, legacyTicked]) expect((await conf(id))?.state, id).toBe("sent");
      for (const id of [shadowNotAsked, shadowTicked, pilotOther]) expect((await outbox(id))[0]?.status, id).toBe("shadow_skipped");
      // The approved template, with the three quick replies, went out.
      const body = JSON.parse((liveFetch.mock.calls[0] as unknown as [string, { body: string }])[1].body);
      expect(body).toMatchObject({ type: "template", template: { name: "order_confirmation_ar" } });
      expect(JSON.stringify(body)).toContain("wa1:c:");
      expect(JSON.stringify(body)).toContain("wa1:m:");
      expect(JSON.stringify(body)).toContain("wa1:x:");

      // End to end: the customer presses Confirm in live → pending → processing, once.
      expect(await press(liveTicked, "confirm", { mode: "live" })).toEqual(["button:confirm:applied"]);
      expect((await orderRow(liveTicked))?.status).toBe("processing");
      expect(await statusLogs(liveTicked)).toHaveLength(1);
      // Modify / Cancel on the other live order: staff items only, the order stays pending.
      expect(await press(legacyTicked, "modify", { mode: "live" })).toEqual(["button:modify:recorded"]);
      expect((await orderRow(legacyTicked))?.status).toBe("pending");
      expect((await reviews(legacyTicked)).map((r) => r.type)).toEqual(["modify"]);
      for (const id of [shadowNotAsked, shadowTicked, pilotTicked, pilotOther, liveLandline]) {
        expect((await orderRow(id))?.status, id).toBe("pending");
      }

      // ── Rollout switch OFF (WHATSAPP_CHECKOUT_CONSENT_REQUIRED unset): the
      // box is optional again, exactly as before, and confirmations still run.
      Reflect.deleteProperty(process.env, "WHATSAPP_CHECKOUT_CONSENT_REQUIRED");
      boot("live");
      const optNoTick = await place(false, OTHER_PHONE);
      expect(await conf(optNoTick)).toMatchObject({ state: "ineligible", ineligibleReason: "no_consent", consentSource: null });
      expect(await evidence(optNoTick)).toBeUndefined();
      const optAbsent = await place(undefined, OTHER_PHONE);
      expect(await conf(optAbsent)).toMatchObject({ state: "ineligible", ineligibleReason: "no_consent" });
      process.env.WHATSAPP_CONSENT_REQUEST_DETAILS = "full";
      const optTicked = await place(true, OTHER_PHONE);
      expect(await evidence(optTicked)).toMatchObject({ required: false, mode: "live", ipAddress: IP, userAgent: UA });
      expect(await conf(optTicked)).toMatchObject({ state: "queued", consentSource: "checkout" });
      process.env.WHATSAPP_CONSENT_REQUEST_DETAILS = "none";
      const optTickedNone = await place(true, OTHER_PHONE);
      expect(await evidence(optTickedNone)).toMatchObject({ ipAddress: null, userAgent: null });
      const optFetch = okFetch();
      await tick(optFetch, "live", new Date(Date.now() + 16 * 60_000));
      expect(recipients(optFetch)).toEqual(["201009990002", "201009990002"]);

      // A database error inside the WhatsApp step is swallowed, never thrown.
      await expect(queueWhatsAppConfirmation({ orderId: "not-a-uuid", whatsappOptIn: true })).resolves.toBeUndefined();
    } finally {
      cfgMod.setWhatsAppConfirmBootStatus(null);
      if (savedAllowlist === undefined) Reflect.deleteProperty(process.env, "WHATSAPP_PILOT_ALLOWLIST");
      else process.env.WHATSAPP_PILOT_ALLOWLIST = savedAllowlist;
      if (savedRequired === undefined) Reflect.deleteProperty(process.env, "WHATSAPP_CHECKOUT_CONSENT_REQUIRED");
      else process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED = savedRequired;
      if (savedDetails === undefined) Reflect.deleteProperty(process.env, "WHATSAPP_CONSENT_REQUEST_DETAILS");
      else process.env.WHATSAPP_CONSENT_REQUEST_DETAILS = savedDetails;
      // The service queued order emails for these orders; leave nothing due behind.
      if (placed.length) {
        await db.delete(schema.scheduledEmail).where(
          inArray(
            schema.scheduledEmail.dedupeKey,
            placed.flatMap((id) => [`order_confirmation:${id}`, `order_admin_notification:${id}`]),
          ),
        );
      }
    }
  });

  it("an opted-out number that ticks the box is still never messaged; staff get an item", async () => {
    const o = await createOrder({ phone: OTHER_PHONE });
    await db.insert(schema.waOptOut).values({ phoneE164: "201009990002", source: "inbound_text" });
    await db.insert(schema.waCheckoutConsent).values({
      orderId: o.id, orderNumber: o.orderNumber, phoneRaw: OTHER_PHONE, phoneE164: "201009990002",
      consentTextVersion: "checkout-v2", consentLocale: "en", consentText: "x", required: true, mode: "live", source: "checkout",
    });
    expect(await store.enqueueConfirmation(db, { orderId: o.id, whatsappOptIn: true, mode: "live", config: config() })).toEqual({ outcome: "ineligible", reason: "opted_out" });
    expect((await reviews(o.id)).map((r) => r.type)).toEqual(["ineligible"]);
    const f = okFetch();
    await tick(f, "live");
    expect(f).not.toHaveBeenCalled();
  });

  it("checkout-v3 (switch on): WhatsApp choice = opt-in, queued once; phone choice = no WhatsApp, staff call item; no choice refused; opted-out → phone fallback", async () => {
    const { t } = await import("#root/shared/trpc/server");
    const { createOrderProcedure } = await import("#root/backend/orders/create-order/trpc");
    const { WHATSAPP_CONSENT_TEXTS, WHATSAPP_CONSENT_REQUIRED_MESSAGE } = await import("#root/shared/whatsapp/consent-text");
    const caller = t
      .router({ create: createOrderProcedure })
      .createCaller({ db, clientSession: null, emailService: { sendEmail: async () => undefined }, ipAddress: "198.51.100.10", userAgent: "UA" } as never);
    const placedIds: string[] = [];
    const saved = { required: process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED, allow: process.env.WHATSAPP_PILOT_ALLOWLIST };
    process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED = "true";
    process.env.WHATSAPP_PILOT_ALLOWLIST = ENV.WHATSAPP_PILOT_ALLOWLIST;
    cfgMod.setWhatsAppConfirmBootStatus({ requestedMode: "live", effectiveMode: "live", tablesReady: true, problems: [], checkedAt: new Date().toISOString() });
    const place = async (extra: Record<string, unknown>, phone = OTHER_PHONE) => {
      const res = (await caller.create({
        customerName: "منى اختبار",
        customerEmail: `${TAG}v3-${Date.now()}-${Math.random().toString(16).slice(2)}@wa.test`,
        customerPhone: phone,
        shippingAddress: "1 Fixture Street",
        shippingCity: "Cairo",
        shippingState: "Cairo",
        shippingPostalCode: "11511",
        shippingCountry: "Egypt",
        items: [{ productId: seeded.productId, quantity: 1 }],
        bundles: [],
        paymentMethod: "cod",
        whatsappConsentVersion: "checkout-v3",
        whatsappConsentLocale: "en",
        ...extra,
      } as never)) as { success: boolean; result?: { id: string }; error?: unknown };
      if (res.success) {
        placedIds.push(res.result?.id as string);
        createdOrders.push(res.result?.id as string);
      }
      return res;
    };
    const evidence = async (id: string) => (await db.select().from(schema.waCheckoutConsent).where(eq(schema.waCheckoutConsent.orderId, id)))[0];
    const outbox = async (id: string) => db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, id));
    try {
      // No choice: refused, nothing written.
      const none = await place({ whatsappOptIn: false });
      expect(none).toEqual({ success: false, error: WHATSAPP_CONSENT_REQUIRED_MESSAGE });

      // Phone call chosen: accepted, never messaged, no consent, staff call item.
      const phone = await place({ whatsappOptIn: false, whatsappConfirmationChannel: "phone" });
      expect(phone.success).toBe(true);
      const phoneId = phone.result?.id as string;
      expect(await conf(phoneId)).toMatchObject({ state: "ineligible", ineligibleReason: "phone_requested", consentSource: null, consentAt: null });
      expect(await evidence(phoneId)).toBeUndefined();
      expect(await outbox(phoneId)).toHaveLength(0);
      expect((await reviews(phoneId)).map((r) => [r.type, r.detail])).toEqual([["ineligible", expect.stringMatching(/phone call to confirm.*call to confirm/i)]]);
      // Contradictory (tick + phone): phone wins, still no WhatsApp.
      const both = await place({ whatsappOptIn: true, whatsappConfirmationChannel: "phone" });
      expect(await conf(both.result?.id as string)).toMatchObject({ ineligibleReason: "phone_requested" });
      expect(await evidence(both.result?.id as string)).toBeUndefined();

      // WhatsApp chosen: v3 evidence (opt-in freely chosen → required=false), queued once.
      const wa = await place({ whatsappOptIn: true, whatsappConfirmationChannel: "whatsapp" });
      const waId = wa.result?.id as string;
      expect(await evidence(waId)).toMatchObject({ consentTextVersion: "checkout-v3", consentText: WHATSAPP_CONSENT_TEXTS["checkout-v3"].en, required: false });
      expect(await conf(waId)).toMatchObject({ state: "queued", consentSource: "checkout", consentTextVersion: "checkout-v3" });
      expect(await outbox(waId)).toMatchObject([{ kind: "confirm", status: "pending" }]);

      // An older page (plain tick, v2) under the switch: accepted, recorded as a required tick.
      const legacy = await place({ whatsappOptIn: true, whatsappConsentVersion: "checkout-v2" });
      expect(await evidence(legacy.result?.id as string)).toMatchObject({ consentTextVersion: "checkout-v2", required: true });

      // Opted-out number choosing WhatsApp: consent recorded as given, never messaged, staff call item.
      await db.insert(schema.waOptOut).values({ phoneE164: "201009990001", source: "inbound_text" });
      const opted = await place({ whatsappOptIn: true, whatsappConfirmationChannel: "whatsapp" }, PILOT_PHONE);
      const optedId = opted.result?.id as string;
      expect(await conf(optedId)).toMatchObject({ state: "ineligible", ineligibleReason: "opted_out" });
      expect(await outbox(optedId)).toHaveLength(0);
      expect((await reviews(optedId)).map((r) => r.type)).toEqual(["ineligible"]);

      // The worker sends exactly the two WhatsApp opt-ins; nothing for phone / opted-out orders.
      const f = okFetch();
      await tick(f, "live");
      const sentTo = f.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body).to);
      expect(sentTo).toEqual(["201009990002", "201009990002"]);
      for (const id of [phoneId, both.result?.id as string, optedId]) expect(await outbox(id), id).toHaveLength(0);
      // ...and a STOP after a v3 opt-in stops everything for that number.
      const wamid = `wamid.V3STOP${wamidSeq++}`;
      const fresh = await store.recordInboundEvents(db, [
        { kind: "message", eventKey: wamid, wamid, phoneNumberId: ENV.WHATSAPP_PHONE_NUMBER_ID, from: "201009990002", userId: null, contextId: null, messageType: "text", text: "«إيقاف»", raw: {} },
      ]);
      for (const ev of fresh) await store.processInboundEvent(db, ev, { mode: "live", config: config() });
      const later = new Date(Date.now() + 25 * HOUR);
      expect((await store.runScheduler(db, { mode: "live", config: config(), now: later })).reminders).toBe(0);
      const g = okFetch();
      await tick(g, "live", later);
      expect(g).not.toHaveBeenCalled();
    } finally {
      cfgMod.setWhatsAppConfirmBootStatus(null);
      if (saved.required === undefined) Reflect.deleteProperty(process.env, "WHATSAPP_CHECKOUT_CONSENT_REQUIRED");
      else process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED = saved.required;
      if (saved.allow === undefined) Reflect.deleteProperty(process.env, "WHATSAPP_PILOT_ALLOWLIST");
      else process.env.WHATSAPP_PILOT_ALLOWLIST = saved.allow;
      if (placedIds.length) {
        await db.delete(schema.scheduledEmail).where(
          inArray(schema.scheduledEmail.dedupeKey, placedIds.flatMap((x) => [`order_confirmation:${x}`, `order_admin_notification:${x}`])),
        );
      }
    }
  });

  it("Black Friday: a discounted COD order through the real order.create is queued exactly once, at the discounted total, only with the shopper's tick", async () => {
    const { t } = await import("#root/shared/trpc/server");
    const { createOrderProcedure } = await import("#root/backend/orders/create-order/trpc");
    const caller = t
      .router({ create: createOrderProcedure })
      .createCaller({ db, clientSession: null, emailService: { sendEmail: async () => undefined }, ipAddress: "198.51.100.9", userAgent: "UA" } as never);
    // A sale product: 200 regular, 150 on sale (25% off).
    const [salePiece] = await db
      .insert(schema.product)
      .values({ name: `${TAG}bf-piece`, description: "bf", imageId: seeded.fileId, categoryId: seeded.categoryId, price: "200.00", discountPrice: "150.00", vendorId: seeded.storeOwner, stock: 50 })
      .returning();
    const placedIds: string[] = [];
    const savedAllowlist = process.env.WHATSAPP_PILOT_ALLOWLIST;
    const savedRequired = process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED;
    process.env.WHATSAPP_PILOT_ALLOWLIST = ENV.WHATSAPP_PILOT_ALLOWLIST;
    const boot = (mode: "shadow" | "live") =>
      cfgMod.setWhatsAppConfirmBootStatus({ requestedMode: mode, effectiveMode: mode, tablesReady: true, problems: [], checkedAt: new Date().toISOString() });
    const place = async (whatsappOptIn: boolean | undefined) => {
      const res = (await caller.create({
        customerName: "منى اختبار",
        customerEmail: `${TAG}bf-${Date.now()}-${Math.random().toString(16).slice(2)}@wa.test`,
        customerPhone: OTHER_PHONE,
        shippingAddress: "1 Fixture Street",
        shippingCity: "Cairo",
        shippingState: "Cairo",
        shippingPostalCode: "11511",
        shippingCountry: "Egypt",
        items: [{ productId: salePiece?.id as string, quantity: 2 }],
        bundles: [],
        paymentMethod: "cod",
        whatsappConsentVersion: "checkout-v2",
        whatsappConsentLocale: "ar",
        ...(whatsappOptIn === undefined ? {} : { whatsappOptIn }),
      } as never)) as { success: boolean; result?: { id: string; total: string }; error?: unknown };
      if (res.success) {
        placedIds.push(res.result?.id as string);
        createdOrders.push(res.result?.id as string);
      }
      return res;
    };
    try {
      boot("live");
      // Switch OFF (default): no tick → accepted, never queued, never sent.
      Reflect.deleteProperty(process.env, "WHATSAPP_CHECKOUT_CONSENT_REQUIRED");
      const noTick = await place(false);
      expect(noTick.success).toBe(true);
      expect(await conf(noTick.result?.id as string)).toMatchObject({ state: "ineligible", ineligibleReason: "no_consent" });
      expect(await db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, noTick.result?.id as string))).toHaveLength(0);

      // Ticked: the order is priced at the sale price, and the confirmation is
      // queued exactly once with that total.
      const ticked = await place(true);
      expect(ticked.success).toBe(true);
      const id = ticked.result?.id as string;
      const row = await orderRow(id);
      expect(Number(row?.subtotal)).toBe(300); // 2 × 150, not 2 × 200
      const boxes = await db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, id));
      expect(boxes).toHaveLength(1);
      expect(boxes[0]).toMatchObject({ kind: "confirm", status: "pending", dedupeKey: `wa:confirm:${id}` });
      const totalParam = JSON.stringify(boxes[0]?.payload);
      expect(totalParam).toContain(`"${Number(row?.total).toLocaleString("en-US", { maximumFractionDigits: 2 })}"`);
      // A repeated enqueue (e.g. the backfill) never adds a second message.
      expect((await store.enqueueConfirmation(db, { orderId: id, whatsappOptIn: true, mode: "live", config: config() })).outcome).toBe("exists");
      expect((await store.runScheduler(db, { mode: "live", config: config(), now: new Date(Date.now() + 5 * 60_000) })).backfilled).toBe(0);
      expect(await db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, id))).toHaveLength(1);
      // The worker sends it once; a second tick sends nothing more.
      const f = okFetch();
      await tick(f, "live");
      await tick(f, "live");
      expect(f.mock.calls.filter((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body).to === "201009990002")).toHaveLength(1);

      // Switch ON: the same sale order without the tick is refused before anything is written.
      process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED = "true";
      const refused = await place(false);
      expect(refused.success).toBe(false);
      // Shadow: never sent, whatever the tick.
      boot("shadow");
      const shadowOrder = await place(undefined);
      expect(await conf(shadowOrder.result?.id as string)).toMatchObject({ state: "shadow" });
    } finally {
      cfgMod.setWhatsAppConfirmBootStatus(null);
      if (savedAllowlist === undefined) Reflect.deleteProperty(process.env, "WHATSAPP_PILOT_ALLOWLIST");
      else process.env.WHATSAPP_PILOT_ALLOWLIST = savedAllowlist;
      if (savedRequired === undefined) Reflect.deleteProperty(process.env, "WHATSAPP_CHECKOUT_CONSENT_REQUIRED");
      else process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED = savedRequired;
      if (placedIds.length) {
        await db.delete(schema.scheduledEmail).where(
          inArray(schema.scheduledEmail.dedupeKey, placedIds.flatMap((x) => [`order_confirmation:${x}`, `order_admin_notification:${x}`])),
        );
        await db.delete(schema.orderLog).where(inArray(schema.orderLog.orderId, placedIds));
        await db.delete(schema.orderItem).where(inArray(schema.orderItem.orderId, placedIds));
        await db.delete(schema.order).where(inArray(schema.order.id, placedIds));
        placedIds.length = 0;
      }
      if (salePiece) await db.delete(schema.product).where(eq(schema.product.id, salePiece.id));
    }
  });

  it("backfill: a consented order whose enqueue was lost is queued by the scheduler; orders without evidence (e.g. #10280–#10282) never are", async () => {
    const outbox = async (orderId: string) => db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, orderId));
    const now = new Date();
    const ago = (ms: number) => new Date(now.getTime() - ms);
    const consent = (o: { id: string; orderNumber: number }, phone: string, at: Date) =>
      db.insert(schema.waCheckoutConsent).values({
        orderId: o.id, orderNumber: o.orderNumber, phoneRaw: phone, phoneE164: `20${phone.slice(1)}`,
        consentTextVersion: "checkout-v2", consentLocale: "en", consentText: "x", required: true, mode: "live", source: "checkout", consentedAt: at,
      });
    // Lost enqueue: evidence, no confirmation row.
    const lost = await createOrder({ phone: OTHER_PHONE });
    await consent(lost, OTHER_PHONE, ago(5 * 60_000));
    // Too fresh (the post-commit enqueue may still be running) and too old (staff have it).
    const fresh = await createOrder({ phone: OTHER_PHONE });
    await consent(fresh, OTHER_PHONE, ago(30_000));
    const stale = await createOrder({ phone: OTHER_PHONE });
    await consent(stale, OTHER_PHONE, ago(25 * HOUR));
    // Like #10280–#10282: placed without the tick, already listed as no_consent.
    const noConsent = await createOrder({ phone: OTHER_PHONE });
    expect(await enqueue(noConsent.id, "live", false)).toEqual({ outcome: "ineligible", reason: "no_consent" });
    // No tick and no row at all.
    const bare = await createOrder({ phone: OTHER_PHONE });
    const before = await conf(noConsent.id);

    const report = await store.runScheduler(db, { mode: "live", config: config(), now });
    expect(report.backfilled).toBe(1);
    expect(await conf(lost.id)).toMatchObject({ state: "queued", consentSource: "checkout", consentTextVersion: "checkout-v2" });
    expect((await conf(lost.id))?.consentAt?.toISOString()).toBe(ago(5 * 60_000).toISOString());
    expect(await conf(fresh.id)).toBeUndefined();
    expect(await conf(stale.id)).toBeUndefined();
    expect(await conf(bare.id)).toBeUndefined();
    expect(await conf(noConsent.id)).toEqual(before);
    // Run again: nothing more (one confirmation per order).
    expect((await store.runScheduler(db, { mode: "live", config: config(), now })).backfilled).toBe(0);
    // The worker sends exactly the backfilled one.
    const f = okFetch();
    await tick(f, "live", now);
    expect(f).toHaveBeenCalledTimes(1);
    expect((await conf(lost.id))?.state).toBe("sent");
    expect(await outbox(noConsent.id)).toHaveLength(0);
    expect(await outbox(bare.id)).toHaveLength(0);
    // In shadow, a backfilled order is a shadow record, never sent.
    const lostShadow = await createOrder({ phone: OTHER_PHONE });
    await consent(lostShadow, OTHER_PHONE, ago(5 * 60_000));
    expect((await store.runScheduler(db, { mode: "shadow", config: config(), now })).backfilled).toBe(1);
    expect(await conf(lostShadow.id)).toMatchObject({ state: "shadow" });
  });

  it("retention: nothing is deleted unless a period is configured; then only evidence older than it (dry run first)", async () => {
    const { purgeExpiredConsentEvidence } = await import("../consent");
    const now = new Date();
    const day = 86_400_000;
    const ev = async (ageDays: number) => {
      const o = await createOrder({ phone: OTHER_PHONE });
      await db.insert(schema.waCheckoutConsent).values({
        orderId: o.id, orderNumber: o.orderNumber, phoneRaw: OTHER_PHONE, phoneE164: "201009990002",
        consentTextVersion: "checkout-v2", consentLocale: "en", consentText: "x", required: false, mode: "live", source: "checkout",
        consentedAt: new Date(now.getTime() - ageDays * day),
      });
      return o.id;
    };
    const old = await ev(400);
    const mid = await ev(100);
    const fresh = await ev(1);
    const count = async () => (await db.select({ id: schema.waCheckoutConsent.id }).from(schema.waCheckoutConsent)).length;
    expect(await count()).toBe(3);

    // Unset (the default): the scheduler and a direct call delete nothing.
    expect((await store.runScheduler(db, { mode: "live", config: config(), now })).consentPurged).toBe(0);
    expect(await purgeExpiredConsentEvidence(db, { retentionDays: null, now })).toEqual({ eligible: 0, deleted: 0 });
    // A refused value (under 30 days) is treated as unset.
    expect(cfgMod.readWhatsAppConfirmConfig({ ...ENV, WHATSAPP_CONSENT_RETENTION_DAYS: "7" }).consentRetentionDays).toBeNull();
    expect(await count()).toBe(3);

    // Dry run with 365 days: counts the 400-day-old row, deletes nothing.
    expect(await purgeExpiredConsentEvidence(db, { retentionDays: 365, now, dryRun: true })).toEqual({ eligible: 1, deleted: 0 });
    expect(await count()).toBe(3);

    // Configured: the scheduler deletes exactly the rows past the period.
    const cfg365 = cfgMod.readWhatsAppConfirmConfig({ ...ENV, WHATSAPP_CONSENT_RETENTION_DAYS: "365" });
    expect((await store.runScheduler(db, { mode: "live", config: cfg365, now })).consentPurged).toBe(1);
    const left = (await db.select({ o: schema.waCheckoutConsent.orderId }).from(schema.waCheckoutConsent)).map((r) => r.o).sort();
    expect(left).toEqual([mid, fresh].sort());
    expect(left).not.toContain(old);
    // Orders themselves are never touched by the purge.
    expect(await orderRow(old)).toBeDefined();
  });

  it("migration 0074 rollback safety: without wa_checkout_consent the feature stays off (checkout asks nothing)", async () => {
    const { initWhatsAppConfirm } = await import("../readiness");
    const saved = process.env.WHATSAPP_CONFIRM_MODE;
    await db.execute(sql`ALTER TABLE wa_checkout_consent RENAME TO wa_checkout_consent_rollback_test`);
    try {
      process.env.WHATSAPP_CONFIRM_MODE = "shadow";
      const status = await initWhatsAppConfirm(db);
      expect(status).toMatchObject({ requestedMode: "shadow", effectiveMode: "off", tablesReady: false });
      expect(status.problems.join(" ")).toMatch(/0074/);
      expect(cfgMod.effectiveWhatsAppConfirmMode()).toBe("off");
    } finally {
      await db.execute(sql`ALTER TABLE wa_checkout_consent_rollback_test RENAME TO wa_checkout_consent`);
      cfgMod.setWhatsAppConfirmBootStatus(null);
      if (saved === undefined) Reflect.deleteProperty(process.env, "WHATSAPP_CONFIRM_MODE");
      else process.env.WHATSAPP_CONFIRM_MODE = saved;
    }
    // With the table back, shadow is effective again.
    process.env.WHATSAPP_CONFIRM_MODE = "shadow";
    try {
      expect((await initWhatsAppConfirm(db)).effectiveMode).toBe("shadow");
    } finally {
      cfgMod.setWhatsAppConfirmBootStatus(null);
      if (saved === undefined) Reflect.deleteProperty(process.env, "WHATSAPP_CONFIRM_MODE");
      else process.env.WHATSAPP_CONFIRM_MODE = saved;
    }
  });

  // ─── STOP / opt-out: nothing is ever sent after a STOP (hotfix) ────────────

  /** A customer's free-text WhatsApp message, through the real inbound path. */
  const say = async (fromE164: string, text: string, mode: "shadow" | "pilot" | "live" = "pilot") => {
    const wamid = `wamid.TXT${wamidSeq++}`;
    const fresh = await store.recordInboundEvents(db, [
      { kind: "message", eventKey: wamid, wamid, phoneNumberId: ENV.WHATSAPP_PHONE_NUMBER_ID, from: fromE164, userId: null, contextId: null, messageType: "text", text, raw: {} },
    ]);
    const out: string[] = [];
    for (const ev of fresh) out.push(await store.processInboundEvent(db, ev, { mode, config: config() }));
    return out;
  };
  const optedOut = async (phone: string) => (await db.select().from(schema.waOptOut).where(eq(schema.waOptOut.phoneE164, phone))).length === 1;
  const outboxOf = async (orderId: string) => db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, orderId));
  const ALLOWED_E164 = "201009990001";

  it("STOP after the confirmation: the 24 h reminder is never queued and never sent (zero Meta calls)", async () => {
    const o = await createOrder();
    expect((await enqueue(o.id)).outcome).toBe("queued");
    const t0 = new Date();
    const first = okFetch();
    await tick(first, "pilot", t0);
    expect(first).toHaveBeenCalledTimes(1);
    expect((await conf(o.id))?.state).toBe("sent");

    expect(await say(ALLOWED_E164, "STOP")).toEqual(["message:review"]);
    expect(await optedOut(ALLOWED_E164)).toBe(true);
    // Staff are told to confirm by hand.
    expect((await reviews(o.id)).map((r) => [r.type, r.detail])).toEqual([["free_text", expect.stringMatching(/opted out.*confirm manually/i)]]);

    // 25 h later: no reminder row at all, and no call to Meta.
    const later = new Date(t0.getTime() + 25 * HOUR);
    const r = await store.runScheduler(db, { mode: "pilot", config: config(), now: later });
    expect(r.reminders).toBe(0);
    expect((await outboxOf(o.id)).map((b) => b.kind)).toEqual(["confirm"]);
    const after = okFetch();
    await tick(after, "pilot", later);
    expect(after).not.toHaveBeenCalled();
    // A button press after STOP is still honoured (it is the customer's own answer).
    expect(await press(o.id, "confirm")).toEqual(["button:confirm:applied"]);
  });

  it("STOP while a reminder is already queued: the reminder is cancelled and never sent", async () => {
    const o = await createOrder();
    await enqueue(o.id);
    const t0 = new Date();
    await tick(okFetch(), "pilot", t0);
    const later = new Date(t0.getTime() + 25 * HOUR);
    expect((await store.runScheduler(db, { mode: "pilot", config: config(), now: later })).reminders).toBe(1);
    expect((await outboxOf(o.id)).find((b) => b.kind === "reminder")?.status).toBe("pending");

    await say(ALLOWED_E164, "«إيقاف»");
    expect((await outboxOf(o.id)).find((b) => b.kind === "reminder")).toMatchObject({ status: "cancelled", lastError: "recipient opted out (STOP)" });
    const f = okFetch();
    await tick(f, "pilot", later);
    expect(f).not.toHaveBeenCalled();
  });

  it("STOP before the confirmation went out: it is cancelled, the order goes to staff, zero Meta calls", async () => {
    const o = await createOrder();
    expect((await enqueue(o.id)).outcome).toBe("queued");
    await say(ALLOWED_E164, "  Stop!  ");
    expect(await conf(o.id)).toMatchObject({ state: "ineligible", ineligibleReason: "opted_out" });
    expect(await outboxOf(o.id)).toMatchObject([{ kind: "confirm", status: "cancelled" }]);
    const f = okFetch();
    await tick(f, "pilot");
    expect(f).not.toHaveBeenCalled();
    // A later order from the same number is never queued either.
    const next = await createOrder();
    expect(await enqueue(next.id)).toEqual({ outcome: "ineligible", reason: "opted_out" });
    expect((await reviews(next.id)).map((r) => r.type)).toEqual(["ineligible"]);
  });

  it("the worker checks opt-out before EVERY send, even for a row nothing cancelled (confirmation and reminder)", async () => {
    // Opt-out written directly (as if by another path), leaving the rows pending.
    const a = await createOrder();
    await enqueue(a.id);
    await db.insert(schema.waOptOut).values({ phoneE164: ALLOWED_E164, source: "test_direct" });
    const f = okFetch();
    const rep = await tick(f, "pilot");
    expect(f).not.toHaveBeenCalled();
    expect(rep.optedOut).toBe(1);
    expect(await outboxOf(a.id)).toMatchObject([{ status: "cancelled", lastError: "recipient opted out (STOP)" }]);
    expect(await conf(a.id)).toMatchObject({ state: "ineligible", ineligibleReason: "opted_out" });
    expect((await reviews(a.id)).map((r) => r.type)).toEqual(["ineligible"]);

    // A reminder row inserted by hand for a sent confirmation: still not sent.
    await db.delete(schema.waOptOut);
    const b = await createOrder();
    await enqueue(b.id);
    const t0 = new Date();
    await tick(okFetch(), "pilot", t0);
    const later = new Date(t0.getTime() + 25 * HOUR);
    await store.runScheduler(db, { mode: "pilot", config: config(), now: later });
    await db.insert(schema.waOptOut).values({ phoneE164: ALLOWED_E164, source: "test_direct" });
    const g = okFetch();
    await tick(g, "pilot", later);
    expect(g).not.toHaveBeenCalled();
    expect((await outboxOf(b.id)).find((x) => x.kind === "reminder")?.status).toBe("cancelled");
  });

  it("a STOP that arrives while a message is being sent waits for it; nothing is sent after the STOP is recorded", async () => {
    const o = await createOrder();
    await enqueue(o.id);
    let stopDone = false;
    let stopPromise: Promise<unknown> | null = null;
    let optOutsAtCall = -1;
    const slowFetch = vi.fn(async () => {
      const [{ n }] = ((await db.execute(sql`SELECT count(*)::int AS n FROM wa_opt_out WHERE phone_e164 = ${ALLOWED_E164}`)) as unknown as { rows: Array<{ n: number }> }).rows as [{ n: number }];
      optOutsAtCall = n;
      // STOP arrives mid-send: it must wait for this send's lock.
      stopPromise = say(ALLOWED_E164, "STOP").then((r) => {
        stopDone = true;
        return r;
      });
      await new Promise((r) => setTimeout(r, 400));
      expect(stopDone).toBe(false);
      return { status: 200, text: async () => JSON.stringify({ messages: [{ id: `wamid.SLOW${wamidSeq++}` }] }) };
    });
    const t0 = new Date();
    await tick(slowFetch, "pilot", t0);
    await stopPromise;
    expect(stopDone).toBe(true);
    expect(optOutsAtCall).toBe(0);
    expect(slowFetch).toHaveBeenCalledTimes(1);
    expect(await optedOut(ALLOWED_E164)).toBe(true);
    // ...and from then on, nothing: no reminder, no call.
    const later = new Date(t0.getTime() + 25 * HOUR);
    await store.runScheduler(db, { mode: "pilot", config: config(), now: later });
    const f = okFetch();
    await tick(f, "pilot", later);
    expect(f).not.toHaveBeenCalled();
  });

  it("STOP and sends racing on many orders: Meta is never called once the opt-out exists", async () => {
    const orders = [] as Array<{ id: string }>;
    for (let i = 0; i < 6; i++) {
      const o = await createOrder();
      await enqueue(o.id);
      orders.push(o);
    }
    const seenOptOuts: number[] = [];
    const watchingFetch = vi.fn(async () => {
      const res = (await db.execute(sql`SELECT count(*)::int AS n FROM wa_opt_out WHERE phone_e164 = ${ALLOWED_E164}`)) as unknown as { rows: Array<{ n: number }> };
      seenOptOuts.push(res.rows[0]?.n ?? -1);
      return { status: 200, text: async () => JSON.stringify({ messages: [{ id: `wamid.RACE${wamidSeq++}` }] }) };
    });
    await Promise.all([tick(watchingFetch, "pilot"), say(ALLOWED_E164, "STOP"), tick(watchingFetch, "pilot")]);
    // Every call that happened saw no opt-out; every order not sent is cancelled.
    expect(seenOptOuts.every((n) => n === 0)).toBe(true);
    for (const o of orders) {
      const box = await outboxOf(o.id);
      expect(["sent", "cancelled"], o.id).toContain(box[0]?.status);
    }
    const f = okFetch();
    await tick(f, "pilot", new Date(Date.now() + 26 * HOUR));
    await store.runScheduler(db, { mode: "pilot", config: config(), now: new Date(Date.now() + 26 * HOUR) });
    await tick(f, "pilot", new Date(Date.now() + 26 * HOUR));
    expect(f).not.toHaveBeenCalled();
  });

  it("a sentence that merely contains 'stop' is not an opt-out: it goes to staff and messages continue", async () => {
    const o = await createOrder();
    await enqueue(o.id);
    const t0 = new Date();
    await tick(okFetch(), "pilot", t0);
    await say(ALLOWED_E164, "please stop sending the wrong size");
    expect(await optedOut(ALLOWED_E164)).toBe(false);
    expect((await reviews(o.id)).map((r) => r.detail)).toEqual([expect.stringMatching(/instead of using the buttons/)]);
    const later = new Date(t0.getTime() + 25 * HOUR);
    expect((await store.runScheduler(db, { mode: "pilot", config: config(), now: later })).reminders).toBe(1);
    const f = okFetch();
    await tick(f, "pilot", later);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
