import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray, sql } from "drizzle-orm";
import pg from "pg";

/**
 * ABS tracking Phase 1 against real Postgres. The ABS API is never called:
 * every tick gets a fake fetch serving the synthetic fixtures. Skipped when
 * TEST_DATABASE_URL is unset.
 *
 * Proves: migration 0070 on a fresh DB and on a DB at 0069 (strictly
 * additive), a full fixture tick, idempotent re-ticks, the no-write proof on
 * every existing table, the advisory lock, partial-failure watermark
 * handling, mode off = zero queries, and readiness gating.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

const ROOT = path.resolve(__dirname, "../../../..");
const MIGRATIONS = ["0070_abs_tracking.sql", "0071_abs_tracking_review.sql"].map((f) => path.join(ROOT, "shared/database/migrations", f));
const ROLLBACK = path.join(ROOT, "docs/ABS_TRACKING_ROLLBACK.sql");
const ENV = {
  ABS_TRACKING_MODE: "shadow",
  ABS_API_BASE_URL: "https://abs.example.test",
  ABS_API_KEY: "integration-key-NOT-REAL",
  ABS_BACKFILL_FROM: "2026-11-01",
};

describeIfDb("ABS tracking Phase 1 (integration)", () => {
  type Db = import("#root/shared/database/drizzle/db").DatabaseClient;
  let db: Db;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let worker: typeof import("../worker");
  let readiness: typeof import("../readiness");
  let cfg: typeof import("#root/shared/config/abs-tracking");
  let autoMigrate: typeof import("#root/shared/database/auto-migrate");
  let helpers: typeof import("./fixture-helpers");
  let orderIdByKey: Map<string, string>;
  let keyByOrderId: Map<string, string>;
  let seeded: { fileId: string; categoryId: string; productId: string } | undefined;
  const TAG = "abs-it-";

  const listFetch = (pages: Array<unknown | { status: number }>, delayMs = 0) => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    let i = 0;
    const impl = vi.fn(async (url: string, init: { body?: string }) => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      calls.push({ url, body: init.body ? JSON.parse(init.body) : {} });
      const reply = pages[Math.min(i, pages.length - 1)] as { status?: number };
      const isError = typeof reply?.status === "number" && !(reply as { data?: unknown }).data;
      if (!isError) i++;
      const status = isError ? (reply.status as number) : 200;
      return { status, ok: status < 300, headers: { get: () => null }, text: async () => JSON.stringify(isError ? { message: "boom" } : reply) };
    });
    return { impl, calls };
  };

  const tick = (fetchImpl: unknown, extra: Partial<import("../worker").AbsTickDeps> = {}) =>
    worker.runAbsTrackingTick({
      db,
      config: cfg.readAbsTrackingConfig(ENV),
      fetchImpl: fetchImpl as never,
      clientOptions: { sleep: async () => {}, minGapMs: 0 },
      log: () => {},
      ...extra,
    });

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

  const withDatabase = async <T>(name: string, fn: (url: string) => Promise<T>): Promise<T> => {
    const admin = new pg.Client({ connectionString: TEST_DB_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(TEST_DB_URL as string);
    url.pathname = `/${name}`;
    try {
      return await fn(url.toString());
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    }
  };

  const migrateQuietly = async (url: string) => {
    const saved = process.env.DATABASE_URL;
    const spies = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
    process.env.DATABASE_URL = url;
    try {
      await autoMigrate.runMigrations();
    } finally {
      process.env.DATABASE_URL = saved;
      for (const s of spies) s.mockRestore();
    }
  };

  /** Shape of every NON-abs object: columns, indexes, constraints. */
  const nonAbsShape = async (client: pg.Client) => {
    const q = await client.query(`
      SELECT md5(string_agg(x, '|' ORDER BY x)) AS h FROM (
        SELECT table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') AS x
          FROM information_schema.columns WHERE table_schema = 'public' AND table_name NOT LIKE 'abs\\_%'
        UNION ALL
        SELECT tablename || ':' || indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename NOT LIKE 'abs\\_%'
        UNION ALL
        SELECT conrelid::regclass::text || ':' || conname || ':' || pg_get_constraintdef(oid) FROM pg_constraint
          WHERE connamespace = 'public'::regnamespace AND conrelid::regclass::text NOT LIKE 'abs\\_%'
        UNION ALL
        SELECT t.typname || ':' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname
      ) s`);
    return String(q.rows[0]?.h);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema }) as unknown as Db;
    worker = await import("../worker");
    readiness = await import("../readiness");
    cfg = await import("#root/shared/config/abs-tracking");
    autoMigrate = await import("#root/shared/database/auto-migrate");
    helpers = await import("./fixture-helpers");

    // The shared test DB is built by `drizzle-kit push`; if it predates 0070 /
    // 0071, apply them exactly as auto-migrate would (both are idempotent).
    const ready = await readiness.checkAbsTrackingReadiness(db);
    if (!ready.ready) {
      for (const file of MIGRATIONS) {
        for (const stmt of autoMigrate.splitMigrationStatements(readFileSync(file, "utf8"))) {
          try {
            await db.execute(sql.raw(stmt));
          } catch (err) {
            // Same tolerance as auto-migrate: an object that already exists.
            if (!/already exists/i.test(String((err as { cause?: { message?: string } })?.cause?.message ?? (err as Error)?.message))) throw err;
          }
        }
      }
    }
    expect((await readiness.checkAbsTrackingReadiness(db)).ready).toBe(true);

    // Synthetic fixture orders (order numbers 9100001+ never collide with the real sequence).
    const fixtures = helpers.fixtureOrders();
    await resetAbs();
    const stale = await db.select({ id: schema.order.id }).from(schema.order).where(inArray(schema.order.orderNumber, fixtures.map((o) => o.orderNumber)));
    if (stale.length) {
      await db.delete(schema.orderLog).where(inArray(schema.orderLog.orderId, stale.map((s) => s.id)));
      await db.delete(schema.orderItem).where(inArray(schema.orderItem.orderId, stale.map((s) => s.id)));
    }
    await db.delete(schema.order).where(inArray(schema.order.orderNumber, fixtures.map((o) => o.orderNumber)));
    const inserted = await db
      .insert(schema.order)
      .values(
        fixtures.map((o) => ({
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
    const keyByNumber = new Map(fixtures.map((o) => [o.orderNumber, o.key]));
    orderIdByKey = new Map(inserted.map((r) => [keyByNumber.get(r.orderNumber) as string, r.id]));
    keyByOrderId = new Map([...orderIdByKey].map(([k, v]) => [v, k]));

    // Rows in product / order_item / order_log too, so the no-write proof
    // hashes real data in every table it names.
    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    const [cat] = await db.insert(schema.category).values({ name: `${TAG}cat`, slug: `${TAG}cat-${Date.now()}`, type: "general" }).returning();
    const [prod] = await db
      .insert(schema.product)
      .values({ name: `${TAG}piece`, description: "abs fixture", imageId: file?.id as string, categoryId: cat?.id as string, price: "100.00", vendorId: storeOwner, stock: 50 })
      .returning();
    const productId = prod?.id as string;
    seeded = { fileId: file?.id as string, categoryId: cat?.id as string, productId };
    const orderIds = [...orderIdByKey.values()];
    await db.insert(schema.orderItem).values(
      orderIds.map((orderId) => ({ orderId, productId, vendorId: storeOwner, name: `${TAG}piece`, price: "100.00", quantity: 1 })),
    );
    await db.insert(schema.orderLog).values(orderIds.map((orderId) => ({ orderId, action: "created" as const })));
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await resetAbs();
    const ids = [...(orderIdByKey?.values() ?? [])];
    if (ids.length) {
      await db.delete(schema.orderLog).where(inArray(schema.orderLog.orderId, ids));
      await db.delete(schema.orderItem).where(inArray(schema.orderItem.orderId, ids));
    }
    await db.delete(schema.order).where(inArray(schema.order.orderNumber, helpers.fixtureOrders().map((o) => o.orderNumber)));
    if (seeded) {
      await db.delete(schema.product).where(eq(schema.product.id, seeded.productId));
      await db.delete(schema.category).where(eq(schema.category.id, seeded.categoryId));
      await db.delete(schema.file).where(eq(schema.file.id, seeded.fileId));
    }
    await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  });

  // ── Migration ───────────────────────────────────────────────────────────

  it("0070 applies on a fresh DB, and on a DB at 0069 without touching any existing object; readiness gates the mode", async () => {
    await withDatabase("abs_mig_it", async (url) => {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      const { drizzle } = await import("drizzle-orm/node-postgres");
      const dbFresh = drizzle(url) as unknown as Db;
      try {
        // Empty DB: tables missing → effective mode stays off.
        const before = await readiness.initAbsTracking(dbFresh, ENV, { info: () => {}, warn: () => {} });
        expect(before.effective).toBe("off");
        expect(before.reason).toMatch(/not ready: table abs_shipment/);

        // Fresh DB: the whole chain as production boots it.
        await migrateQuietly(url);
        const applied = await client.query("SELECT hash FROM __drizzle_migrations WHERE hash IN ('0070_abs_tracking.sql', '0071_abs_tracking_review.sql')");
        expect(applied.rowCount).toBe(2);
        expect((await readiness.checkAbsTrackingReadiness(dbFresh)).ready).toBe(true);

        // Back to "at 0069" with the documented rollback, then forward again.
        await client.query(readFileSync(ROLLBACK, "utf8"));
        // The rollback file is itself re-runnable.
        await client.query(readFileSync(ROLLBACK, "utf8"));
        await client.query("DELETE FROM __drizzle_migrations WHERE hash IN ('0070_abs_tracking.sql', '0071_abs_tracking_review.sql')");
        expect((await readiness.checkAbsTrackingReadiness(dbFresh)).ready).toBe(false);
        const shapeAt0069 = await nonAbsShape(client);
        await migrateQuietly(url);
        expect((await client.query("SELECT 1 FROM __drizzle_migrations WHERE hash IN ('0070_abs_tracking.sql', '0071_abs_tracking_review.sql')")).rowCount).toBe(2);
        expect((await readiness.checkAbsTrackingReadiness(dbFresh)).ready).toBe(true);
        // Strictly additive: no existing column, index, constraint or enum changed.
        expect(await nonAbsShape(client)).toBe(shapeAt0069);
        const absTables = await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'abs\\_%'");
        expect(absTables.rows[0]?.n).toBe(7);

        // A third boot is a no-op.
        await migrateQuietly(url);
        expect(await nonAbsShape(client)).toBe(shapeAt0069);
      } finally {
        await client.end();
        await (dbFresh as unknown as { $client: { end(): Promise<void> } }).$client.end();
      }
    });
  }, 180_000);

  // ── Full fixture tick ───────────────────────────────────────────────────

  it("a full tick from fixtures writes the expected abs_* rows; a second identical tick adds no history or decision rows; no existing table changes", async () => {
    await resetAbs();
    const before = await snapshotExisting();

    const f1 = listFetch([helpers.fixtureListResponse()]);
    const r1 = await tick(f1.impl);
    expect(r1).toMatchObject({ outcome: "ok", trigger: "backfill", pages: 1, shipmentsSeen: 15, shipmentsChanged: 15, rowsSkipped: 0 });
    expect(f1.calls).toHaveLength(1);
    expect(f1.calls[0]?.url).toBe("https://abs.example.test/api/v1/shipments/list");
    expect(f1.calls[0]?.body.lastChangeDateFrom).toBe("2026-10-31T23:30:00.000+02:00"); // backfill − 30 min overlap

    const links = await db.select().from(schema.absOrderLink);
    const decisions = await db.select().from(schema.absTrackingDecision);
    const history1 = await db.select().from(schema.absShipmentStatusHistory);
    expect(history1).toHaveLength(15);
    expect(decisions).toHaveLength(15);

    for (const c of helpers.fixtureExpected()) {
      const link = links.find((l) => l.awb === c.awb);
      expect(link, c.case).toBeDefined();
      expect(link?.state, c.case).toBe(c.linkState);
      if (c.method) expect(link?.method, c.case).toBe(c.method);
      if (c.role) expect(link?.linkRole, c.case).toBe(c.role);
      if (c.linkReason) expect(link?.reasonCode, c.case).toBe(c.linkReason);
      expect(link?.orderId ?? null, c.case).toBe(c.linkOrder ? orderIdByKey.get(c.linkOrder) : null);
      if (c.candidates) {
        const listed = (link?.candidates as Array<{ orderId: string }>).map((x) => keyByOrderId.get(x.orderId)).sort();
        expect(listed, c.case).toEqual([...c.candidates].sort());
      }
      const rows = decisions.filter((d) => d.awb === c.awb);
      expect(rows, c.case).toHaveLength(1);
      expect(rows[0]?.decision, c.case).toBe(c.decision);
      expect(rows[0]?.reasonCode, c.case).toBe(c.decisionReason);
      expect(rows[0]?.applied).toBe(false);
      expect(rows[0]?.mode).toBe("shadow");
    }
    expect(r1.linksAuto).toBe(links.filter((l) => l.state === "auto").length);
    expect(r1.decisionsNew).toBe(15);

    const [state1] = await db.select().from(schema.absSyncState);
    expect(state1?.watermark?.getTime()).toBe(r1.windowTo?.getTime());

    // Shipment rows keep phone last 4 + normalised phone; decisions only last 4.
    const s1 = (await db.select().from(schema.absShipment).where(eq(schema.absShipment.awb, "TST00001")))[0];
    expect(s1).toMatchObject({ status: "DELIVERED", statusRaw: "Delivered", consigneePhoneNorm: "1000000101", consigneePhoneLast4: "0101", cash: "450.00" });
    for (const d of decisions) expect(JSON.stringify(d.details)).not.toMatch(/\d{10}/);

    // Second identical tick (re-poll; fixture 11 included).
    const r2 = await tick(listFetch([helpers.fixtureListResponse()]).impl);
    expect(r2).toMatchObject({ outcome: "ok", trigger: "schedule", shipmentsSeen: 15, shipmentsChanged: 0, decisionsNew: 0, linksAuto: 0 });
    expect(r2.windowFrom?.getTime()).toBe((state1?.watermark?.getTime() ?? 0) - 1_800_000);
    expect(await db.select().from(schema.absShipmentStatusHistory)).toHaveLength(15);
    const decisions2 = await db.select().from(schema.absTrackingDecision).orderBy(asc(schema.absTrackingDecision.awb));
    expect(decisions2).toHaveLength(15);
    for (const d of decisions2) {
      expect(d.seenCount).toBe(2);
      const first = decisions.find((x) => x.id === d.id);
      expect(first, "same row, not a new one").toBeDefined();
      expect(d.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first?.lastSeenAt.getTime() ?? 0);
      expect(d.createdAt.getTime()).toBe(first?.createdAt.getTime());
    }
    const links2 = await db.select().from(schema.absOrderLink);
    expect(links2.map((l) => [l.awb, l.state, l.orderId]).sort()).toEqual(links.map((l) => [l.awb, l.state, l.orderId]).sort());

    // ── No-write proof ──
    const after = await snapshotExisting();
    const named = ["order", "order_item", "product", "order_log"];
    console.info(
      `[no-write proof] ${Object.keys(before).length} existing tables compared before tick 1 / after tick 2\n${named
        .map((t) => `  ${t.padEnd(10)} rows ${before[t]?.rows} → ${after[t]?.rows}   md5 ${before[t]?.md5} → ${after[t]?.md5}`)
        .join("\n")}\n  identical: ${JSON.stringify(after) === JSON.stringify(before)}`,
    );
    for (const t of named) expect(before[t], t).toBeDefined();
    expect(after).toEqual(before);
  }, 120_000);

  it("confirmed and rejected links are never overwritten by the matcher", async () => {
    await db.update(schema.absOrderLink).set({ state: "rejected", orderId: null, decidedBy: "it" }).where(eq(schema.absOrderLink.awb, "TST00002"));
    await db.update(schema.absOrderLink).set({ state: "confirmed", orderId: orderIdByKey.get("o4b") as string, decidedBy: "it" }).where(eq(schema.absOrderLink.awb, "TST00004"));
    await tick(listFetch([helpers.fixtureListResponse()]).impl);
    const [l2] = await db.select().from(schema.absOrderLink).where(eq(schema.absOrderLink.awb, "TST00002"));
    const [l4] = await db.select().from(schema.absOrderLink).where(eq(schema.absOrderLink.awb, "TST00004"));
    expect(l2).toMatchObject({ state: "rejected", orderId: null, decidedBy: "it" });
    expect(l4).toMatchObject({ state: "confirmed", orderId: orderIdByKey.get("o4b"), decidedBy: "it" });
    // The confirmed link now drives a decision (o4b processing + OUT_FOR_DELIVERY).
    const d4 = await db.select().from(schema.absTrackingDecision).where(eq(schema.absTrackingDecision.awb, "TST00004"));
    expect(d4.map((d) => d.decision).sort()).toEqual(["no_action", "would_mark_shipped"]);
  }, 60_000);

  // ── Advisory lock ───────────────────────────────────────────────────────

  it("two concurrent ticks: exactly one ok, one skipped_locked", async () => {
    await resetAbs();
    const slow = listFetch([helpers.fixtureListResponse()], 300);
    const [a, b] = await Promise.all([tick(slow.impl), tick(slow.impl)]);
    expect([a.outcome, b.outcome].sort()).toEqual(["ok", "skipped_locked"]);
    expect(slow.calls).toHaveLength(1);
    const runs = await db.select().from(schema.absSyncRun);
    expect(runs.map((r) => r.outcome).sort()).toEqual(["ok", "skipped_locked"]);
    // The lock is released afterwards.
    expect((await tick(listFetch([helpers.fixtureListResponse()]).impl)).outcome).toBe("ok");
  }, 60_000);

  // ── Partial failure ─────────────────────────────────────────────────────

  it("a 500 on page 2 → partial, watermark unchanged; the next tick re-covers the same window", async () => {
    await resetAbs();
    const W = new Date("2026-11-15T10:00:00.000Z");
    await db.insert(schema.absSyncState).values({ id: 1, watermark: W });
    const all = helpers.fixtureListResponse();
    const page1 = { data: all.data.slice(0, 5), hasMore: true, nextCursor: "p2" };
    const page2 = { data: all.data.slice(5), hasMore: false, nextCursor: null };

    const failing = listFetch([page1, { status: 500 }]);
    const r1 = await tick(failing.impl);
    expect(r1).toMatchObject({ outcome: "partial", pages: 1, shipmentsSeen: 5 });
    expect(r1.error).toMatch(/http 500/);
    expect(r1.error).not.toContain(ENV.ABS_API_KEY);
    expect(failing.calls.filter((c) => c.body.cursor === "p2")).toHaveLength(3); // retried 3×
    const [s1] = await db.select().from(schema.absSyncState);
    expect(s1?.watermark?.toISOString()).toBe(W.toISOString());
    const [run1] = await db.select().from(schema.absSyncRun).where(eq(schema.absSyncRun.outcome, "partial"));
    expect(run1?.error).toMatch(/http 500/);

    const r2 = await tick(listFetch([page1, page2]).impl);
    expect(r2).toMatchObject({ outcome: "ok", pages: 2, shipmentsSeen: 15 });
    expect(r2.windowFrom?.toISOString()).toBe(r1.windowFrom?.toISOString());
    const [s2] = await db.select().from(schema.absSyncState);
    expect(s2?.watermark?.getTime()).toBe(r2.windowTo?.getTime());
    expect(await db.select().from(schema.absShipment)).toHaveLength(15);
  }, 60_000);

  it("pagination: cursor when given, else page + hasMore; the page cap → partial with the watermark kept", async () => {
    await resetAbs();
    const { parseListResponse } = await import("../parse");
    const rows = parseListResponse(helpers.fixtureListResponse()).rows;
    const inputs: Array<{ cursor?: string | null; page?: number }> = [];
    const pages = [
      { rows: rows.slice(0, 5), skipped: 0, hasMore: true, nextCursor: null },
      { rows: rows.slice(5, 10), skipped: 0, hasMore: true, nextCursor: "c3" },
      { rows: rows.slice(10), skipped: 0, hasMore: false, nextCursor: null },
    ];
    const source = { listChangedShipments: async (i: { cursor?: string | null; page?: number }) => { inputs.push({ cursor: i.cursor ?? null, page: i.page }); return pages[inputs.length - 1] ?? pages[2] as never; } };
    const r = await tick(null, { source });
    expect(r).toMatchObject({ outcome: "ok", pages: 3, shipmentsSeen: 15 });
    expect(inputs).toEqual([{ cursor: null, page: 1 }, { cursor: null, page: 2 }, { cursor: "c3", page: 2 }]);

    await resetAbs();
    const endless = { listChangedShipments: async () => ({ rows: rows.slice(0, 1), skipped: 0, hasMore: true, nextCursor: null }) };
    const capped = await tick(null, { source: endless, maxPages: 2 });
    expect(capped).toMatchObject({ outcome: "partial", pages: 2 });
    expect(capped.error).toMatch(/page cap/);
    expect(await db.select().from(schema.absSyncState)).toHaveLength(0);
  }, 60_000);

  it("a failure on page 1 → failed, watermark unchanged", async () => {
    await resetAbs();
    const r = await tick(listFetch([{ status: 503 }]).impl);
    expect(r.outcome).toBe("failed");
    expect(await db.select().from(schema.absSyncState)).toHaveLength(0);
  }, 60_000);

  // ── Mode off ────────────────────────────────────────────────────────────

  it("mode off: init + worker start make zero queries (none to abs_*) and no ABS request", async () => {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const queries: string[] = [];
    const spyDb = drizzle(TEST_DB_URL as string, { schema, logger: { logQuery: (q: string) => queries.push(q) } }) as unknown as Db;
    const fetchImpl = vi.fn();
    try {
      for (const env of [{}, { ABS_TRACKING_MODE: "off" }, { ABS_TRACKING_MODE: "bogus", ABS_API_KEY: "x", ABS_API_BASE_URL: "https://abs.example.test" }, { ABS_TRACKING_MODE: "shadow" }]) {
        const init = await readiness.initAbsTracking(spyDb, env, { info: () => {}, warn: () => {} });
        expect(init.effective).toBe("off");
        const h = worker.startAbsTrackingWorker({ db: spyDb, config: init.config, fetchImpl: fetchImpl as never, handleSignals: false });
        expect(h.started).toBe(false);
      }
      expect(queries).toEqual([]);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await (spyDb as unknown as { $client: { end(): Promise<void> } }).$client.end();
      cfg.setEffectiveAbsTrackingMode("off");
    }
  });

  it("readiness: with the tables present the mode becomes shadow", async () => {
    const init = await readiness.initAbsTracking(db, ENV, { info: () => {}, warn: () => {} });
    expect(init.effective).toBe("shadow");
    cfg.setEffectiveAbsTrackingMode("off");
  });
});

