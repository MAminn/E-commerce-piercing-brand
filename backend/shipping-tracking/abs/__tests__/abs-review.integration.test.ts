import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import pg from "pg";

/**
 * ABS tracking Phase 2 against real Postgres: the review screen's tRPC API
 * (queries + human decisions), the recompute path, pollNow's cooldown and
 * lock, and the no-write proof across a tick, every mutation, pollNow and the
 * validation report. ABS is never called (fake fetch / injected source).
 * Skipped when TEST_DATABASE_URL is unset.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

const ENV = {
  ABS_TRACKING_MODE: "shadow",
  ABS_API_BASE_URL: "https://abs.example.test",
  ABS_API_KEY: "integration-key-NOT-REAL",
  ABS_BACKFILL_FROM: "2026-11-01",
};
const ADMIN = { id: "abs-it-admin", email: "admin@abs-it.test", role: "admin", name: "IT Admin", phone: "", token: "t", expiresAt: new Date(Date.now() + 3_600_000) };
const USER = { ...ADMIN, id: "abs-it-user", email: "user@abs-it.test", role: "user" };

/** Phase 2 extra orders (synthetic; numbers 9200001+). */
const EXTRA = [
  { key: "m1", orderNumber: 9200001, status: "processing", createdAt: "2026-11-21T10:00:00+02:00", phone: "01000002001", total: "210.00" },
  { key: "m2", orderNumber: 9200002, status: "shipped", createdAt: "2026-11-24T20:00:00+02:00", phone: "01000002002", total: "220.00" },
  { key: "m3", orderNumber: 9200003, status: "processing", createdAt: "2026-11-10T10:00:00+02:00", phone: "01000002003", total: "230.00" },
  { key: "m4", orderNumber: 9200004, status: "delivered", createdAt: "2026-11-21T10:00:00+02:00", phone: "01000002004", total: "240.00" },
  { key: "m5", orderNumber: 9200005, status: "processing", createdAt: "2026-11-21T10:00:00+02:00", phone: "01000002005", total: "100.00" },
] as const;

