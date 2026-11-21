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

  it("checkout wiring: the real order.create procedure queues per mode and consent, and a WhatsApp failure never fails it", async () => {
    // The real tRPC procedure + create-order service, so the input schema,
    // the COD branch and queueWhatsAppConfirmation are all exercised. The mode
    // is the in-process boot status (never WHATSAPP_CONFIRM_MODE).
    const { t } = await import("#root/shared/trpc/server");
    const { createOrderProcedure } = await import("#root/backend/orders/create-order/trpc");
    const { queueWhatsAppConfirmation } = await import("../enqueue");
    const caller = t.router({ create: createOrderProcedure }).createCaller({ db, clientSession: null, emailService: { sendEmail: async () => undefined } } as never);
    const placed: string[] = [];
    const place = async (whatsappOptIn?: boolean, customerPhone = PILOT_PHONE) => {
      const res = (await caller.create({
        customerName: "منى اختبار",
        customerEmail: `${TAG}checkout-${Date.now()}-${Math.random().toString(16).slice(2)}@wa.test`,
        customerPhone,
        shippingAddress: "1 Fixture Street",
        shippingCity: "Cairo",
        shippingState: "Cairo",
        shippingPostalCode: "11511",
        shippingCountry: "Egypt",
        items: [{ productId: seeded.productId, quantity: 1 }],
        bundles: [],
        paymentMethod: "cod",
        ...(whatsappOptIn === undefined ? {} : { whatsappOptIn }),
      } as never)) as { success: boolean; result?: { id: string; status: string }; error?: unknown };
      expect(res.success, JSON.stringify(res.error ?? null)).toBe(true);
      const id = res.result?.id as string;
      placed.push(id);
      createdOrders.push(id);
      expect(res.result?.status).toBe("pending");
      return id;
    };
    const boot = (mode: "off" | "shadow" | "pilot" | "live") =>
      cfgMod.setWhatsAppConfirmBootStatus({ requestedMode: mode, effectiveMode: mode, tablesReady: true, problems: [], checkedAt: new Date().toISOString() });
    const outbox = async (orderId: string) => db.select().from(schema.waOutbox).where(eq(schema.waOutbox.orderId, orderId));
    // queueWhatsAppConfirmation reads the config from process.env: only the
    // pilot allow-list is needed here (never WHATSAPP_CONFIRM_MODE).
    const savedAllowlist = process.env.WHATSAPP_PILOT_ALLOWLIST;
    process.env.WHATSAPP_PILOT_ALLOWLIST = ENV.WHATSAPP_PILOT_ALLOWLIST;

    try {
      // off (the default): even an opted-in order leaves no wa_* row at all.
      cfgMod.setWhatsAppConfirmBootStatus(null);
      const offId = await place(true);
      expect(await conf(offId)).toBeUndefined();

      // shadow: every eligible COD order is recorded for simulation WITHOUT
      // asking (the box is hidden) — never queued for sending.
      boot("shadow");
      const shadowNotAsked = await place();
      expect(await conf(shadowNotAsked)).toMatchObject({
        state: "shadow",
        mode: "shadow",
        phoneE164: "201009990001",
        consentSource: "shadow_not_asked",
        consentAt: null,
        consentTextVersion: null,
      });
      expect(await outbox(shadowNotAsked)).toMatchObject([{ kind: "confirm", status: "shadow_skipped", dedupeKey: `wa:confirm:${shadowNotAsked}` }]);
      expect((await orderRow(shadowNotAsked))?.status).toBe("pending");
      // Even if a client sent whatsappOptIn=true (the box is hidden in shadow), it stays a shadow record.
      const shadowTicked = await place(true);
      expect(await conf(shadowTicked)).toMatchObject({ state: "shadow", consentSource: "checkout" });
      expect(await outbox(shadowTicked)).toMatchObject([{ status: "shadow_skipped" }]);

      // pilot: the allow-list decides who MAY be messaged; only the tick is consent.
      boot("pilot");
      const pilotNoTick = await place(false, PILOT_PHONE);
      expect(await conf(pilotNoTick)).toMatchObject({ state: "ineligible", ineligibleReason: "no_consent", consentSource: null, consentAt: null });
      expect(await outbox(pilotNoTick)).toHaveLength(0);
      expect(await reviews(pilotNoTick)).toHaveLength(0);
      const pilotTicked = await place(true, PILOT_PHONE);
      expect(await conf(pilotTicked)).toMatchObject({ state: "queued", mode: "pilot", consentSource: "checkout" });
      expect((await conf(pilotTicked))?.consentAt).not.toBeNull();
      expect(await outbox(pilotTicked)).toMatchObject([{ status: "pending" }]);
      const pilotOther = await place(false, OTHER_PHONE);
      expect(await conf(pilotOther)).toMatchObject({ state: "shadow", mode: "pilot", consentSource: "shadow_not_asked" });
      expect(await outbox(pilotOther)).toMatchObject([{ status: "shadow_skipped" }]);

      // live: the tick is required, for every number.
      boot("live");
      const liveNoTick = await place(false, OTHER_PHONE);
      expect(await conf(liveNoTick)).toMatchObject({ state: "ineligible", ineligibleReason: "no_consent", consentSource: null });
      expect(await outbox(liveNoTick)).toHaveLength(0);
      expect(await reviews(liveNoTick)).toHaveLength(0);
      const liveTicked = await place(true, OTHER_PHONE);
      expect(await conf(liveTicked)).toMatchObject({ state: "queued", mode: "live", consentSource: "checkout" });

      // The worker (mocked Graph API) sends exactly the two consented orders —
      // nothing from shadow, nothing un-ticked. Running PILOT first: the
      // live-queued order for a non-allow-listed number is deferred, not sent.
      const recipients = (f: ReturnType<typeof okFetch>) => f.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body).to).sort();
      const pilotFetch = okFetch();
      const pilotTick = await tick(pilotFetch, "pilot");
      expect(recipients(pilotFetch)).toEqual(["201009990001"]);
      expect(pilotTick.deferredNotRecipient).toBe(1);
      expect((await conf(liveTicked))?.state).toBe("queued");
      expect(await outbox(liveTicked)).toMatchObject([{ status: "pending", attempts: 0 }]);
      // Back in live, the deferred order goes out once its retry time comes.
      const liveFetch = okFetch();
      await tick(liveFetch, "live", new Date(Date.now() + 16 * 60_000));
      expect(recipients(liveFetch)).toEqual(["201009990002"]);
      expect((await conf(pilotTicked))?.state).toBe("sent");
      expect((await conf(liveTicked))?.state).toBe("sent");
      for (const id of [shadowNotAsked, shadowTicked, pilotOther]) expect((await outbox(id))[0]?.status, id).toBe("shadow_skipped");
      for (const id of [shadowNotAsked, shadowTicked, pilotNoTick, pilotTicked, pilotOther, liveNoTick, liveTicked]) {
        expect((await orderRow(id))?.status, id).toBe("pending");
      }

      // A database error inside the WhatsApp step is swallowed, never thrown.
      await expect(queueWhatsAppConfirmation({ orderId: "not-a-uuid", whatsappOptIn: true })).resolves.toBeUndefined();
    } finally {
      cfgMod.setWhatsAppConfirmBootStatus(null);
      if (savedAllowlist === undefined) Reflect.deleteProperty(process.env, "WHATSAPP_PILOT_ALLOWLIST");
      else process.env.WHATSAPP_PILOT_ALLOWLIST = savedAllowlist;
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
});
