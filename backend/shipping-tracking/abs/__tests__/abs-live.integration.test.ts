import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, like, sql } from "drizzle-orm";

/**
 * ABS Live (Delivered only) against real Postgres. ABS is never called: ticks
 * get an injected source (list rows + /history). Skipped without
 * TEST_DATABASE_URL.
 *
 * Proves: apply once + rerun, concurrent writers, a human change between the
 * decision and the apply, pause mid-run, daily cap, approval mode (exactly the
 * previewed set, every item re-checked), approve-old, suppress, Undo, the env
 * kill switch, product / order_item / stock untouched, the review email queued
 * exactly as the admin path queues it, the ERP export version changing exactly
 * once, the no-write proofs (shadow: nothing outside abs_*; live: only the
 * target order's status + one order_log row + the review-queue rows + abs_*),
 * the admin path before / after the refactor writing the same rows, and
 * migration 0072 (idempotent, rollback PART 0).
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

const ROOT = path.resolve(__dirname, "../../../..");
const MIGRATIONS = ["0070_abs_tracking.sql", "0071_abs_tracking_review.sql", "0072_abs_live.sql"].map((f) => path.join(ROOT, "shared/database/migrations", f));
const ROLLBACK = path.join(ROOT, "docs/ABS_TRACKING_ROLLBACK.sql");
const ENV_BASE = {
  ABS_API_BASE_URL: "https://abs.example.test",
  ABS_API_KEY: "integration-key-NOT-REAL",
  ABS_BACKFILL_FROM: "2026-11-01",
};
const ENV_AUTO = { ...ENV_BASE, ABS_TRACKING_MODE: "live", ABS_LIVE_REQUIRE_APPROVAL: "false" };
const ENV_APPROVAL = { ...ENV_BASE, ABS_TRACKING_MODE: "live" };
const ADMIN_EMAIL = "live-admin@abs-live-it.test";
const ADMIN = { id: "abs-live-it-admin", email: ADMIN_EMAIL, role: "admin" as const, name: "Live Admin", phone: "", token: "t", expiresAt: new Date(Date.now() + 3_600_000) };
const HOUR = 3_600_000;
const DAY = 86_400_000;
const TAG = "abs-live-it-";

describeIfDb("ABS Live — automatic Delivered (integration)", () => {
  type Db = import("#root/shared/database/drizzle/db").DatabaseClient;
  type Shipment = import("../types").NormalizedShipment;
  type HistoryEvent = import("../parse").HistoryEvent;
  let db: Db;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let worker: typeof import("../worker");
  let live: typeof import("../live");
  let cfg: typeof import("#root/shared/config/abs-tracking");
  let readiness: typeof import("../readiness");
  let autoMigrate: typeof import("#root/shared/database/auto-migrate");
  let core: typeof import("#root/backend/orders/update-order-status/apply-status-change");
  let adminSvc: typeof import("#root/backend/orders/update-order-status/service");
  let erp: typeof import("#root/backend/erp-sync/export-service");
  let router: typeof import("../trpc");
  let seeded: { fileId: string; categoryId: string; productId: string; storeOwner: string };
  const createdOrders: string[] = [];
  let nextNumber = 9_400_001;
  let phoneSeq = 4001;

  // ── helpers ──────────────────────────────────────────────────────────────
  const resetAbs = async () => {
    await db.execute(sql`TRUNCATE abs_tracking_decision, abs_order_link, abs_shipment_status_history, abs_shipment, abs_sync_run, abs_sync_state, abs_audit_log, abs_live_application, abs_settings`);
  };

  interface Seeded {
    id: string;
    orderNumber: number;
    phone: string;
    awb: string;
    total: number;
    email: string;
  }
  const createOrder = async (o: { status?: "pending" | "processing" | "shipped" | "delivered" | "cancelled"; total?: number; paymentMethod?: "cod" | "paymob"; paymentStatus?: "not_required" | "paid" | "pending" } = {}): Promise<Seeded> => {
    const orderNumber = nextNumber++;
    const phone = `0100000${phoneSeq++}`;
    const total = o.total ?? 450;
    const email = `${TAG}${orderNumber}@abs-live.test`;
    const [row] = await db
      .insert(schema.order)
      .values({
        orderNumber,
        customerName: "Live Fixture",
        customerEmail: email,
        customerPhone: phone,
        shippingAddress: "1 Fixture Street",
        shippingCity: "Cairo",
        shippingState: "Cairo",
        shippingPostalCode: "00000",
        shippingCountry: "Egypt",
        subtotal: total.toFixed(2),
        shipping: "0.00",
        tax: "0.00",
        total: total.toFixed(2),
        status: o.status ?? "shipped",
        paymentMethod: o.paymentMethod ?? "cod",
        paymentStatus: o.paymentStatus ?? "not_required",
        createdAt: new Date(Date.now() - 2 * DAY),
      })
      .returning({ id: schema.order.id });
    const id = row?.id as string;
    createdOrders.push(id);
    await db.insert(schema.orderItem).values({ orderId: id, productId: seeded.productId, vendorId: seeded.storeOwner, name: `${TAG}piece`, price: total.toFixed(2), quantity: 2 });
    await db.insert(schema.orderLog).values({ orderId: id, action: "created" });
    return { id, orderNumber, phone, awb: `LIVE${orderNumber}`, total, email };
  };

  const shipment = (o: Seeded, p: Partial<Shipment> = {}): Shipment => {
    const norm = o.phone.slice(1);
    return {
      awb: o.awb,
      reference: String(o.orderNumber),
      cmpService: "DELIVERY",
      statusRaw: "DELIVERED",
      status: "DELIVERED",
      lastEventCode: "SHP_DLVD",
      lastReason: null,
      cash: o.total,
      collectedCash: o.total,
      absFees: 55,
      totalFees: 55,
      isPaid: false,
      paymentDate: null,
      deliveryDate: new Date(Date.now() - 3 * HOUR),
      absCreatedAt: new Date(Date.now() - DAY),
      consigneePhoneNorm: norm,
      consigneePhoneLast4: norm.slice(-4),
      consigneePhonesNorm: [norm],
      noOfPieces: 1,
      originAwb: null,
      raw: { awb: o.awb, isUnderRevision: false, status: "DELIVERED" },
      ...p,
    };
  };

  const deliveredHistory = (): HistoryEvent[] => [
    { status: "PICKED_UP", statusRaw: "Picked up", occurredAt: new Date(Date.now() - 20 * HOUR) },
    { status: "OUT_FOR_DELIVERY", statusRaw: "Out for delivery", occurredAt: new Date(Date.now() - 5 * HOUR) },
    { status: "DELIVERED", statusRaw: "Delivered", occurredAt: new Date(Date.now() - 3 * HOUR) },
  ];
  let historyFor: (awb: string) => Promise<HistoryEvent[]> = async () => deliveredHistory();
  let historyCalls = 0;
  const source = (rows: Shipment[]) => ({
    listChangedShipments: async () => ({ rows, skipped: 0, hasMore: false, nextCursor: null }),
    getHistory: async (awb: string) => {
      historyCalls++;
      return await historyFor(awb);
    },
  });

  /** One tick at `now`, live pass forced on/off. */
  const tick = (rows: Shipment[], opts: { now?: Date; env?: Record<string, string>; isLive?: boolean } = {}) =>
    worker.runAbsTrackingTick({
      db,
      config: cfg.readAbsTrackingConfig(opts.env ?? ENV_AUTO),
      source: source(rows),
      now: () => opts.now ?? new Date(),
      log: () => {},
      ...(opts.isLive === undefined ? {} : { isLive: () => opts.isLive as boolean }),
    });
  /** Tick 1 two hours ago (first sighting), tick 2 now (settled). */
  const twoTicks = async (rows: Shipment[], env: Record<string, string> = ENV_AUTO) => {
    const first = await tick(rows, { now: new Date(Date.now() - 2 * HOUR), env, isLive: true });
    const second = await tick(rows, { now: new Date(), env, isLive: true });
    return { first, second };
  };

  const liveDeps = (env: Record<string, string> = ENV_AUTO, extra: Partial<import("../live").ApplyDeps> = {}) => ({
    db,
    config: live.liveConfigOf(cfg.readAbsTrackingConfig(env)),
    fetchHistory: async (awb: string) => {
      historyCalls++;
      return await historyFor(awb);
    },
    isLive: () => true,
    actor: ADMIN_EMAIL,
    ...extra,
  });

  const orderRow = async (id: string) => (await db.select().from(schema.order).where(eq(schema.order.id, id)))[0];
  const statusLogs = async (id: string) =>
    db.select().from(schema.orderLog).where(and(eq(schema.orderLog.orderId, id), inArray(schema.orderLog.action, ["status_changed", "cancelled"])));
  const applications = async (where = sql`true`) => ((await db.execute(sql`SELECT * FROM abs_live_application WHERE ${where} ORDER BY created_at`)) as unknown as { rows: Array<Record<string, unknown>> }).rows;
  const latestDecisionId = async (awb: string) => {
    const r = (await db.execute(sql`SELECT id FROM abs_tracking_decision WHERE awb = ${awb} ORDER BY last_seen_at DESC, created_at DESC LIMIT 1`)) as unknown as { rows: Array<{ id: string }> };
    return r.rows[0]?.id as string;
  };
  const reviewQueue = async (orderId: string) => db.select().from(schema.scheduledEmail).where(eq(schema.scheduledEmail.dedupeKey, `review_check:${orderId}`));
  const adminSetStatus = async (orderId: string, status: "pending" | "processing" | "shipped" | "delivered" | "cancelled") => {
    const { runBackendEffect } = await import("#root/shared/backend/effect");
    const { provideDatabase } = await import("#root/shared/trpc/server");
    const res = await runBackendEffect(adminSvc.updateOrderStatus({ orderId, status }, ADMIN).pipe(provideDatabase({ db })));
    expect(res.success).toBe(true);
  };

  /** Every non-abs table: row count + md5 over all rows. */
  const snapshotExisting = async () => {
    const tables = (await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'abs\\_%' AND table_name <> '__drizzle_migrations'
      ORDER BY table_name
    `)) as unknown as { rows: Array<{ table_name: string }> };
    const out: Record<string, { rows: number; md5: string }> = {};
    for (const { table_name } of tables.rows) {
      const r = (await db.execute(
        sql.raw(`SELECT count(*)::int AS n, coalesce(md5(string_agg(md5(t::text), '' ORDER BY md5(t::text))), '-') AS h FROM "${table_name}" t`),
      )) as unknown as { rows: Array<{ n: number; h: string }> };
      out[table_name] = { rows: Number(r.rows[0]?.n), md5: String(r.rows[0]?.h) };
    }
    return out;
  };
  const changedTables = (a: Record<string, { rows: number; md5: string }>, b: Record<string, { rows: number; md5: string }>) =>
    Object.keys({ ...a, ...b })
      .filter((t) => a[t]?.md5 !== b[t]?.md5 || a[t]?.rows !== b[t]?.rows)
      .sort();
  /** All "order" rows except one, as JSON, to prove only the target changed. */
  const otherOrders = async (exceptId: string) =>
    ((await db.execute(sql`SELECT md5(string_agg(md5(o::text), '' ORDER BY o.id)) AS h FROM "order" o WHERE o.id <> ${exceptId}::uuid`)) as unknown as { rows: Array<{ h: string }> }).rows[0]?.h;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema }) as unknown as Db;
    worker = await import("../worker");
    live = await import("../live");
    cfg = await import("#root/shared/config/abs-tracking");
    readiness = await import("../readiness");
    autoMigrate = await import("#root/shared/database/auto-migrate");
    core = await import("#root/backend/orders/update-order-status/apply-status-change");
    adminSvc = await import("#root/backend/orders/update-order-status/service");
    erp = await import("#root/backend/erp-sync/export-service");
    router = await import("../trpc");

    // Apply 0070–0072 exactly as auto-migrate would (all idempotent) if the pushed DB predates them.
    if (!(await readiness.checkAbsTrackingReadiness(db)).ready || !(await readiness.checkAbsLiveReadiness(db)).ready) {
      for (const file of MIGRATIONS) {
        for (const stmt of autoMigrate.splitMigrationStatements(readFileSync(file, "utf8"))) {
          try {
            await db.execute(sql.raw(stmt));
          } catch (err) {
            if (!/already exists/i.test(String((err as { cause?: { message?: string } })?.cause?.message ?? (err as Error)?.message))) throw err;
          }
        }
      }
    }
    expect((await readiness.checkAbsLiveReadiness(db)).ready).toBe(true);

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    const [cat] = await db.insert(schema.category).values({ name: `${TAG}cat`, slug: `${TAG}cat-${Date.now()}`, type: "general" }).returning();
    const [prod] = await db
      .insert(schema.product)
      .values({ name: `${TAG}piece`, description: "abs live fixture", imageId: file?.id as string, categoryId: cat?.id as string, price: "225.00", vendorId: storeOwner, stock: 50 })
      .returning();
    seeded = { fileId: file?.id as string, categoryId: cat?.id as string, productId: prod?.id as string, storeOwner };
    await db.delete(schema.user).where(eq(schema.user.email, ADMIN_EMAIL));
    await db.insert(schema.user).values({ id: ADMIN.id, name: ADMIN.name, email: ADMIN_EMAIL, role: "admin" });
    // Stale fixtures from an interrupted run.
    const stale = await db.select({ id: schema.order.id }).from(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    if (stale.length) await db.delete(schema.order).where(inArray(schema.order.id, stale.map((s) => s.id)));
  }, 120_000);

  beforeEach(async () => {
    await resetAbs();
    historyFor = async () => deliveredHistory();
    historyCalls = 0;
    cfg.setEffectiveAbsTrackingMode("live");
    cfg.setAbsTrackingBootStatus(null);
  });

  afterAll(async () => {
    if (!db) return;
    cfg.setEffectiveAbsTrackingMode("off");
    await resetAbs();
    if (createdOrders.length) {
      await db.delete(schema.scheduledEmail).where(inArray(schema.scheduledEmail.dedupeKey, createdOrders.map((id) => `review_check:${id}`)));
      await db.delete(schema.orderLog).where(inArray(schema.orderLog.orderId, createdOrders));
      await db.delete(schema.orderItem).where(inArray(schema.orderItem.orderId, createdOrders));
      await db.delete(schema.order).where(inArray(schema.order.id, createdOrders));
    }
    await db.delete(schema.user).where(eq(schema.user.email, ADMIN_EMAIL));
    if (seeded) {
      await db.delete(schema.product).where(eq(schema.product.id, seeded.productId));
      await db.delete(schema.category).where(eq(schema.category.id, seeded.categoryId));
      await db.delete(schema.file).where(eq(schema.file.id, seeded.fileId));
    }
    await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  });

  // ── Migration ───────────────────────────────────────────────────────────

  it("0072 is idempotent and its rollback (PART 0) removes exactly the live objects", async () => {
    const stmts = autoMigrate.splitMigrationStatements(readFileSync(MIGRATIONS[2] as string, "utf8"));
    // Re-running every statement succeeds (IF NOT EXISTS / ON CONFLICT DO NOTHING).
    for (const stmt of stmts) await db.execute(sql.raw(stmt));
    expect((await readiness.checkAbsLiveReadiness(db)).ready).toBe(true);
    const settings = (await db.execute(sql`SELECT count(*)::int AS n FROM abs_settings`)) as unknown as { rows: Array<{ n: number }> };
    expect(settings.rows[0]?.n).toBe(1);
    // The rollback file's PART 0, then forward again.
    const rollback = readFileSync(ROLLBACK, "utf8");
    const part0 = rollback.slice(rollback.indexOf("-- ── PART 0"), rollback.indexOf("-- ── PART 1"));
    const pg = await import("pg");
    const client = new pg.default.Client({ connectionString: TEST_DB_URL });
    await client.connect();
    try {
      await client.query(part0);
      await client.query(part0); // re-runnable
      const after = await readiness.checkAbsLiveReadiness(db);
      expect(after.ready).toBe(false);
      expect(after.missing).toEqual(expect.arrayContaining(["table abs_live_application", "table abs_settings", "column abs_tracking_decision.applied_at"]));
      expect((await readiness.checkAbsTrackingReadiness(db)).ready).toBe(true); // Shadow objects untouched
    } finally {
      for (const stmt of stmts) await client.query(stmt);
      await client.end();
    }
    expect((await readiness.checkAbsLiveReadiness(db)).ready).toBe(true);
  });

  // ── Apply once, rerun, ERP version ──────────────────────────────────────

  it("applies once; a rerun of the same tick changes nothing; the ERP export changes exactly once", async () => {
    const o = await createOrder();
    const v0 = (await erp.getOrdersForExport(db as never, [o.id]))[0]?.version;
    const { first, second } = await twoTicks([shipment(o)]);
    // Tick 1: first sighting → settling (not applied).
    expect(first.live).toMatchObject({ ran: true, applied: 0 });
    expect(second.live).toMatchObject({ ran: true, applied: 1, appliedOrders: [o.orderNumber] });

    const after = await orderRow(o.id);
    expect(after?.status).toBe("delivered");
    const logs = await statusLogs(o.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "status_changed", userId: null, oldStatus: "shipped", newStatus: "delivered" });
    const decisionId = await latestDecisionId(o.awb);
    expect(logs[0]?.note).toBe(`[ABS auto] Delivered at ABS (AWB …${o.awb.slice(-4)}, decision ${decisionId}).`);
    expect(logs[0]?.note).not.toContain(o.phone);
    expect(logs[0]?.note).not.toContain(o.awb);

    const apps = await applications(sql`outcome = 'applied'`);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ decision_id: decisionId, order_id: o.id, from_status: "shipped", to_status: "delivered", actor: "system:abs", trigger: "auto", order_log_id: logs[0]?.id });
    const dec = (await db.select().from(schema.absTrackingDecision).where(eq(schema.absTrackingDecision.id, decisionId)))[0];
    expect(dec).toMatchObject({ applied: true, mode: "live" });
    expect(dec?.appliedAt).toBeInstanceOf(Date);
    const audit = await db.select().from(schema.absAuditLog).where(eq(schema.absAuditLog.action, "live_apply"));
    expect(audit).toHaveLength(1);
    const v1 = (await erp.getOrdersForExport(db as never, [o.id]))[0];
    expect(v1?.status).toBe("delivered");
    expect(v1?.version).not.toBe(v0);

    // Rerun the same tick (and once more): no new order_log row, application or version.
    const third = await tick([shipment(o)], { isLive: true });
    await tick([shipment(o)], { isLive: true });
    expect(third.live?.applied).toBe(0);
    expect(await statusLogs(o.id)).toHaveLength(1);
    expect(await applications(sql`outcome = 'applied'`)).toHaveLength(1);
    expect((await erp.getOrdersForExport(db as never, [o.id]))[0]?.version).toBe(v1?.version);
    // The decision is now "already delivered" (recompute), never proposed again.
    expect(await live.listLiveCandidates(db, 10)).toEqual([]);
  });

  it("two concurrent writers on the same decision → exactly one application", async () => {
    const o = await createOrder();
    await tick([shipment(o)], { now: new Date(Date.now() - 2 * HOUR), isLive: false });
    const decisionId = await latestDecisionId(o.awb);
    const deps = liveDeps();
    const [a, b] = await Promise.all([
      live.applyLiveCandidate(deps, { decisionId, trigger: "auto", actor: "system:abs" }),
      live.applyLiveCandidate(deps, { decisionId, trigger: "auto", actor: "system:abs" }),
    ]);
    expect([a.outcome, b.outcome].sort()).toEqual(["applied", "skipped"]);
    expect(await statusLogs(o.id)).toHaveLength(1);
    expect(await applications(sql`outcome = 'applied'`)).toHaveLength(1);
    // A tick while another tick holds the advisory lock does nothing.
    const held = await worker.acquireAdvisoryLock(db);
    try {
      expect(held.acquired).toBe(true);
      const t = await tick([shipment(o)], { isLive: true });
      expect(t.outcome).toBe("skipped_locked");
      expect(t.live).toBeNull();
    } finally {
      await held.release();
    }
    expect(await applications(sql`outcome = 'applied'`)).toHaveLength(1);
  });

  it("a change made while the ABS history is being fetched is caught by the in-transaction re-check", async () => {
    const o = await createOrder();
    await tick([shipment(o)], { now: new Date(Date.now() - 2 * HOUR), isLive: false });
    const decisionId = await latestDecisionId(o.awb);
    // The pre-flight passes; then, during the network call, an admin moves the order.
    historyFor = async () => {
      await adminSetStatus(o.id, "processing");
      return deliveredHistory();
    };
    const r = await live.applyLiveCandidate(liveDeps(), { decisionId, trigger: "auto", actor: "system:abs" });
    expect(r).toMatchObject({ outcome: "skipped", reason: "human_changed" });
    expect((await orderRow(o.id))?.status).toBe("processing");
    expect(await applications(sql`outcome = 'applied'`)).toHaveLength(0);
  });

  it("the partial unique indexes: one applied row per decision and per (order, delivered); skips dedupe per AWB × reason × day", async () => {
    const o = await createOrder();
    const ins = (decision: string, outcome: string, reason: string | null) =>
      db.execute(sql`INSERT INTO abs_live_application (id, decision_id, awb, order_id, to_status, outcome, reason_code, trigger, actor, cairo_day)
                     VALUES (gen_random_uuid(), ${decision}::uuid, ${o.awb}, ${o.id}::uuid, 'delivered', ${outcome}, ${reason}, 'auto', 'system:abs', '2026-11-19')
                     ON CONFLICT DO NOTHING RETURNING id`) as unknown as Promise<{ rows: unknown[] }>;
    const d1 = "0192c1f0-0000-7000-8000-0000000000a1";
    const d2 = "0192c1f0-0000-7000-8000-0000000000a2";
    expect((await ins(d1, "applied", null)).rows).toHaveLength(1);
    expect((await ins(d1, "applied", null)).rows).toHaveLength(0); // same decision
    expect((await ins(d2, "applied", null)).rows).toHaveLength(0); // same order → delivered
    expect((await ins(d2, "skipped", "settling")).rows).toHaveLength(1);
    expect((await ins(d1, "skipped", "settling")).rows).toHaveLength(0); // same AWB × reason × day
    expect((await ins(d1, "skipped", "too_old")).rows).toHaveLength(1);
    // CHECKs: only `delivered`, a reason on every skip, a known outcome.
    await expect(db.execute(sql`INSERT INTO abs_live_application (id, decision_id, awb, to_status, outcome, reason_code, trigger, actor, cairo_day) VALUES (gen_random_uuid(), ${d1}::uuid, 'X', 'cancelled', 'skipped', 'x', 'auto', 'a', '2026-11-19')`)).rejects.toThrow();
    await expect(db.execute(sql`INSERT INTO abs_live_application (id, decision_id, awb, to_status, outcome, trigger, actor, cairo_day) VALUES (gen_random_uuid(), ${d1}::uuid, 'X', 'delivered', 'skipped', 'auto', 'a', '2026-11-19')`)).rejects.toThrow();
    await expect(db.execute(sql`INSERT INTO abs_live_application (id, decision_id, awb, to_status, outcome, reason_code, trigger, actor, cairo_day) VALUES (gen_random_uuid(), ${d1}::uuid, 'X', 'delivered', 'maybe', 'x', 'auto', 'a', '2026-11-19')`)).rejects.toThrow();
  });

  // ── Never overwrite a human ─────────────────────────────────────────────

  it("an admin status change between the decision and the apply → skip human_changed, nothing written", async () => {
    const o = await createOrder({ status: "processing" });
    await tick([shipment(o)], { now: new Date(Date.now() - 2 * HOUR), isLive: true });
    await adminSetStatus(o.id, "shipped");
    const r = await tick([shipment(o)], { isLive: true });
    expect(r.live).toMatchObject({ applied: 0 });
    expect((await orderRow(o.id))?.status).toBe("shipped");
    const skipped = await applications(sql`outcome = 'skipped' AND reason_code = 'human_changed'`);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.details).toMatchObject({ attention: true, orderNumber: o.orderNumber });
    // A rerun the same day refreshes that row instead of adding one.
    await tick([shipment(o)], { isLive: true });
    const again = await applications(sql`outcome = 'skipped' AND reason_code = 'human_changed'`);
    expect(again).toHaveLength(1);
    expect(Number(again[0]?.seen_count)).toBe(2);
    // It is on the attention list, with the order number.
    const attention = await live.getLiveAttention(db);
    expect(attention.map((a) => [a.orderNumber, a.reason])).toEqual([[o.orderNumber, "human_changed"]]);
  });

  it("exceptions are never applied: COD mismatch, missing collectedCash, fuzzy link, reverse service, cancelled order, event after DELIVERED", async () => {
    const mismatch = await createOrder({ total: 500 });
    const noCollected = await createOrder({ total: 300 });
    const reverse = await createOrder({ total: 310 });
    const cancelled = await createOrder({ status: "cancelled", total: 320 });
    const returned = await createOrder({ total: 330 });
    historyFor = async (awb) =>
      awb === returned.awb
        ? [...deliveredHistory(), { status: "RETURN_INITIATED", statusRaw: "Return initiated", occurredAt: new Date(Date.now() - HOUR) }]
        : deliveredHistory();
    const rows = [
      shipment(mismatch, { collectedCash: 450 }),
      shipment(noCollected, { collectedCash: null }),
      shipment(reverse, { cmpService: "REVERSE" }),
      shipment(cancelled),
      shipment(returned),
    ];
    await twoTicks(rows);
    for (const o of [mismatch, noCollected, reverse, cancelled, returned]) {
      expect(await statusLogs(o.id)).toHaveLength(0);
    }
    expect(await applications(sql`outcome = 'applied'`)).toHaveLength(0);
    const reasons = (await applications(sql`outcome = 'skipped' AND reason_code <> 'settling'`)).map((a) => [a.awb, a.reason_code]).sort();
    expect(reasons).toEqual(
      [
        [noCollected.awb, "cod_missing_collected"],
        [returned.awb, "history_event_after_delivered"],
      ].sort(),
    );
    // Shadow alone already refused the others (no would_mark_delivered): cod_mismatch alert, reverse role, cancelled alert.
    expect((await live.listLiveCandidates(db, 50)).map((c) => c.awb).sort()).toEqual([noCollected.awb, returned.awb].sort());
    // Both reach the owner's attention list.
    expect((await live.getLiveAttention(db)).map((a) => a.reason).sort()).toEqual(["cod_missing_collected", "history_event_after_delivered"]);
  });

  // ── Pause, cap, kill switch ─────────────────────────────────────────────

  it("pause set mid-run (between the history check and the transaction) → no write; resume → applied", async () => {
    const o = await createOrder();
    await tick([shipment(o)], { now: new Date(Date.now() - 2 * HOUR), isLive: false });
    const decisionId = await latestDecisionId(o.awb);
    historyFor = async () => {
      await live.setLivePaused({ db, actor: ADMIN_EMAIL }, { paused: true, note: "canary check" });
      return deliveredHistory();
    };
    const r = await live.applyLiveCandidate(liveDeps(), { decisionId, trigger: "auto", actor: "system:abs" });
    expect(r).toMatchObject({ outcome: "skipped", reason: "paused" });
    expect((await orderRow(o.id))?.status).toBe("shipped");
    expect(await statusLogs(o.id)).toHaveLength(0);
    // A paused tick does not even evaluate.
    historyFor = async () => deliveredHistory();
    const paused = await tick([shipment(o)], { isLive: true });
    expect(paused.live).toMatchObject({ ran: false, paused: true });
    // Pause / resume are audited; resume → the next tick applies.
    await live.setLivePaused({ db, actor: ADMIN_EMAIL }, { paused: false, note: null });
    const resumed = await tick([shipment(o)], { isLive: true });
    expect(resumed.live?.applied).toBe(1);
    const acts = (await db.select().from(schema.absAuditLog)).map((a) => a.action).filter((a) => a.startsWith("live_"));
    expect(acts).toEqual(expect.arrayContaining(["live_pause", "live_resume", "live_apply"]));
  });

  it("daily cap and per-tick cap", async () => {
    const env = { ...ENV_AUTO, ABS_LIVE_DAILY_CAP: "2", ABS_LIVE_MAX_PER_TICK: "1" };
    const os = [await createOrder(), await createOrder(), await createOrder()];
    const rows = os.map((o) => shipment(o));
    await tick(rows, { now: new Date(Date.now() - 2 * HOUR), env, isLive: true });
    const t2 = await tick(rows, { env, isLive: true });
    expect(t2.live?.applied).toBe(1); // per-tick cap
    const t3 = await tick(rows, { env, isLive: true });
    expect(t3.live?.applied).toBe(1);
    const t4 = await tick(rows, { env, isLive: true });
    expect(t4.live).toMatchObject({ applied: 0, capHit: true }); // daily cap 2
    expect(await applications(sql`outcome = 'applied'`)).toHaveLength(2);
    expect(await applications(sql`outcome = 'skipped' AND reason_code = 'daily_cap'`)).toHaveLength(1);
  });

  it("kill switch: effective mode shadow → the tick applies nothing and the live procedures refuse", async () => {
    const o = await createOrder();
    const init = await readiness.initAbsTracking(db, { ...ENV_BASE, ABS_TRACKING_MODE: "shadow" }, { info: () => {}, warn: () => {} });
    expect(init.effective).toBe("shadow");
    // Default isLive = the effective mode.
    await tick([shipment(o)], { now: new Date(Date.now() - 2 * HOUR), env: ENV_AUTO });
    const r = await tick([shipment(o)], { env: ENV_AUTO });
    expect(r.live).toBeNull();
    expect((await orderRow(o.id))?.status).toBe("shipped");
    expect(await applications()).toHaveLength(0);
    const caller = router.absTrackingRouter.createCaller({ db, clientSession: ADMIN } as never);
    await expect(caller.liveReady()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(caller.liveSetPaused({ paused: true })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    // Undo / "Done automatically" stay available after a rollback to shadow (0072 present).
    await expect(caller.liveDone()).resolves.toEqual([]);
    // An invalid ABS_LIVE_TRANSITIONS can never turn live on.
    const bad = await readiness.initAbsTracking(db, { ...ENV_AUTO, ABS_LIVE_TRANSITIONS: "delivered,cancelled" }, { info: () => {}, warn: () => {} });
    expect(bad.effective).toBe("shadow");
    const good = await readiness.initAbsTracking(db, ENV_AUTO, { info: () => {}, warn: () => {} });
    expect(good.effective).toBe("live");
  });

  // ── Approval mode ───────────────────────────────────────────────────────

  it("approval mode: the tick only previews; the button applies exactly the previewed set, re-checking each item", async () => {
    const a = await createOrder();
    const b = await createOrder();
    const c = await createOrder();
    const rows = [shipment(a), shipment(b), shipment(c)];
    await twoTicks(rows, ENV_APPROVAL);
    expect(await applications(sql`outcome = 'applied'`)).toHaveLength(0);
    const ready = await live.getLiveReady(db);
    expect(ready.map((r) => r.orderNumber).sort()).toEqual([a.orderNumber, b.orderNumber, c.orderNumber].sort());
    expect(ready.every((r) => r.collected === r.total)).toBe(true);
    // A re-tick within the hour does not call ABS again for items already Ready.
    historyCalls = 0;
    await tick(rows, { env: ENV_APPROVAL, isLive: true });
    expect(historyCalls).toBe(0);

    // Between preview and click, ABS reports a return for b (only the fresh history at click time shows it);
    // the owner approves a + b (not c); a crafted id is refused.
    historyFor = async (awb) =>
      awb === b.awb ? [...deliveredHistory(), { status: "RETURN_INITIATED", statusRaw: "Return initiated", occurredAt: new Date(Date.now() - 60_000) }] : deliveredHistory();
    const ids = ready.filter((r) => r.orderNumber !== c.orderNumber).map((r) => r.decisionId);
    const res = await live.approveReady(liveDeps(ENV_APPROVAL), [...ids, "0192c1f0-0000-7000-8000-000000000000"]);
    expect(res.applied).toBe(1);
    const byNumber = Object.fromEntries(res.results.map((r) => [r.orderNumber ?? r.decisionId, r.outcome]));
    expect(byNumber[a.orderNumber]).toBe("applied");
    expect(byNumber[b.orderNumber]).toBe("skipped");
    expect(byNumber["0192c1f0-0000-7000-8000-000000000000"]).toBe("not_ready");
    expect((await orderRow(a.id))?.status).toBe("delivered");
    expect((await orderRow(b.id))?.status).toBe("shipped");
    expect(res.results.find((r) => r.orderNumber === b.orderNumber)?.reason).toBe("history_event_after_delivered");
    expect((await orderRow(c.id))?.status).toBe("shipped");
    const app = (await applications(sql`outcome = 'applied'`))[0];
    expect(app).toMatchObject({ trigger: "approval", actor: ADMIN_EMAIL });
    const log = (await statusLogs(a.id))[0];
    expect(log?.userId).toBeNull();
    expect(log?.note).toMatch(/^\[ABS auto\] .*Approved on the ABS screen\.$/);
    // c is still Ready.
    expect((await live.getLiveReady(db)).map((r) => r.orderNumber)).toEqual([c.orderNumber]);
  });

  it("delivered more than 14 days ago → attention; one-click approve applies it (only the age is waived)", async () => {
    const o = await createOrder();
    const old = shipment(o, { deliveryDate: new Date(Date.now() - 20 * DAY) });
    historyFor = async () => [{ status: "DELIVERED", statusRaw: "Delivered", occurredAt: new Date(Date.now() - 20 * DAY) }];
    await twoTicks([old]);
    expect((await orderRow(o.id))?.status).toBe("shipped");
    const att = await live.getLiveAttention(db);
    expect(att).toHaveLength(1);
    expect(att[0]).toMatchObject({ reason: "too_old", orderNumber: o.orderNumber, deliveredDaysAgo: 20 });
    // Before any history call (age is checked first).
    expect(historyCalls).toBe(0);
    const r = await live.approveOld(liveDeps(), att[0]?.decisionId as string);
    expect(r.outcome).toBe("applied");
    expect((await orderRow(o.id))?.status).toBe("delivered");
    expect((await applications(sql`outcome = 'applied'`))[0]).toMatchObject({ trigger: "approve_old", actor: ADMIN_EMAIL });
  });

  it("suppress: a human says 'not this one' → never applied", async () => {
    const o = await createOrder();
    await tick([shipment(o)], { now: new Date(Date.now() - 2 * HOUR), isLive: false });
    const decisionId = await latestDecisionId(o.awb);
    await live.suppressDecision({ db, actor: ADMIN_EMAIL }, { decisionId, note: "customer says parcel missing" });
    const r = await tick([shipment(o)], { isLive: true });
    expect(r.live?.applied).toBe(0);
    expect((await orderRow(o.id))?.status).toBe("shipped");
    expect(await live.listLiveCandidates(db, 10)).toEqual([]);
    expect((await db.select().from(schema.absAuditLog).where(eq(schema.absAuditLog.action, "live_suppress"))).length).toBe(1);
  });

  // ── Undo ────────────────────────────────────────────────────────────────

  it("Undo: back to the previous status through the same core, recorded; never re-applied; refused after a later human change", async () => {
    const o = await createOrder();
    await twoTicks([shipment(o)]);
    const app = (await applications(sql`outcome = 'applied'`))[0] as Record<string, unknown>;
    const res = await live.undoApplication({ db, actor: ADMIN_EMAIL }, { applicationId: String(app.id), note: "customer refused at the door" });
    expect(res).toMatchObject({ changed: true, status: "shipped" });
    expect((await orderRow(o.id))?.status).toBe("shipped");
    const logs = await statusLogs(o.id);
    expect(logs).toHaveLength(2);
    const undo = logs.find((l) => l.note?.startsWith("[ABS auto-undo]"));
    expect(undo).toMatchObject({ oldStatus: "delivered", newStatus: "shipped", userId: ADMIN.id });
    const after = (await applications(sql`id = ${String(app.id)}::uuid`))[0];
    expect(after?.undone_by).toBe(ADMIN_EMAIL);
    expect(after?.undo_order_log_id).toBe(undo?.id);
    // A second undo is a no-op; the next ticks never re-apply it.
    expect(await live.undoApplication({ db, actor: ADMIN_EMAIL }, { applicationId: String(app.id), note: "again" })).toEqual({ changed: false });
    await tick([shipment(o)], { isLive: true });
    await tick([shipment(o)], { isLive: true });
    expect((await orderRow(o.id))?.status).toBe("shipped");
    expect(await applications(sql`outcome = 'applied'`)).toHaveLength(1);

    // Refused when a person changed the order after the automatic Delivered.
    const o2 = await createOrder();
    await twoTicks([shipment(o2)]);
    const app2 = (await applications(sql`outcome = 'applied' AND order_id = ${o2.id}::uuid`))[0] as Record<string, unknown>;
    await adminSetStatus(o2.id, "cancelled");
    await adminSetStatus(o2.id, "delivered");
    await expect(live.undoApplication({ db, actor: ADMIN_EMAIL }, { applicationId: String(app2.id), note: "too late" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  // ── What a live application writes ──────────────────────────────────────

  it("no-write proof (live): only the target order's status, one order_log row, the review-queue rows and abs_* change; product / order_item / stock untouched", async () => {
    const o = await createOrder();
    await tick([shipment(o)], { now: new Date(Date.now() - 2 * HOUR), isLive: true });
    const beforeRow = await orderRow(o.id);
    const before = await snapshotExisting();
    const othersBefore = await otherOrders(o.id);
    const stockBefore = (await db.select({ stock: schema.product.stock }).from(schema.product).where(eq(schema.product.id, seeded.productId)))[0]?.stock;
    const r = await tick([shipment(o)], { isLive: true });
    expect(r.live?.applied).toBe(1);
    const after = await snapshotExisting();
    const changed = changedTables(before, after);
    // email_subscription: the review-email enqueue creates the customer's unsubscribe token row if missing (admin path does the same).
    expect(changed.filter((t) => t !== "email_subscription")).toEqual(["order", "order_log", "scheduled_email"]);
    expect(after.order_log?.rows).toBe((before.order_log?.rows ?? 0) + 1);
    expect(after.scheduled_email?.rows).toBe((before.scheduled_email?.rows ?? 0) + 1);
    expect(after.order?.rows).toBe(before.order?.rows);
    expect(await otherOrders(o.id)).toBe(othersBefore);
    const afterRow = await orderRow(o.id);
    expect({ ...afterRow, status: "x" }).toEqual({ ...beforeRow, status: "x" });
    expect(afterRow?.status).toBe("delivered");
    expect(after.product).toEqual(before.product);
    expect(after.order_item).toEqual(before.order_item);
    expect((await db.select({ stock: schema.product.stock }).from(schema.product).where(eq(schema.product.id, seeded.productId)))[0]?.stock).toBe(stockBefore);
  });

  it("no-write proof (shadow): an eligible delivery changes nothing outside abs_*", async () => {
    const o = await createOrder();
    const before = await snapshotExisting();
    await tick([shipment(o)], { now: new Date(Date.now() - 2 * HOUR), isLive: false, env: { ...ENV_BASE, ABS_TRACKING_MODE: "shadow" } });
    await tick([shipment(o)], { isLive: false, env: { ...ENV_BASE, ABS_TRACKING_MODE: "shadow" } });
    expect(changedTables(before, await snapshotExisting())).toEqual([]);
    expect(await live.listLiveCandidates(db, 10)).toHaveLength(1); // it WOULD be applied in live
    expect(await applications()).toHaveLength(0);
  });

  it("the review email is queued exactly as the admin path queues it", async () => {
    const viaAbs = await createOrder();
    const viaAdmin = await createOrder();
    await twoTicks([shipment(viaAbs)]);
    await adminSetStatus(viaAdmin.id, "delivered");
    const [qa] = await reviewQueue(viaAbs.id);
    const [qb] = await reviewQueue(viaAdmin.id);
    expect(qa).toBeDefined();
    expect(qb).toBeDefined();
    const shape = (q: typeof qa, email: string) => ({
      automationType: q?.automationType,
      recipientEmail: q?.recipientEmail === email,
      payload: q?.payload,
      status: q?.status,
      delayMs: Math.round(((q?.scheduledFor?.getTime() ?? 0) - (q?.createdAt?.getTime() ?? 0)) / 60_000),
    });
    expect(shape(qa, viaAbs.email)).toEqual(shape(qb, viaAdmin.email));
    expect(shape(qa, viaAbs.email).recipientEmail).toBe(true);
  });

  // ── Admin path: before / after the refactor ─────────────────────────────

  it("admin path regression: the refactored service writes the same rows as the pre-refactor code", async () => {
    // Verbatim copy of the transaction body of update-order-status/service.ts at de179ee (before the extraction).
    const legacy = async (orderId: string, status: "pending" | "processing" | "shipped" | "delivered" | "cancelled", session: { email: string; role: string }) => {
      const { orderItem, orderLog, product, user, order } = schema;
      const { enqueueReviewCheckForOrder } = await import("#root/backend/email-automations/triggers/order-delivered");
      return await db.transaction(async (tx) => {
        const currentOrder = await tx.select({ id: order.id, status: order.status, stockRestored: order.stockRestored }).from(order).where(eq(order.id, orderId)).execute();
        const oldStatus = currentOrder[0]?.status || "pending";
        const alreadyRestored = currentOrder[0]?.stockRestored ?? false;
        const shouldRestoreStock = status === "cancelled" && oldStatus !== "cancelled" && !alreadyRestored;
        if (shouldRestoreStock) {
          const items = await tx.select({ productId: orderItem.productId, quantity: orderItem.quantity }).from(orderItem).where(eq(orderItem.orderId, orderId)).execute();
          for (const item of items) await tx.update(product).set({ stock: sql`${product.stock} + ${item.quantity}` }).where(eq(product.id, item.productId));
        }
        const updateResult = await tx.update(order).set({ status, ...(shouldRestoreStock ? { stockRestored: true } : {}) }).where(eq(order.id, orderId)).returning();
        const userData = await tx.select({ id: user.id }).from(user).where(eq(user.email, session.email)).execute();
        await tx.insert(orderLog).values({ orderId, userId: userData[0]?.id, action: "status_changed", oldStatus, newStatus: status, note: `Status changed from ${oldStatus} to ${status} by ${session.role}` });
        if (status === "delivered" && oldStatus !== "delivered") {
          // biome-ignore lint/style/noNonNullAssertion: verbatim copy of the pre-refactor code
          await enqueueReviewCheckForOrder({ orderId, customerEmail: updateResult[0]!.customerEmail, customerName: updateResult[0]!.customerName });
        }
        return updateResult[0];
      });
    };
    const oldWay = await createOrder({ status: "processing" });
    const newWay = await createOrder({ status: "processing" });
    const stock = async () => (await db.select({ stock: schema.product.stock }).from(schema.product).where(eq(schema.product.id, seeded.productId)))[0]?.stock as number;
    const strip = (o: Record<string, unknown> | undefined) => {
      const { id: _i, orderNumber: _n, customerEmail: _e, customerPhone: _p, createdAt: _c, updatedAt: _u, ...rest } = o ?? {};
      return rest;
    };
    const steps = ["shipped", "delivered", "cancelled", "processing", "cancelled", "delivered"] as const;
    for (const step of steps) {
      const s0 = await stock();
      const a = await legacy(oldWay.id, step, ADMIN);
      const s1 = await stock();
      await adminSetStatus(newWay.id, step);
      const s2 = await stock();
      expect(s2 - s1, `stock delta on ${step}`).toBe(s1 - s0);
      expect(strip(await orderRow(newWay.id))).toEqual(strip(a as Record<string, unknown>));
    }
    const logShape = async (id: string) =>
      (await db.select().from(schema.orderLog).where(eq(schema.orderLog.orderId, id)).orderBy(schema.orderLog.createdAt)).map((l) => ({ action: l.action, userId: l.userId, oldStatus: l.oldStatus, newStatus: l.newStatus, note: l.note }));
    expect(await logShape(newWay.id)).toEqual(await logShape(oldWay.id));
    expect((await logShape(newWay.id)).filter((l) => l.action === "status_changed")).toHaveLength(steps.length);
    expect((await logShape(newWay.id))[1]?.userId).toBe(ADMIN.id);
    // Stock restored exactly once per order (first cancel), by both.
    expect((await orderRow(newWay.id))?.stockRestored).toBe(true);
    const q = async (id: string) => (await reviewQueue(id)).map((r) => ({ type: r.automationType, payload: r.payload, status: r.status }));
    expect(await q(newWay.id)).toEqual(await q(oldWay.id));
    expect(await q(newWay.id)).toHaveLength(1);
  });

  it("the shared core rejects a system actor without a note and an unknown order", async () => {
    await expect(db.transaction((tx) => core.applyOrderStatusChange(tx, { orderId: "0192c1f0-0000-7000-8000-000000000001", newStatus: "delivered", actor: { kind: "system", note: " " } }))).rejects.toThrow(/needs a note/);
    await expect(db.transaction((tx) => core.applyOrderStatusChange(tx, { orderId: "0192c1f0-0000-7000-8000-000000000001", newStatus: "delivered", actor: { kind: "system", note: "[ABS auto] x" } }))).rejects.toMatchObject({ _tag: "OrderNotFound" });
  });

  // ── Screen API ─────────────────────────────────────────────────────────

  it("tRPC: overview shows live health; Ready / Done / Undo / pause round-trip; non-admins refused", async () => {
    const o = await createOrder();
    await twoTicks([shipment(o)], ENV_APPROVAL);
    process.env.ABS_TRACKING_MODE = "live";
    const caller = router.absTrackingRouter.createCaller({ db, clientSession: ADMIN } as never);
    try {
      const ov = await caller.overview();
      expect(ov).toMatchObject({ on: true, mode: "live", live: { paused: false, appliedToday: 0, requireApproval: true, dailyCap: 40 } });
      const ready = await caller.liveReady();
      expect(ready.map((r) => r.orderNumber)).toEqual([o.orderNumber]);
      await caller.liveSetPaused({ paused: true, note: "checking" });
      await expect(caller.liveApproveReady({ decisionIds: ready.map((r) => r.decisionId) })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect((await caller.overview()) as { live: { paused: boolean } }).toMatchObject({ live: { paused: true } });
      await caller.liveSetPaused({ paused: false });
      const user = router.absTrackingRouter.createCaller({ db, clientSession: { ...ADMIN, role: "user" } } as never);
      await expect(user.liveApproveReady({ decisionIds: ready.map((r) => r.decisionId) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      Reflect.deleteProperty(process.env, "ABS_TRACKING_MODE");
    }
  });
});
