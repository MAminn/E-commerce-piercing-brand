import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * One full shadow tick against real Postgres, fed by the REAL
 * /shipments/list contract (fixtures/shipments-list-real-contract.json:
 * HTTP 201, nested envelope, array phones, string money — synthetic values).
 * The ABS API is never called: a fake fetch serves the fixture to the real
 * client + parser inside runAbsTrackingTick. Skipped when TEST_DATABASE_URL
 * is unset.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

const ROOT = path.resolve(__dirname, "../../../..");
const MIGRATIONS = ["0070_abs_tracking.sql", "0071_abs_tracking_review.sql"].map((f) => path.join(ROOT, "shared/database/migrations", f));
const ENV = {
  ABS_TRACKING_MODE: "shadow",
  ABS_API_BASE_URL: "https://abs.example.test",
  ABS_API_KEY: "integration-key-NOT-REAL",
  ABS_BACKFILL_FROM: "2026-11-01",
};

describeIfDb("ABS tracking — real /shipments/list contract (integration)", () => {
  type Db = import("#root/shared/database/drizzle/db").DatabaseClient;
  let db: Db;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let worker: typeof import("../worker");
  let cfg: typeof import("#root/shared/config/abs-tracking");
  let fx: ReturnType<typeof import("./fixture-helpers").fixtureRealContract>;
  let orderIdByKey: Map<string, string>;
  let seeded: { fileId: string; categoryId: string; productId: string } | undefined;
  const TAG = "abs-rc-";

  const resetAbs = async () => {
    await db.execute(sql`TRUNCATE abs_tracking_decision, abs_order_link, abs_shipment_status_history, abs_shipment, abs_sync_run, abs_sync_state, abs_audit_log`);
  };

  /** Every existing (non-abs_*) table: row count + md5 over all rows. */
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

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema }) as unknown as Db;
    worker = await import("../worker");
    cfg = await import("#root/shared/config/abs-tracking");
    const readiness = await import("../readiness");
    const autoMigrate = await import("#root/shared/database/auto-migrate");
    fx = (await import("./fixture-helpers")).fixtureRealContract();

    // Same as the Phase 1 suite: apply 0070 / 0071 if the shared test DB predates them.
    if (!(await readiness.checkAbsTrackingReadiness(db)).ready) {
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
    expect((await readiness.checkAbsTrackingReadiness(db)).ready).toBe(true);

    // Synthetic orders 9300001+ (never collide with the real sequence or the other suites).
    await resetAbs();
    const numbers = fx.orders.map((o) => o.orderNumber);
    const stale = await db.select({ id: schema.order.id }).from(schema.order).where(inArray(schema.order.orderNumber, numbers));
    if (stale.length) {
      await db.delete(schema.orderLog).where(inArray(schema.orderLog.orderId, stale.map((s) => s.id)));
      await db.delete(schema.orderItem).where(inArray(schema.orderItem.orderId, stale.map((s) => s.id)));
    }
    await db.delete(schema.order).where(inArray(schema.order.orderNumber, numbers));
    const inserted = await db
      .insert(schema.order)
      .values(
        fx.orders.map((o) => ({
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          customerEmail: `${o.key}@abs-fixture.test`,
          customerPhone: o.customerPhone,
          shippingAddress: "1 Fixture Street",
          shippingCity: "Cairo",
          shippingState: "Cairo",
          shippingPostalCode: "00000",
          shippingCountry: "Egypt",
          subtotal: o.total,
          shipping: "0.00",
          tax: "0.00",
          total: o.total,
          status: o.status,
          paymentMethod: o.paymentMethod,
          paymentStatus: o.paymentStatus,
          createdAt: new Date(o.createdAt),
        })),
      )
      .returning({ id: schema.order.id, orderNumber: schema.order.orderNumber });
    const keyByNumber = new Map(fx.orders.map((o) => [o.orderNumber, o.key]));
    orderIdByKey = new Map(inserted.map((r) => [keyByNumber.get(r.orderNumber) as string, r.id]));

    // Rows in product / order_item / order_log too, so the no-write proof hashes real data.
    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    const [cat] = await db.insert(schema.category).values({ name: `${TAG}cat`, slug: `${TAG}cat-${Date.now()}`, type: "general" }).returning();
    const [prod] = await db
      .insert(schema.product)
      .values({ name: `${TAG}piece`, description: "abs fixture", imageId: file?.id as string, categoryId: cat?.id as string, price: "100.00", vendorId: storeOwner, stock: 50 })
      .returning();
    seeded = { fileId: file?.id as string, categoryId: cat?.id as string, productId: prod?.id as string };
    const orderIds = [...orderIdByKey.values()];
    await db.insert(schema.orderItem).values(orderIds.map((orderId) => ({ orderId, productId: seeded?.productId as string, vendorId: storeOwner, name: `${TAG}piece`, price: "100.00", quantity: 1 })));
    await db.insert(schema.orderLog).values(orderIds.map((orderId) => ({ orderId, action: "created" as const })));
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await resetAbs();
    const ids = [...(orderIdByKey?.values() ?? [])];
    if (ids.length) {
      await db.delete(schema.orderLog).where(inArray(schema.orderLog.orderId, ids));
      await db.delete(schema.orderItem).where(inArray(schema.orderItem.orderId, ids));
      await db.delete(schema.order).where(inArray(schema.order.id, ids));
    }
    if (seeded) {
      await db.delete(schema.product).where(eq(schema.product.id, seeded.productId));
      await db.delete(schema.category).where(eq(schema.category.id, seeded.categoryId));
      await db.delete(schema.file).where(eq(schema.file.id, seeded.fileId));
    }
    await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  });

  it("one tick: stores the shipments, links phone+amount (incl. the second phone), would_mark_delivered, and writes nothing outside abs_*", async () => {
    await resetAbs();
    const before = await snapshotExisting();

    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (url: string, init: { body?: string }) => {
      calls.push({ path: new URL(url).pathname, body: init.body ? JSON.parse(init.body) : {} });
      return { status: fx.httpStatus, ok: true, headers: { get: () => null }, text: async () => JSON.stringify(fx.body) };
    });
    const report = await worker.runAbsTrackingTick({
      db,
      config: cfg.readAbsTrackingConfig(ENV),
      fetchImpl: fetchImpl as never,
      clientOptions: { sleep: async () => {}, minGapMs: 0 },
      log: () => {},
      now: () => new Date("2026-11-18T18:00:00+02:00"),
    });

    expect(fx.httpStatus).toBe(201);
    expect(report.outcome).toBe("ok");
    expect(report.rowsSkipped).toBe(0);
    // One page (hasMore false, even with a cursor string); cmpService never requested.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe("/api/v1/shipments/list");
    expect(calls[0]?.body.columns as string[]).not.toContain("cmpService");

    // ── Stored shipments ──
    const awbs = fx.expected.map((e) => e.awb);
    const shipments = await db.select().from(schema.absShipment).where(inArray(schema.absShipment.awb, awbs));
    expect(shipments).toHaveLength(8);
    const ship = new Map(shipments.map((s) => [s.awb, s]));
    for (const e of fx.expected) {
      expect(ship.get(e.awb)?.status, e.awb).toBe(e.status);
      expect(ship.get(e.awb)?.consigneePhoneLast4, e.awb).toBe(e.phoneLast4);
      expect(ship.get(e.awb)?.cmpService, e.awb).toBe("DELIVERY");
    }
    expect(ship.get("RCT0000001")).toMatchObject({ cash: "999.99", collectedCash: "999.99", consigneePhoneNorm: "1000003001", isPaid: false });
    // Two phones: the first valid one is stored; both stay in the raw row (no new column).
    expect(ship.get("RCT0000002")?.consigneePhoneNorm).toBe("1000003999");
    expect((ship.get("RCT0000002")?.raw as { consigneePhone: unknown }).consigneePhone).toEqual(["201000003999", "201000003022"]);
    expect(ship.get("RCT0000005")?.consigneePhoneNorm).toBeNull();
    expect(ship.get("RCT0000001")?.raw).toMatchObject({ subAccountId: "sub-fake-0001", isUnderRevision: false, currentBranchId: 11 });

    // ── Links ──
    const links = await db.select().from(schema.absOrderLink).where(inArray(schema.absOrderLink.awb, awbs));
    const link = new Map(links.map((l) => [l.awb, l]));
    for (const e of fx.expected) {
      const l = link.get(e.awb);
      expect(l?.state, e.awb).toBe(e.linkState);
      if (e.method) expect(l?.method, e.awb).toBe(e.method);
      if (e.linkReason) expect(l?.reasonCode, e.awb).toBe(e.linkReason);
      expect(l?.orderId ?? null, e.awb).toBe(e.linkOrder ? orderIdByKey.get(e.linkOrder) : null);
    }

    // ── Decisions ──
    const decisions = await db.select().from(schema.absTrackingDecision).where(inArray(schema.absTrackingDecision.awb, awbs));
    const decision = new Map(decisions.map((d) => [d.awb, d]));
    for (const e of fx.expected) {
      expect({ decision: decision.get(e.awb)?.decision, reason: decision.get(e.awb)?.reasonCode }, e.awb).toEqual({ decision: e.decision, reason: e.decisionReason });
      expect(decision.get(e.awb)?.applied, e.awb).toBe(false);
    }
    // DELIVERED, collected amount = order total → would_mark_delivered (string "999.99" vs numeric 999.99).
    expect(decision.get("RCT0000001")).toMatchObject({ decision: "would_mark_delivered", orderStatusSeen: "shipped", orderId: orderIdByKey.get("rc1") });

    // ── No-write proof ──
    const after = await snapshotExisting();
    const named = ["order", "order_item", "product", "order_log"];
    console.info(
      `[no-write proof, real contract] ${Object.keys(before).length} existing tables compared before / after one real-contract tick\n${named
        .map((t) => `  ${t.padEnd(10)} rows ${before[t]?.rows} → ${after[t]?.rows}   md5 ${before[t]?.md5} → ${after[t]?.md5}`)
        .join("\n")}\n  identical: ${JSON.stringify(after) === JSON.stringify(before)}`,
    );
    for (const t of named) expect(before[t], t).toBeDefined();
    expect(after).toEqual(before);
    // The orders themselves are untouched.
    const orders = await db.select({ status: schema.order.status }).from(schema.order).where(inArray(schema.order.id, [...orderIdByKey.values()]));
    expect(orders.map((o) => o.status).sort()).toEqual(fx.orders.map((o) => o.status).sort());
  }, 60_000);
});
