import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Phase 6 bundle sales analytics, against a real Postgres.
 *
 * Skipped when TEST_DATABASE_URL is unset — same convention as the other
 * *.integration.test.ts files.
 *
 * Most tests seed `order` / `order_bundle` / `order_item` rows DIRECTLY. That
 * is deliberate: analytics reads exactly those three tables, and only direct
 * seeding can produce the states the checkout flow cannot reach on demand —
 * an order placed 40 days ago, a cancelled order, a campaign deleted after
 * its sales, a tier that was repriced between two purchases. One test at the
 * end runs the real `createOrder` end to end so the seeded shape is pinned to
 * what the order writer actually produces.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("bundle sales analytics (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let analytics: typeof import("#root/backend/bundles/analytics");
  let bundleService: typeof import("#root/backend/bundles/service");
  let createOrderModule: typeof import("#root/backend/orders/create-order/service");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;
  let EmailService: typeof import("#root/shared/email/service").EmailService;

  const TAG = "bundle-analytics-it-";
  let vendorId: string;
  let categoryId: string;
  let fileId: string;
  /** Eight products at 100.00 each. */
  let productIds: string[] = [];

  const stubEmail = { sendEmail: () => Effect.succeed({ success: true }) };

  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      | import("#root/shared/database/drizzle/db").DatabaseClientService
      | import("#root/shared/email/service").EmailService
    >,
  ) =>
    Effect.runPromise(
      effect.pipe(
        provideDatabase({ db: db as never }),
        Effect.provideService(EmailService, stubEmail as never),
      ),
    );

  const report = (input: Record<string, unknown> = {}) =>
    run(
      analytics.getBundleAnalytics(
        analytics.bundleAnalyticsSchema.parse({ period: "all", ...input }),
      ),
    );

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    analytics = await import("#root/backend/bundles/analytics");
    bundleService = await import("#root/backend/bundles/service");
    createOrderModule = await import("#root/backend/orders/create-order/service");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));
    ({ EmailService } = await import("#root/shared/email/service"));

    // createOrder stamps order lines with the STORE OWNER vendor, so seeding
    // products under that same vendor keeps the end-to-end test's FK valid.
    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db
      .insert(schema.vendor)
      .values({ id: storeOwner, name: `${TAG}store`, status: "active" })
      .onConflictDoNothing();
    vendorId = storeOwner;
    const [f] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = f!.id;
    const [cat] = await db
      .insert(schema.category)
      .values({ name: `${TAG}cat`, slug: `${TAG}cat`, type: "general" })
      .returning();
    categoryId = cat!.id;

    const rows = await db
      .insert(schema.product)
      .values(
        Array.from({ length: 8 }, (_, i) => ({
          name: `${TAG}product-${i}`,
          description: "it",
          imageId: fileId,
          categoryId,
          price: "100.00",
          vendorId,
          stock: 500,
        })),
      )
      .returning({ id: schema.product.id });
    productIds = rows.map((r) => r.id);
  });

  const cleanup = async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db
      .delete(schema.bundleCampaign)
      .where(like(schema.bundleCampaign.internalName, `${TAG}%`));
  };

  beforeEach(async () => {
    await cleanup();
    await db.update(schema.product).set({ stock: 500 }).where(inArray(schema.product.id, productIds));
  });

  afterAll(async () => {
    await cleanup();
    await db.delete(schema.product).where(inArray(schema.product.id, productIds));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
    // The store-owner vendor is shared with the other integration suites, so
    // it is left in place.
  });

  // ── Seeding helpers ────────────────────────────────────────────────────────

  let seq = 0;

  /** An order row. `createdAt` and `status` are what the sales filter reads. */
  async function seedOrder(opts: {
    total: number;
    createdAt?: Date;
    status?: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
    archived?: boolean;
  }): Promise<string> {
    seq += 1;
    const [row] = await db
      .insert(schema.order)
      .values({
        customerName: "Analytics Tester",
        customerEmail: `${TAG}${seq}@example.test`,
        customerPhone: "+201000000000",
        shippingAddress: "1 Test St",
        shippingCity: "Cairo",
        shippingState: "Cairo",
        shippingPostalCode: "11511",
        shippingCountry: "Egypt",
        subtotal: opts.total.toFixed(2),
        shipping: "0.00",
        tax: "0.00",
        total: opts.total.toFixed(2),
        status: opts.status ?? "delivered",
        createdAt: opts.createdAt ?? new Date(),
        archivedAt: opts.archived ? new Date() : null,
      })
      .returning({ id: schema.order.id });
    return row!.id;
  }

  /**
   * One purchased bundle instance plus its child lines, shaped exactly as
   * backend/orders/create-order/service.ts writes them: the children carry
   * REGULAR prices, the snapshot carries the charged total.
   */
  async function seedBundle(
    orderId: string,
    opts: {
      campaignId?: string | null;
      slug?: string;
      title?: string;
      type?: "build_your_stack" | "curated_stack";
      quantity: number;
      bundleTotal: number;
      regularTotal?: number;
      /** [productId, units] pairs. Defaults to `quantity` distinct products ×1. */
      children?: [string, number][];
      createdAt?: Date;
    },
  ): Promise<string> {
    seq += 1;
    const children: [string, number][] =
      opts.children ?? productIds.slice(0, opts.quantity).map((id) => [id, 1] as [string, number]);
    const [snapshot] = await db
      .insert(schema.orderBundle)
      .values({
        orderId,
        instanceId: `inst-${seq}`,
        campaignId: opts.campaignId ?? null,
        campaignSlug: opts.slug ?? `${TAG}slug`,
        campaignTitle: opts.title ?? "Build Your Ear Stack",
        campaignType: opts.type ?? "build_your_stack",
        requiredQuantity: opts.quantity,
        regularTotal: (opts.regularTotal ?? opts.quantity * 100).toFixed(2),
        bundleTotal: opts.bundleTotal.toFixed(2),
        offerStacking: "exclusive",
        createdAt: opts.createdAt ?? new Date(),
      })
      .returning({ id: schema.orderBundle.id });

    await db.insert(schema.orderItem).values(
      children.map(([productId, units]) => ({
        orderId,
        productId,
        vendorId,
        quantity: units,
        price: "100.00",
        name: `${TAG}child`,
        orderBundleId: snapshot!.id,
      })),
    );
    return snapshot!.id;
  }

  /** A standalone (non-bundle) product line — must never enter bundle revenue. */
  async function seedStandalone(orderId: string, price: number, quantity = 1) {
    await db.insert(schema.orderItem).values({
      orderId,
      productId: productIds[0]!,
      vendorId,
      quantity,
      price: price.toFixed(2),
      name: `${TAG}standalone`,
      orderBundleId: null,
    });
  }

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  // ── Aggregates ─────────────────────────────────────────────────────────────

  describe("aggregate metrics", () => {
    it("reports zeros — not nulls or NaN — when nothing has sold", async () => {
      const r = await report();
      expect(r.totals).toMatchObject({
        instances: 0,
        orders: 0,
        pieces: 0,
        revenue: 0,
        averageBundleValue: 0,
      });
      expect(r.byCampaign).toEqual([]);
      expect(r.series).toEqual([]);
    });

    it("Scenario A: sums charged bundle totals across mixed types", async () => {
      const o1 = await seedOrder({ total: 1300 });
      await seedBundle(o1, { quantity: 6, bundleTotal: 480 });
      await seedBundle(o1, { quantity: 3, bundleTotal: 270 });
      await seedBundle(o1, {
        quantity: 5,
        bundleTotal: 550,
        type: "curated_stack",
        title: "Curated Stack",
        slug: `${TAG}curated`,
      });

      const r = await report();
      expect(r.totals.instances).toBe(3);
      expect(r.totals.revenue).toBe(1300);
      expect(r.totals.pieces).toBe(6 + 3 + 5);
      expect(r.totals.orders).toBe(1);
    });

    it("Scenario B: two instances of one campaign in one order stay two sales, and a standalone line stays out", async () => {
      const o = await seedOrder({ total: 1260 });
      await seedBundle(o, { quantity: 6, bundleTotal: 480 });
      await seedBundle(o, { quantity: 6, bundleTotal: 480 });
      await seedStandalone(o, 300);

      const r = await report();
      expect(r.totals.instances).toBe(2);
      expect(r.totals.orders).toBe(1);
      // 960, never 1260 — the standalone product is not bundle revenue.
      expect(r.totals.revenue).toBe(960);
    });

    it("never double-counts children: a 480 bundle whose parts list at 600 contributes 480", async () => {
      const o = await seedOrder({ total: 480 });
      await seedBundle(o, { quantity: 6, bundleTotal: 480, regularTotal: 600 });

      const r = await report();
      expect(r.totals.revenue).toBe(480);
      expect(r.totals.revenue).not.toBe(600);
      expect(r.totals.revenue).not.toBe(1080);
      expect(r.totals.regularValue).toBe(600);
      expect(r.totals.savings).toBe(120);
    });

    it("counts instances across orders but orders only once each", async () => {
      const o1 = await seedOrder({ total: 960 });
      await seedBundle(o1, { quantity: 6, bundleTotal: 480 });
      await seedBundle(o1, { quantity: 6, bundleTotal: 480 });
      const o2 = await seedOrder({ total: 270 });
      await seedBundle(o2, { quantity: 3, bundleTotal: 270 });

      const r = await report();
      expect(r.totals.instances).toBe(3);
      expect(r.totals.orders).toBe(2);
      expect(r.totals.revenue).toBe(1230);
    });

    it("derives the average bundle value from charged revenue", async () => {
      const o = await seedOrder({ total: 1000 });
      await seedBundle(o, { quantity: 6, bundleTotal: 480 });
      await seedBundle(o, { quantity: 6, bundleTotal: 520 });

      const r = await report();
      expect(r.totals.averageBundleValue).toBe(500);
    });

    it("reports a negative difference truthfully when a stack costs more than its parts", async () => {
      const o = await seedOrder({ total: 700 });
      await seedBundle(o, { quantity: 6, bundleTotal: 700, regularTotal: 600 });

      const r = await report();
      expect(r.totals.savings).toBe(-100);
    });
  });

  // ── Sales-status filtering ─────────────────────────────────────────────────

  describe("which orders count", () => {
    it("excludes cancelled orders and counts every other status", async () => {
      for (const status of ["pending", "processing", "shipped", "delivered"] as const) {
        const o = await seedOrder({ total: 480, status });
        await seedBundle(o, { quantity: 6, bundleTotal: 480 });
      }
      const cancelled = await seedOrder({ total: 480, status: "cancelled" });
      await seedBundle(cancelled, { quantity: 6, bundleTotal: 480 });

      const r = await report();
      expect(r.totals.instances).toBe(4);
      expect(r.totals.revenue).toBe(1920);
    });

    it("excludes archived orders, matching the store-wide revenue rule", async () => {
      const live = await seedOrder({ total: 480 });
      await seedBundle(live, { quantity: 6, bundleTotal: 480 });
      const archived = await seedOrder({ total: 480, archived: true });
      await seedBundle(archived, { quantity: 6, bundleTotal: 480 });

      const r = await report();
      expect(r.totals.instances).toBe(1);
      expect(r.totals.revenue).toBe(480);
    });

    it("applies the SAME rule to every breakdown, not just the headline totals", async () => {
      const ok = await seedOrder({ total: 480 });
      await seedBundle(ok, { quantity: 6, bundleTotal: 480, campaignId: null });
      const cancelled = await seedOrder({ total: 999, status: "cancelled" });
      await seedBundle(cancelled, { quantity: 6, bundleTotal: 999, campaignId: null });

      const r = await report();
      expect(r.totals.revenue).toBe(480);
      expect(r.byCampaign.reduce((s, c) => s + c.revenue, 0)).toBe(480);
      expect(r.byType.reduce((s, c) => s + c.revenue, 0)).toBe(480);
      expect(r.byTier.reduce((s, c) => s + c.revenue, 0)).toBe(480);
      expect(r.series.reduce((s, c) => s + c.revenue, 0)).toBe(480);
      // A cancelled order's children must not reach product analytics either.
      expect(r.mostIncludedInBundles.reduce((s, p) => s + p.units, 0)).toBe(6);
    });
  });

  // ── Date ranges ────────────────────────────────────────────────────────────

  describe("date ranges", () => {
    it("counts only orders inside the selected window", async () => {
      const recent = await seedOrder({ total: 480, createdAt: daysAgo(3) });
      await seedBundle(recent, { quantity: 6, bundleTotal: 480, createdAt: daysAgo(3) });
      const midRange = await seedOrder({ total: 270, createdAt: daysAgo(20) });
      await seedBundle(midRange, { quantity: 3, bundleTotal: 270, createdAt: daysAgo(20) });
      const old = await seedOrder({ total: 550, createdAt: daysAgo(60) });
      await seedBundle(old, { quantity: 5, bundleTotal: 550, createdAt: daysAgo(60) });

      expect((await report({ period: "7d" })).totals).toMatchObject({ instances: 1, revenue: 480 });
      expect((await report({ period: "30d" })).totals).toMatchObject({ instances: 2, revenue: 750 });
      expect((await report({ period: "90d" })).totals).toMatchObject({ instances: 3, revenue: 1300 });
      expect((await report({ period: "all" })).totals).toMatchObject({ instances: 3, revenue: 1300 });
    });

    it("treats the range as [start, end): the start instant is IN, the end instant is OUT", async () => {
      // A custom range over a single UTC day, with orders placed at its exact
      // boundaries. The end boundary belongs to the NEXT day, never to both.
      const day = "2026-06-15";
      const boundaries: [Date, number][] = [
        [new Date("2026-06-15T00:00:00.000Z"), 100],
        [new Date("2026-06-15T23:59:59.999Z"), 200],
        [new Date("2026-06-16T00:00:00.000Z"), 400],
      ];
      for (const [when, price] of boundaries) {
        const o = await seedOrder({ total: price, createdAt: when });
        await seedBundle(o, { quantity: 3, bundleTotal: price, createdAt: when });
      }

      const r = await report({ period: "custom", from: day, to: day });
      expect(r.totals.instances).toBe(2);
      // 100 + 200: the 16th's order is excluded by the exclusive end.
      expect(r.totals.revenue).toBe(300);
    });

    it("buckets the time series by UTC day without shifting an order's date", async () => {
      const when = new Date("2026-06-15T22:30:00.000Z");
      const o = await seedOrder({ total: 480, createdAt: when });
      await seedBundle(o, { quantity: 6, bundleTotal: 480, createdAt: when });

      const r = await report({ period: "custom", from: "2026-06-15", to: "2026-06-15" });
      expect(r.range.bucket).toBe("day");
      expect(r.series).toEqual([{ date: "2026-06-15", revenue: 480, instances: 1 }]);
    });
  });

  // ── Campaign performance ───────────────────────────────────────────────────

  describe("campaign performance", () => {
    const createCampaign = (overrides: Record<string, unknown> = {}) =>
      run(
        bundleService.createBundleCampaign(
          bundleService.createBundleCampaignSchema.parse({
            internalName: `${TAG}stack`,
            title: "Build Your Ear Stack",
            slug: `${TAG}ear-stack`,
            tiers: [{ quantity: 6, price: 480 }],
            eligibleProductIds: productIds.slice(0, 6),
            isActive: true,
            ...overrides,
          }),
        ),
      );

    it("breaks revenue and units down per campaign", async () => {
      const o = await seedOrder({ total: 1030 });
      await seedBundle(o, { quantity: 6, bundleTotal: 480, slug: `${TAG}a`, title: "Ear Stack" });
      await seedBundle(o, {
        quantity: 5,
        bundleTotal: 550,
        slug: `${TAG}b`,
        title: "Curated Set",
        type: "curated_stack",
      });

      const r = await report();
      expect(r.byCampaign).toHaveLength(2);
      const ear = r.byCampaign.find((c) => c.title === "Ear Stack")!;
      expect(ear).toMatchObject({
        instances: 1,
        orders: 1,
        pieces: 6,
        revenue: 480,
        type: "build_your_stack",
      });
      const curated = r.byCampaign.find((c) => c.title === "Curated Set")!;
      expect(curated).toMatchObject({ instances: 1, pieces: 5, revenue: 550, type: "curated_stack" });
    });

    it("keeps a renamed campaign as ONE row, reported under its current name", async () => {
      const campaign = await createCampaign();
      const o1 = await seedOrder({ total: 480 });
      await seedBundle(o1, {
        quantity: 6,
        bundleTotal: 480,
        campaignId: campaign.id,
        title: "Build Your Ear Stack",
        createdAt: daysAgo(5),
      });
      // A later sale snapshots the new title; both are the same campaign.
      const o2 = await seedOrder({ total: 480 });
      await seedBundle(o2, {
        quantity: 6,
        bundleTotal: 480,
        campaignId: campaign.id,
        title: "Summer Ear Stack",
        createdAt: daysAgo(1),
      });

      const r = await report();
      expect(r.byCampaign).toHaveLength(1);
      expect(r.byCampaign[0]!.title).toBe("Summer Ear Stack");
      expect(r.byCampaign[0]!.instances).toBe(2);
      expect(r.byCampaign[0]!.revenue).toBe(960);
    });

    it("keeps a deleted campaign's sales, with its snapshot identity and no live link", async () => {
      const campaign = await createCampaign();
      const o = await seedOrder({ total: 480 });
      await seedBundle(o, {
        quantity: 6,
        bundleTotal: 480,
        campaignId: campaign.id,
        slug: `${TAG}ear-stack`,
      });

      let r = await report();
      expect(r.byCampaign[0]!.campaignId).toBe(campaign.id);

      await run(bundleService.deleteBundleCampaign(campaign.id));

      r = await report();
      expect(r.byCampaign).toHaveLength(1);
      expect(r.byCampaign[0]!.campaignId).toBeNull();
      expect(r.byCampaign[0]!.title).toBe("Build Your Ear Stack");
      expect(r.byCampaign[0]!.revenue).toBe(480);
    });

    it("does not rewrite history when the campaign is repriced or deactivated", async () => {
      const campaign = await createCampaign();
      const o = await seedOrder({ total: 480 });
      await seedBundle(o, { quantity: 6, bundleTotal: 480, campaignId: campaign.id });

      const before = await report();

      await run(
        bundleService.updateBundleCampaign(
          bundleService.updateBundleCampaignSchema.parse({
            id: campaign.id,
            title: "Renamed Stack",
            tiers: [{ quantity: 6, price: 520 }],
          }),
        ),
      );
      await run(bundleService.setBundleCampaignActive(campaign.id, false));

      const after = await report();
      expect(after.totals.revenue).toBe(before.totals.revenue);
      expect(after.totals.revenue).toBe(480);
      expect(after.byTier[0]!.revenue).toBe(480);
    });
  });

  // ── Type performance ───────────────────────────────────────────────────────

  describe("type performance", () => {
    it("compares Build Your Stack against Curated Stack", async () => {
      const o = await seedOrder({ total: 1600 });
      await seedBundle(o, { quantity: 6, bundleTotal: 480 });
      await seedBundle(o, { quantity: 3, bundleTotal: 270 });
      await seedBundle(o, {
        quantity: 5,
        bundleTotal: 550,
        type: "curated_stack",
        slug: `${TAG}curated`,
      });
      await seedBundle(o, {
        quantity: 3,
        bundleTotal: 300,
        type: "curated_stack",
        slug: `${TAG}curated`,
      });

      const r = await report();
      const bys = r.byType.find((t) => t.type === "build_your_stack")!;
      const curated = r.byType.find((t) => t.type === "curated_stack")!;
      expect(bys).toMatchObject({ instances: 2, revenue: 750, pieces: 9 });
      expect(curated).toMatchObject({ instances: 2, revenue: 850, pieces: 8 });
    });
  });

  // ── Tier performance ───────────────────────────────────────────────────────

  describe("tier performance", () => {
    it("counts instances and revenue per tier size", async () => {
      const o = await seedOrder({ total: 0 });
      for (let i = 0; i < 4; i++) await seedBundle(o, { quantity: 3, bundleTotal: 270 });
      for (let i = 0; i < 2; i++) await seedBundle(o, { quantity: 4, bundleTotal: 340 });
      for (let i = 0; i < 9; i++) await seedBundle(o, { quantity: 6, bundleTotal: 480 });

      const r = await report();
      const tier = (q: number) => r.byTier.find((t) => t.quantity === q)!;
      expect(tier(3)).toMatchObject({ instances: 4, revenue: 1080, pieces: 12 });
      expect(tier(4)).toMatchObject({ instances: 2, revenue: 680, pieces: 8 });
      expect(tier(6)).toMatchObject({ instances: 9, revenue: 4320, pieces: 54 });
    });

    it("Scenario C: one tier size sold at two historical prices aggregates as one tier, revenue from each actual charge", async () => {
      const monday = await seedOrder({ total: 480, createdAt: daysAgo(4) });
      await seedBundle(monday, { quantity: 6, bundleTotal: 480, createdAt: daysAgo(4) });
      const wednesday = await seedOrder({ total: 520, createdAt: daysAgo(2) });
      await seedBundle(wednesday, { quantity: 6, bundleTotal: 520, createdAt: daysAgo(2) });

      const r = await report();
      const sixPiece = r.byTier.filter((t) => t.quantity === 6);
      expect(sixPiece).toHaveLength(1);
      expect(sixPiece[0]!.instances).toBe(2);
      // 1000, never 960 (today's price ×2) and never 1040.
      expect(sixPiece[0]!.revenue).toBe(1000);
      expect(sixPiece[0]!.averageBundleValue).toBe(500);
    });

    it("excludes curated stacks, which have no tiers", async () => {
      const o = await seedOrder({ total: 550 });
      await seedBundle(o, { quantity: 5, bundleTotal: 550, type: "curated_stack" });

      const r = await report();
      expect(r.byTier).toEqual([]);
      expect(r.totals.instances).toBe(1);
    });

    it("needs no live tier row to report a historical tier", async () => {
      const o = await seedOrder({ total: 480 });
      // No campaign, no tier row anywhere — only the snapshot.
      await seedBundle(o, { quantity: 6, bundleTotal: 480, campaignId: null });

      const r = await report();
      expect(r.byTier[0]).toMatchObject({
        quantity: 6,
        instances: 1,
        revenue: 480,
        campaignId: null,
      });
    });
  });

  // ── Product selection ──────────────────────────────────────────────────────

  describe("product performance inside bundles", () => {
    it("counts units by order-item quantity and instances by distinct bundle", async () => {
      const [x, y, z] = productIds as [string, string, string];
      const o = await seedOrder({ total: 0 });
      // Bundle A: X ×1, Y ×2.  Bundle B: X ×1, Z ×1.
      await seedBundle(o, {
        quantity: 3,
        bundleTotal: 270,
        children: [
          [x, 1],
          [y, 2],
        ],
      });
      await seedBundle(o, {
        quantity: 2,
        bundleTotal: 200,
        children: [
          [x, 1],
          [z, 1],
        ],
      });

      const r = await report();
      const by = new Map(r.mostSelectedInBuildYourStack.map((p) => [p.productId, p]));
      expect(by.get(x)).toMatchObject({ units: 2, instances: 2 });
      // Y is 2 UNITS but only 1 bundle instance — quantity must not inflate it.
      expect(by.get(y)).toMatchObject({ units: 2, instances: 1 });
      expect(by.get(z)).toMatchObject({ units: 1, instances: 1 });
    });

    it("separates what shoppers SELECTED from what was merely INCLUDED in a curated stack", async () => {
      const [x, y] = productIds as [string, string];
      const o = await seedOrder({ total: 0 });
      await seedBundle(o, { quantity: 1, bundleTotal: 100, children: [[x, 1]] });
      await seedBundle(o, {
        quantity: 1,
        bundleTotal: 100,
        type: "curated_stack",
        slug: `${TAG}curated`,
        children: [[y, 1]],
      });

      const r = await report();
      const selected = r.mostSelectedInBuildYourStack.map((p) => p.productId);
      const included = r.mostIncludedInBundles.map((p) => p.productId);
      // Y was composed by the merchant, so it is never a "most selected" product.
      expect(selected).toContain(x);
      expect(selected).not.toContain(y);
      expect(included).toEqual(expect.arrayContaining([x, y]));
    });

    it("ignores standalone lines — only bundle children count", async () => {
      const o = await seedOrder({ total: 400 });
      await seedBundle(o, { quantity: 1, bundleTotal: 100, children: [[productIds[1]!, 1]] });
      await seedStandalone(o, 300, 3);

      const r = await report();
      expect(r.mostIncludedInBundles).toHaveLength(1);
      expect(r.mostIncludedInBundles[0]).toMatchObject({ productId: productIds[1]!, units: 1 });
    });

    it("resolves the product's current name for display", async () => {
      const o = await seedOrder({ total: 100 });
      await seedBundle(o, { quantity: 1, bundleTotal: 100, children: [[productIds[2]!, 1]] });

      const r = await report();
      expect(r.mostIncludedInBundles[0]!.name).toBe(`${TAG}product-2`);
    });
  });

  // ── End-to-end through the real order writer ───────────────────────────────

  describe("end to end", () => {
    it("reads a bundle placed through createOrder, at the charged price", async () => {
      const campaign = await run(
        bundleService.createBundleCampaign(
          bundleService.createBundleCampaignSchema.parse({
            internalName: `${TAG}e2e`,
            title: "E2E Ear Stack",
            slug: `${TAG}e2e-stack`,
            tiers: [
              { quantity: 3, price: 270 },
              { quantity: 6, price: 480 },
            ],
            eligibleProductIds: productIds.slice(0, 6),
            isActive: true,
          }),
        ),
      );

      await run(
        createOrderModule.createOrder(
          createOrderModule.createOrderSchema.parse({
            customerName: "Analytics E2E",
            customerEmail: `${TAG}e2e@example.test`,
            customerPhone: "+201000000000",
            shippingAddress: "1 Test St",
            shippingCity: "Cairo",
            shippingState: "Cairo",
            shippingPostalCode: "11511",
            shippingCountry: "Egypt",
            items: [],
            bundles: [
              {
                instanceId: "e2e-1",
                campaignId: campaign.id,
                items: productIds.slice(0, 6).map((productId) => ({ productId, quantity: 1 })),
              },
            ],
            paymentMethod: "cod",
          }),
        ),
      );

      const r = await report();
      expect(r.totals.instances).toBe(1);
      // The charged tier price, not the 600 the six products list at.
      expect(r.totals.revenue).toBe(480);
      expect(r.totals.regularValue).toBe(600);
      expect(r.totals.pieces).toBe(6);
      expect(r.byTier[0]).toMatchObject({ quantity: 6, instances: 1, revenue: 480 });
      expect(r.byCampaign[0]!.campaignId).toBe(campaign.id);
      expect(r.mostSelectedInBuildYourStack).toHaveLength(6);
    });
  });

  // ── Query shape ────────────────────────────────────────────────────────────

  /**
   * Guards the property that makes this dashboard affordable: the number of
   * statements must depend on the number of BREAKDOWNS, never on how many
   * campaigns, tiers, products or days are in range. These tests seed a wide
   * spread and then assert the statement count is unchanged.
   */
  describe("query shape", () => {
    let counted: string[] = [];
    let countingDb: typeof db;

    beforeAll(async () => {
      const { drizzle } = await import("drizzle-orm/node-postgres");
      countingDb = drizzle(TEST_DB_URL!, {
        schema,
        logger: { logQuery: (q: string) => counted.push(q) },
      }) as typeof db;
    });

    const runCounted = <A, E>(
      effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
    ) => Effect.runPromise(effect.pipe(provideDatabase({ db: countingDb as never })));

    /** Several campaigns, tier sizes, products and days — enough to expose an N+1. */
    async function seedWideSpread() {
      for (let c = 0; c < 4; c++) {
        for (let d = 0; d < 3; d++) {
          const o = await seedOrder({ total: 0, createdAt: daysAgo(d + 1) });
          for (const quantity of [3, 4, 6]) {
            await seedBundle(o, {
              quantity,
              bundleTotal: quantity * 90,
              slug: `${TAG}campaign-${c}`,
              title: `Campaign ${c}`,
              children: productIds.slice(0, quantity).map((id) => [id, 1] as [string, number]),
              createdAt: daysAgo(d + 1),
            });
          }
        }
      }
    }

    it("runs exactly seven statements regardless of how much data is in range", async () => {
      counted = [];
      await runCounted(
        analytics.getBundleAnalytics(analytics.bundleAnalyticsSchema.parse({ period: "all" })),
      );
      const emptyCount = counted.length;
      // totals + campaign + type + tier + 2 × product + series.
      expect(emptyCount).toBe(7);

      await seedWideSpread();

      counted = [];
      const r = await runCounted(
        analytics.getBundleAnalytics(analytics.bundleAnalyticsSchema.parse({ period: "all" })),
      );
      // 4 campaigns × 3 tier sizes × 3 days = 36 instances across 12 orders.
      expect(r.totals.instances).toBe(36);
      expect(r.byCampaign.length).toBe(4);
      expect(r.byTier.length).toBe(12);
      expect(r.series.length).toBeGreaterThan(0);
      // Still seven: no per-campaign, per-tier or per-product follow-up query.
      expect(counted.length).toBe(emptyCount);
      expect(counted.length).toBe(7);
    });

    it("aggregates every breakdown in SQL, not in JavaScript", async () => {
      await seedWideSpread();
      counted = [];
      await runCounted(
        analytics.getBundleAnalytics(analytics.bundleAnalyticsSchema.parse({ period: "all" })),
      );
      // Six of the seven group in SQL; the odd one out is the single-row
      // totals aggregate, which needs no grouping.
      const grouped = counted.filter((q) => /group by/i.test(q));
      expect(grouped.length).toBe(6);
      expect(counted.filter((q) => !/group by/i.test(q))).toHaveLength(1);
    });

    /** Three live campaigns, so the storefront listing actually has rows to rank. */
    async function seedLiveCampaigns(n: number) {
      for (let i = 0; i < n; i++) {
        await run(
          bundleService.createBundleCampaign(
            bundleService.createBundleCampaignSchema.parse({
              internalName: `${TAG}live-${i}`,
              title: `Live ${i}`,
              slug: `${TAG}live-${i}`,
              tiers: [{ quantity: 3, price: 270 }],
              eligibleProductIds: productIds.slice(0, 3),
              isActive: true,
              sortOrder: i,
            }),
          ),
        );
      }
    }

    it("ranks Best Sellers with ONE extra grouped query and keeps hydration batched", async () => {
      await seedWideSpread();
      await seedLiveCampaigns(3);

      counted = [];
      await runCounted(bundleService.listLiveBundleCampaigns({ limit: 6 }));
      const featured = counted.length;

      counted = [];
      await runCounted(
        bundleService.listLiveBundleCampaigns({ sort: "best_selling", limit: 6, periodDays: 30 }),
      );
      expect(counted.length).toBe(featured + 1);
      expect(counted.filter((q) => /group by "order_bundle"\."campaign_id"/i.test(q))).toHaveLength(1);
    });

    it("does not load bundle product pools once per campaign", async () => {
      await seedLiveCampaigns(3);
      counted = [];
      await runCounted(
        bundleService.listLiveBundleCampaigns({ sort: "best_selling", limit: 6, periodDays: 30 }),
      );
      // The pool is read once for ALL three campaigns, never once per
      // campaign — this is the hydration batching Phase 3 introduced and the
      // Best Sellers path must not regress it.
      expect(counted.filter((q) => /from "bundle_campaign_product"/i.test(q))).toHaveLength(1);
      // And the rail as a whole stays a small, fixed number of statements.
      expect(counted.length).toBeLessThanOrEqual(8);
    });
  });
});