describeIfDb("ABS tracking Phase 2 — review screen API (integration)", () => {
  type Db = import("#root/shared/database/drizzle/db").DatabaseClient;
  let db: Db;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let worker: typeof import("../worker");
  let cfg: typeof import("#root/shared/config/abs-tracking");
  let helpers: typeof import("./fixture-helpers");
  let router: typeof import("../trpc");
  let queries: typeof import("../queries");
  let pollNow: typeof import("../poll-now");
  let admin: ReturnType<typeof import("../trpc")["absTrackingRouter"]["createCaller"]>;
  let user: typeof admin;
  const ids = new Map<string, string>();
  let seeded: { fileId: string; categoryId: string; productId: string } | undefined;
  const TAG = "abs-p2-";

  const listFetch = (body: unknown) => {
    const impl = vi.fn(async () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify(body) }));
    return impl;
  };
  const tick = (body: unknown = helpers.fixtureListResponse(), extra: Partial<import("../worker").AbsTickDeps> = {}) =>
    worker.runAbsTrackingTick({
      db,
      config: cfg.readAbsTrackingConfig(ENV),
      fetchImpl: listFetch(body) as never,
      clientOptions: { sleep: async () => {}, minGapMs: 0 },
      log: () => {},
      ...extra,
    });
  const emptyTick = () => tick(null, { source: { listChangedShipments: async () => ({ rows: [], skipped: 0, hasMore: false, nextCursor: null }) } });
  const link = async (awb: string) => (await db.select().from(schema.absOrderLink).where(eq(schema.absOrderLink.awb, awb)))[0];
  const auditRows = async () => db.select().from(schema.absAuditLog);
  const decisionsOf = async (awb: string) => db.select().from(schema.absTrackingDecision).where(eq(schema.absTrackingDecision.awb, awb));
  /** JSON without UUIDs (a random UUID can contain 10 digits in a row) — for the "no full phone" checks. */
  const noIds = (v: unknown) => JSON.stringify(v).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return "OK";
    } catch (err) {
      return (err as { code?: string }).code ?? String(err);
    }
  };

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
  const resetAbs = async () => {
    await db.execute(sql`TRUNCATE abs_tracking_decision, abs_order_link, abs_shipment_status_history, abs_shipment, abs_sync_run, abs_sync_state, abs_audit_log`);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL as string, { schema }) as unknown as Db;
    worker = await import("../worker");
    cfg = await import("#root/shared/config/abs-tracking");
    helpers = await import("./fixture-helpers");
    router = await import("../trpc");
    queries = await import("../queries");
    pollNow = await import("../poll-now");
    const readiness = await import("../readiness");
    expect((await readiness.checkAbsTrackingReadiness(db)).ready, "run the Phase 1 integration file first or apply 0070 + 0071").toBe(true);

    const fixtures = helpers.fixtureOrders();
    const numbers = [...fixtures.map((o) => o.orderNumber), ...EXTRA.map((o) => o.orderNumber)];
    await resetAbs();
    const stale = await db.select({ id: schema.order.id }).from(schema.order).where(inArray(schema.order.orderNumber, numbers));
    if (stale.length) {
      await db.delete(schema.orderLog).where(inArray(schema.orderLog.orderId, stale.map((s) => s.id)));
      await db.delete(schema.orderItem).where(inArray(schema.orderItem.orderId, stale.map((s) => s.id)));
      await db.delete(schema.order).where(inArray(schema.order.id, stale.map((s) => s.id)));
    }
    const base = { customerName: "Fixture Customer", shippingAddress: "1 Fixture Street", shippingCity: "Cairo", shippingState: "Cairo", shippingPostalCode: "00000", shippingCountry: "Egypt", shipping: "0.00", tax: "0.00" };
    const rows = [
      ...fixtures.map((o) => ({ ...base, key: o.key, orderNumber: o.orderNumber, customerPhone: o.customerPhone, subtotal: o.total, total: o.total, status: o.status, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, createdAt: new Date(o.createdAt) })),
      ...EXTRA.map((o) => ({ ...base, key: o.key, orderNumber: o.orderNumber, customerPhone: o.phone, subtotal: o.total, total: o.total, status: o.status, paymentMethod: "cod" as const, paymentStatus: "not_required" as const, createdAt: new Date(o.createdAt) })),
    ];
    const inserted = await db
      .insert(schema.order)
      .values(rows.map(({ key: _k, ...r }) => ({ ...r, customerEmail: `${_k}@abs-p2.test` })))
      .returning({ id: schema.order.id, orderNumber: schema.order.orderNumber });
    const keyByNumber = new Map(rows.map((r) => [r.orderNumber, r.key]));
    for (const r of inserted) ids.set(keyByNumber.get(r.orderNumber) as string, r.id);

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    const [cat] = await db.insert(schema.category).values({ name: `${TAG}cat`, slug: `${TAG}cat-${Date.now()}`, type: "general" }).returning();
    const [prod] = await db
      .insert(schema.product)
      .values({ name: `${TAG}piece`, description: "abs p2 fixture", imageId: file?.id as string, categoryId: cat?.id as string, price: "100.00", vendorId: storeOwner, stock: 50 })
      .returning();
    seeded = { fileId: file?.id as string, categoryId: cat?.id as string, productId: prod?.id as string };
    await db.insert(schema.orderItem).values([...ids.values()].map((orderId) => ({ orderId, productId: seeded?.productId as string, vendorId: storeOwner, name: `${TAG}piece`, price: "100.00", quantity: 1 })));
    await db.insert(schema.orderLog).values([...ids.values()].map((orderId) => ({ orderId, action: "created" as const })));

    const ctx = (session: unknown) => ({ db, clientSession: session, emailService: undefined, ipAddress: "127.0.0.1", userAgent: "vitest" }) as never;
    admin = router.absTrackingRouter.createCaller(ctx(ADMIN));
    user = router.absTrackingRouter.createCaller(ctx(USER));
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    cfg.setEffectiveAbsTrackingMode("off");
    await resetAbs();
    const all = [...ids.values()];
    if (all.length) {
      await db.delete(schema.orderLog).where(inArray(schema.orderLog.orderId, all));
      await db.delete(schema.orderItem).where(inArray(schema.orderItem.orderId, all));
      await db.delete(schema.order).where(inArray(schema.order.id, all));
    }
    if (seeded) {
      await db.delete(schema.product).where(eq(schema.product.id, seeded.productId));
      await db.delete(schema.category).where(eq(schema.category.id, seeded.categoryId));
      await db.delete(schema.file).where(eq(schema.file.id, seeded.fileId));
    }
    await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  });

  it("mode off: overview makes no query; every other procedure refuses", async () => {
    cfg.setEffectiveAbsTrackingMode("off");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const queriesSeen: string[] = [];
    const spyDb = drizzle(TEST_DB_URL as string, { schema, logger: { logQuery: (q: string) => queriesSeen.push(q) } });
    try {
      const offCaller = router.absTrackingRouter.createCaller({ db: spyDb, clientSession: ADMIN } as never);
      const ov = await offCaller.overview();
      expect(ov).toMatchObject({ mode: "off", on: false });
      const calls: Array<Promise<unknown>> = [
        offCaller.shipments(),
        offCaller.reviewQueue(),
        offCaller.decisions(),
        offCaller.actionGroups(),
        offCaller.missingAwb(),
        offCaller.runs(),
        offCaller.audit(),
        offCaller.validation(),
        offCaller.confirmLink({ awb: "TST00004", orderId: "00000000-0000-0000-0000-000000000000" }),
        offCaller.rejectLink({ awb: "TST00004", note: "nope" }),
        offCaller.manualLink({ awb: "TST00004", orderNumber: 9100001, role: "primary", note: "nope" }),
        offCaller.unlink({ awb: "TST00004", note: "nope" }),
        offCaller.acknowledgeDecision({ decisionId: "00000000-0000-0000-0000-000000000000", note: "nope" }),
        offCaller.pollNow(),
      ];
      for (const p of calls) expect(await code(p)).toBe("PRECONDITION_FAILED");
      expect(queriesSeen).toEqual([]);
    } finally {
      await (spyDb as unknown as { $client: { end(): Promise<void> } }).$client.end();
    }
  });

  it("non-admin: every procedure is FORBIDDEN", async () => {
    cfg.setEffectiveAbsTrackingMode("shadow");
    for (const p of [
      user.overview(),
      user.shipments(),
      user.validation(),
      user.confirmLink({ awb: "TST00004", orderId: "00000000-0000-0000-0000-000000000000" }),
      user.rejectLink({ awb: "TST00004", note: "nope" }),
      user.manualLink({ awb: "TST00004", orderNumber: 9100001, role: "primary", note: "nope" }),
      user.unlink({ awb: "TST00004", note: "nope" }),
      user.acknowledgeDecision({ decisionId: "00000000-0000-0000-0000-000000000000", note: "nope" }),
      user.pollNow(),
    ]) {
      expect(await code(p)).toBe("FORBIDDEN");
    }
  });

  it("human decisions: happy paths, refusals, one audit row each — and no existing table changes across a tick, every mutation, pollNow and the validation report", async () => {
    cfg.setEffectiveAbsTrackingMode("shadow");
    await resetAbs();
    const before = await snapshotExisting();
    const r1 = await tick();
    expect(r1.outcome).toBe("ok");

    // ── confirmLink ──
    expect(await link("TST00004")).toMatchObject({ state: "needs_review", reasonCode: "multiple_candidates" });
    expect(await code(admin.confirmLink({ awb: "TST00004", orderId: ids.get("o1") as string }))).toBe("BAD_REQUEST"); // not a listed candidate
    expect(await admin.confirmLink({ awb: "TST00004", orderId: ids.get("o4b") as string })).toMatchObject({ changed: true, state: "confirmed", orderNumber: 9100005 });
    expect(await link("TST00004")).toMatchObject({ state: "confirmed", orderId: ids.get("o4b"), decidedBy: ADMIN.email });
    expect((await link("TST00004"))?.recomputeRequestedAt).not.toBeNull();
    expect(await admin.confirmLink({ awb: "TST00004", orderId: ids.get("o4b") as string })).toMatchObject({ changed: false }); // repeat = no-op
    expect(await code(admin.confirmLink({ awb: "TST00004", orderId: ids.get("o4a") as string }))).toBe("CONFLICT"); // confirmed elsewhere
    expect(await code(admin.confirmLink({ awb: "TST00001", orderId: ids.get("o2") as string }))).toBe("BAD_REQUEST"); // auto link: only its own order
    expect(await admin.confirmLink({ awb: "TST00006", orderId: ids.get("o6") as string })).toMatchObject({ changed: true }); // auto → confirmed
    expect(await code(admin.confirmLink({ awb: "NOPE0001", orderId: ids.get("o6") as string }))).toBe("NOT_FOUND");
    expect(await admin.confirmLink({ awb: "TST00014", orderId: ids.get("o14") as string })).toMatchObject({ changed: true }); // #10100-type: phone ok, COD differs

    // ── rejectLink ──
    expect(await code(admin.rejectLink({ awb: "TST00002", note: "" }))).toBe("BAD_REQUEST"); // note required
    expect(await admin.rejectLink({ awb: "TST00002", note: "different customer" })).toMatchObject({ changed: true, state: "rejected" });
    expect(await link("TST00002")).toMatchObject({ state: "rejected", orderId: null, decidedBy: ADMIN.email });
    expect(await admin.rejectLink({ awb: "TST00002", note: "again" })).toMatchObject({ changed: false });
    expect(await code(admin.confirmLink({ awb: "TST00002", orderId: ids.get("o2") as string }))).toBe("PRECONDITION_FAILED"); // wrong state

    // ── manualLink ──
    expect(await code(admin.manualLink({ awb: "TST00099", orderNumber: 9100014, role: "primary", note: "same parcel" }))).toBe("CONFLICT"); // o14 taken by TST00014
    expect(await code(admin.manualLink({ awb: "TST00099", orderNumber: 9999999, role: "primary", note: "typo" }))).toBe("NOT_FOUND");
    expect(await code(admin.manualLink({ awb: "TST00099", orderNumber: 9200005, role: "primary", note: "" }))).toBe("BAD_REQUEST");
    expect(await admin.manualLink({ awb: "TST00099", orderNumber: 9200005, role: "primary", note: "phone changed by customer" })).toMatchObject({ changed: true, orderNumber: 9200005 });
    expect(await link("TST00099")).toMatchObject({ state: "confirmed", method: "manual", linkRole: "primary", orderId: ids.get("m5") });
    expect(await admin.manualLink({ awb: "TST00051", orderNumber: 9100006, role: "reverse", note: "return of #9100006" })).toMatchObject({ changed: true }); // reverse: no primary-slot conflict
    expect(await code(admin.manualLink({ awb: "TST00004", orderNumber: 9100004, role: "primary", note: "swap" }))).toBe("CONFLICT"); // confirmed: unlink first

    // ── unlink ──
    expect(await code(admin.unlink({ awb: "TST00007", note: "" }))).toBe("BAD_REQUEST");
    expect(await admin.unlink({ awb: "TST00001", note: "check with the customer" })).toMatchObject({ changed: true, state: "needs_review" });
    expect(await code(admin.unlink({ awb: "TST00001", note: "twice" }))).toBe("PRECONDITION_FAILED");
    expect(await link("TST00005")).toMatchObject({ state: "auto", orderId: ids.get("o5") }); // other AWBs untouched

    // ── acknowledgeDecision ──
    const [hold] = (await decisionsOf("TST00007")).filter((d) => d.decision === "alert");
    const [wmd] = (await decisionsOf("TST00013")).filter((d) => d.decision === "would_mark_delivered");
    expect(await code(admin.acknowledgeDecision({ decisionId: wmd?.id as string, note: "seen" }))).toBe("BAD_REQUEST");
    expect(await admin.acknowledgeDecision({ decisionId: hold?.id as string, note: "customer called back" })).toMatchObject({ changed: true });
    expect(await admin.acknowledgeDecision({ decisionId: hold?.id as string, note: "again" })).toMatchObject({ changed: false });

    // ── reads (all SELECT) ──
    const ov = await admin.overview();
    expect(ov).toMatchObject({ mode: "shadow", on: true });
    await admin.shipments({ filter: "all" });
    await admin.reviewQueue();
    await admin.decisions({ onlyOpen: true });
    await admin.actionGroups();
    await admin.missingAwb();
    await admin.runs();
    await admin.audit({ awb: "TST00004" });
    await admin.validation();

    // ── the next tick: human decisions stand; recompute happened ──
    const r2 = await tick();
    expect(r2.outcome).toBe("ok");
    expect(await link("TST00004")).toMatchObject({ state: "confirmed", orderId: ids.get("o4b") });
    expect(await link("TST00002")).toMatchObject({ state: "rejected", orderId: null }); // not re-auto-linked
    // Unlinked AWB: the matcher would auto-link o1 again, but a human touched it → review only.
    expect(await link("TST00001")).toMatchObject({ state: "needs_review", orderId: null, reasonCode: "previously_unlinked" });
    expect((await link("TST00001"))?.candidates).toEqual([expect.objectContaining({ orderId: ids.get("o1") })]);
    const d4 = (await decisionsOf("TST00004")).map((d) => d.decision);
    expect(d4).toContain("would_mark_shipped");

    // pollNow through the router: no key in the test env → skipped_config, still a manual run + audit; then the cooldown.
    const p1 = await admin.pollNow();
    expect(p1.outcome).toBe("skipped_config");
    expect(await code(admin.pollNow())).toBe("TOO_MANY_REQUESTS");

    // ── audit: exactly one row per CHANGING action ──
    const audit = await auditRows();
    const byAction = audit.reduce<Record<string, number>>((acc, a) => {
      acc[a.action] = (acc[a.action] ?? 0) + 1;
      return acc;
    }, {});
    expect(byAction).toEqual({ link_confirm: 3, link_reject: 1, link_manual: 2, link_unlink: 1, alert_ack: 1, poll_now: 1 });
    for (const a of audit) expect(a.actor).toBe(ADMIN.email);
    const confirm4 = audit.find((a) => a.action === "link_confirm" && a.awb === "TST00004");
    expect(confirm4?.before).toMatchObject({ state: "needs_review", orderId: null });
    expect(confirm4?.after).toMatchObject({ state: "confirmed", orderId: ids.get("o4b"), orderNumber: 9100005 });
    expect(JSON.stringify(audit)).not.toMatch(/0100000\d{4}|Fake Consignee|Fixture Customer/);
    expect((await admin.audit({ awb: "TST00002" })).map((a) => a.action)).toEqual(["link_reject"]);

    // ── No-write proof ──
    const after = await snapshotExisting();
    const named = ["order", "order_item", "product", "order_log"];
    console.info(
      `[no-write proof, Phase 2] ${Object.keys(before).length} existing tables compared before / after: 2 ticks, confirm ×3, reject, manual link ×2, unlink, acknowledge, pollNow, every query and the validation report\n${named
        .map((t) => `  ${t.padEnd(10)} rows ${before[t]?.rows} → ${after[t]?.rows}   md5 ${before[t]?.md5} → ${after[t]?.md5}`)
        .join("\n")}\n  identical: ${JSON.stringify(after) === JSON.stringify(before)}`,
    );
    for (const t of named) expect(before[t], t).toBeDefined();
    expect(after).toEqual(before);
  }, 120_000);

  it("a new decision for the same AWB (new dedupe key) is never hidden by an old acknowledgement", async () => {
    const [hold] = (await decisionsOf("TST00007")).filter((d) => d.decision === "alert" && d.reasonCode === "delivery_problem");
    expect(hold?.acknowledgedAt).not.toBeNull();
    const body = helpers.fixtureListResponse();
    body.data = body.data.map((r) => (r.awb === "TST00007" ? { ...r, status: "Lost", lastEventCode: null } : r));
    await tick(body);
    const rows = await decisionsOf("TST00007");
    const lost = rows.find((d) => d.reasonCode === "status_lost");
    expect(lost).toMatchObject({ decision: "alert", acknowledgedAt: null });
    const open = await admin.decisions({ onlyOpen: true });
    expect(open.map((d) => d.id)).toContain(lost?.id);
    expect(open.map((d) => d.id)).not.toContain(hold?.id);
    // The re-seen acknowledged row keeps its acknowledgement.
    const body2 = helpers.fixtureListResponse();
    await tick(body2);
    expect((await decisionsOf("TST00007")).find((d) => d.id === hold?.id)?.acknowledgedAt).not.toBeNull();
  }, 60_000);

  it("recompute: a link change is re-decided by the next tick even when ABS reports nothing; the flag is cleared", async () => {
    await admin.unlink({ awb: "TST00006", note: "re-check" });
    expect((await link("TST00006"))?.recomputeRequestedAt).not.toBeNull();
    const r = await emptyTick();
    expect(r.recomputed).toBeGreaterThanOrEqual(1);
    expect((await link("TST00006"))?.recomputeRequestedAt).toBeNull();
    const latest = (await decisionsOf("TST00006")).sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())[0];
    // RETURNED_TO_SHIPPER with no usable link → the rule engine's unlinked-terminal alert.
    expect(latest).toMatchObject({ decision: "alert", reasonCode: "unlinked_terminal", orderId: null });
  }, 60_000);

  it("recompute: an order whose status changed on the website gets a fresh decision (read-only on order)", async () => {
    // Simulate an admin marking o13 delivered (test setup writes; the app does not).
    await db.update(schema.order).set({ status: "delivered" }).where(eq(schema.order.id, ids.get("o13") as string));
    const r = await emptyTick();
    expect(r.recomputed).toBeGreaterThanOrEqual(1);
    const rows = await decisionsOf("TST00013");
    expect(rows.map((d) => d.reasonCode).sort()).toEqual(["already_delivered", "delivered_amount_ok"]);
    const latest = rows.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())[0];
    expect(latest).toMatchObject({ reasonCode: "already_delivered", orderStatusAtDecision: "delivered", orderTotalAtDecision: "700.00" });
    // Idempotent: nothing stale now.
    expect((await emptyTick()).recomputed).toBe(0);
    await db.update(schema.order).set({ status: "shipped" }).where(eq(schema.order.id, ids.get("o13") as string));
  }, 60_000);

  it("pollNow: lock held by another tick → skipped_locked; cooldown ends after 2 minutes", async () => {
    const client = new pg.Client({ connectionString: TEST_DB_URL });
    await client.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1::bigint)", [worker.ABS_TICK_LOCK_KEY]);
      const later = new Date(Date.now() + 3 * 60_000);
      const res = await pollNow.runPollNow({
        db,
        actor: ADMIN.email,
        config: cfg.readAbsTrackingConfig(ENV),
        now: () => later,
        fetchImpl: listFetch(helpers.fixtureListResponse()) as never,
        clientOptions: { sleep: async () => {}, minGapMs: 0 },
      });
      expect(res.outcome).toBe("skipped_locked");
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [worker.ABS_TICK_LOCK_KEY]);
      const evenLater = new Date(later.getTime() + 3 * 60_000);
      const ok = await pollNow.runPollNow({
        db,
        actor: ADMIN.email,
        config: cfg.readAbsTrackingConfig(ENV),
        now: () => evenLater,
        fetchImpl: listFetch(helpers.fixtureListResponse()) as never,
        clientOptions: { sleep: async () => {}, minGapMs: 0 },
      });
      expect(ok).toMatchObject({ outcome: "ok", shipmentsSeen: 15 });
      const runs = await db.select().from(schema.absSyncRun).where(eq(schema.absSyncRun.trigger, "manual"));
      expect(runs.length).toBeGreaterThanOrEqual(3);
      expect((await auditRows()).filter((a) => a.action === "poll_now")).toHaveLength(3);
    } finally {
      await client.end();
    }
  }, 60_000);

  it("shipments: filters, search by phone last 4 / order number / AWB, keyset pagination", async () => {
    const all = await admin.shipments({ filter: "all", limit: 100 });
    expect(all.items).toHaveLength(15);
    const awbs = (f: (typeof import("../queries"))["SHIPMENT_FILTERS"][number]) => admin.shipments({ filter: f, limit: 100 }).then((r) => r.items.map((i) => i.awb).sort());
    expect(await awbs("needs_review")).toEqual(expect.arrayContaining(["TST00001", "TST00006"]));
    expect(await awbs("returned_to_us")).toEqual(["TST00006"]);
    expect(await awbs("delivered_not_on_website")).toEqual(expect.arrayContaining(["TST00001", "TST00003"]));
    expect(await awbs("would_change")).toEqual(expect.arrayContaining(["TST00004"]));
    // TST00007's latest decision is the acknowledged HOLD alert (re-seen) → not listed.
    const alerts = await awbs("alerts");
    expect(alerts).toEqual(expect.arrayContaining(["TST00001", "TST00006", "TST00009"]));
    expect(alerts).not.toContain("TST00007");
    expect((await admin.shipments({ search: "0101" })).items.map((i) => i.awb)).toEqual(["TST00001"]);
    expect((await admin.shipments({ search: "#9100005" })).items.map((i) => i.awb)).toEqual(["TST00004"]);
    expect((await admin.shipments({ search: "tst0001" })).items.length).toBeGreaterThanOrEqual(4);
    const p1 = await admin.shipments({ limit: 6 });
    const p2 = await admin.shipments({ limit: 6, cursor: p1.nextCursor });
    const p3 = await admin.shipments({ limit: 6, cursor: p2.nextCursor });
    const seen = [...p1.items, ...p2.items, ...p3.items].map((i) => i.awb);
    expect(new Set(seen).size).toBe(15);
    expect(p3.nextCursor).toBeNull();
    // No full phone ever leaves the server.
    expect(noIds(all)).not.toMatch(/\d{10}/);
  }, 60_000);

  it("review queue lists candidates with website status, total and phone last 4 only", async () => {
    const q = await admin.reviewQueue();
    const t14 = q.find((x) => x.awb === "TST00001");
    expect(t14?.candidates[0]).toMatchObject({ orderNumber: 9100001, websiteStatus: "shipped", total: 450, phoneLast4: "0101" });
    expect(noIds(q)).not.toMatch(/\d{10}|Fixture Customer|Fixture Street/);
  });

  it("missing AWB: ABS-only cut-off, legacy exemption, days threshold, linked orders excluded", async () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const rows = await queries.getMissingAwb(db, { absOnlySince: new Date("2026-11-18T00:00:00+02:00"), missingAwbAlertDays: 2 }, now);
    const mine = rows.filter((r) => EXTRA.some((e) => e.orderNumber === r.orderNumber)).map((r) => r.orderNumber);
    // m1 flagged; m2 too recent; m3 legacy; m4 delivered; m5 linked (manual link above).
    expect(mine).toEqual([9200001]);
    expect(rows.find((r) => r.orderNumber === 9200001)).toMatchObject({ status: "processing", phoneLast4: "2001", ageDays: 4 });
  });

  it("validation report on the DB: reads only, numbers consistent with the decisions", async () => {
    const before = await snapshotExisting();
    const v = await admin.validation({ from: new Date("2026-01-01T00:00:00Z") });
    expect(v.delivered.proposals.map((p) => p.orderNumber)).toEqual(expect.arrayContaining([9100001, 9100013]));
    expect(v.matching.autoOverruled).toBeGreaterThanOrEqual(1); // TST00001 was auto, then unlinked by a human
    expect(v.targets).toHaveLength(5);
    expect(await snapshotExisting()).toEqual(before);
  });
});
