import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asc, eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * End-to-end order creation with Build Your Stack instances, against a real
 * disposable Postgres. Skipped when TEST_DATABASE_URL is unset (same
 * convention as the other *.integration.test.ts files).
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("create-order with bundle instances (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let createOrderModule: typeof import("#root/backend/orders/create-order/service");
  let bundleService: typeof import("#root/backend/bundles/service");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;
  let EmailService: typeof import("#root/shared/email/service").EmailService;

  const TAG = "order-bundle-it-";
  let vendorId: string;
  let categoryId: string;
  let fileId: string;
  let productIds: string[] = [];
  let campaignId: string;

  const stubEmail = {
    sendEmail: () => Effect.succeed({ success: true }),
  };

  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      import("#root/shared/database/drizzle/db").DatabaseClientService | import("#root/shared/email/service").EmailService
    >,
  ) =>
    Effect.runPromise(
      effect.pipe(provideDatabase({ db: db as never }), Effect.provideService(EmailService, stubEmail as never)),
    );

  const runFail = async <A, E>(
    effect: Effect.Effect<
      A,
      E,
      import("#root/shared/database/drizzle/db").DatabaseClientService | import("#root/shared/email/service").EmailService
    >,
  ): Promise<string> => {
    const exit = await Effect.runPromiseExit(
      effect.pipe(provideDatabase({ db: db as never }), Effect.provideService(EmailService, stubEmail as never)),
    );
    if (exit._tag === "Success") throw new Error("expected failure");
    const err = (exit.cause as { error?: { clientMessage?: string } }).error;
    return err?.clientMessage ?? String(exit.cause);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    createOrderModule = await import("#root/backend/orders/create-order/service");
    bundleService = await import("#root/backend/bundles/service");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));
    ({ EmailService } = await import("#root/shared/email/service"));

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db
      .insert(schema.vendor)
      .values({ id: storeOwner, name: `${TAG}store`, status: "active" })
      .onConflictDoNothing();
    vendorId = storeOwner;

    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = file!.id;
    const [category] = await db
      .insert(schema.category)
      .values({ name: `${TAG}cat`, slug: `${TAG}cat`, type: "general" })
      .returning();
    categoryId = category!.id;

    const rows = await db
      .insert(schema.product)
      .values(
        Array.from({ length: 7 }, (_, i) => ({
          name: `${TAG}product-${i}`,
          description: "it",
          imageId: fileId,
          categoryId,
          price: i === 0 ? "120.00" : "100.00",
          discountPrice: i === 1 ? "80.00" : null,
          vendorId,
          stock: 10,
        })),
      )
      .returning({ id: schema.product.id });
    productIds = rows.map((r) => r.id);
  });

  beforeEach(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));
    await db.update(schema.product).set({ stock: 10 }).where(inArray(schema.product.id, productIds));

    const created = await Effect.runPromise(
      bundleService
        .createBundleCampaign(
          bundleService.createBundleCampaignSchema.parse({
            internalName: `${TAG}stack`,
            title: "Build Your Ear Stack",
            slug: `${TAG}ear-stack`,
            requiredQuantity: 6,
            fixedBundlePrice: 480,
            isActive: true,
            eligibleProductIds: productIds.slice(0, 6),
          }),
        )
        .pipe(provideDatabase({ db: db as never })),
    );
    campaignId = created.id;
  });

  afterAll(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));
    await db.delete(schema.product).where(inArray(schema.product.id, productIds));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  const baseOrder = (overrides: Record<string, unknown> = {}) =>
    createOrderModule.createOrderSchema.parse({
      customerName: "Bundle Tester",
      customerEmail: `${TAG}${Date.now()}@example.test`,
      customerPhone: "+201000000000",
      shippingAddress: "1 Test St",
      shippingCity: "Cairo",
      // Required by createOrderSchema because the columns are NOT NULL.
      // See __tests__/validation.test.ts for the contract itself.
      shippingState: "Cairo",
      shippingPostalCode: "11511",
      shippingCountry: "Egypt",
      items: [],
      bundles: [],
      paymentMethod: "cod",
      ...overrides,
    });

  const stackOf = (ids: string[], expectedBundleTotal = 480) => ({
    instanceId: `inst-${Math.random().toString(16).slice(2)}`,
    campaignId,
    expectedBundleTotal,
    items: ids.map((productId) => ({ productId, quantity: 1 })),
  });

  it("creates an order whose total is the server-derived bundle price, with a snapshot and child lines", async () => {
    const six = productIds.slice(0, 6);
    const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [stackOf(six)] })));

    // Regular value: 120 + 80 (discounted) + 4 × 100 = 600 → charged 480.
    expect(Number(order.subtotal)).toBe(600);
    expect(Number(order.discount)).toBe(120);
    expect(Number(order.total)).toBe(480 + Number(order.shipping));
    expect(order.items).toHaveLength(6);

    const [snapshot] = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, order.id));
    expect(snapshot).toMatchObject({
      campaignId,
      campaignTitle: "Build Your Ear Stack",
      requiredQuantity: 6,
      regularTotal: "600.00",
      bundleTotal: "480.00",
      offerStacking: "exclusive",
    });
    const children = await db.select().from(schema.orderItem).where(eq(schema.orderItem.orderBundleId, snapshot!.id));
    expect(children).toHaveLength(6);
    expect(children.every((c) => c.orderBundleId === snapshot!.id)).toBe(true);
  });

  it("decrements product stock exactly once per child unit, including duplicates", async () => {
    await Effect.runPromise(
      bundleService
        .updateBundleCampaign({ id: campaignId, allowDuplicates: true, maxPerProduct: 3 })
        .pipe(provideDatabase({ db: db as never })),
    );
    const a = productIds[2]!;
    const b = productIds[3]!;
    await run(
      createOrderModule.createOrder(
        baseOrder({
          bundles: [
            {
              instanceId: "inst-dupes",
              campaignId,
              expectedBundleTotal: 480,
              items: [
                { productId: a, quantity: 3 },
                { productId: b, quantity: 3 },
              ],
            },
          ],
          items: [{ productId: a, quantity: 1 }],
        }),
      ),
    );
    const [rowA] = await db.select({ stock: schema.product.stock }).from(schema.product).where(eq(schema.product.id, a));
    const [rowB] = await db.select({ stock: schema.product.stock }).from(schema.product).where(eq(schema.product.id, b));
    expect(rowA!.stock).toBe(10 - 3 - 1);
    expect(rowB!.stock).toBe(10 - 3);
  });

  it("refuses a stack whose shown price no longer matches the campaign", async () => {
    await Effect.runPromise(
      bundleService.updateBundleCampaign({ id: campaignId, fixedBundlePrice: 450 }).pipe(provideDatabase({ db: db as never })),
    );
    const message = await runFail(createOrderModule.createOrder(baseOrder({ bundles: [stackOf(productIds.slice(0, 6), 480)] })));
    expect(message).toMatch(/price .* has changed/);
  });

  it("refuses a stack for a campaign that was deactivated after it was built", async () => {
    await Effect.runPromise(bundleService.setBundleCampaignActive(campaignId, false).pipe(provideDatabase({ db: db as never })));
    const message = await runFail(createOrderModule.createOrder(baseOrder({ bundles: [stackOf(productIds.slice(0, 6))] })));
    expect(message).toMatch(/not available right now/);
  });

  it("refuses an incomplete or non-eligible stack and a second instance of a non-repeatable campaign", async () => {
    expect(await runFail(createOrderModule.createOrder(baseOrder({ bundles: [stackOf(productIds.slice(0, 5))] })))).toMatch(/not complete/);
    expect(
      await runFail(createOrderModule.createOrder(baseOrder({ bundles: [stackOf([...productIds.slice(0, 5), productIds[6]!])] }))),
    ).toMatch(/not part of this bundle/);
    expect(
      await runFail(
        createOrderModule.createOrder(baseOrder({ bundles: [stackOf(productIds.slice(0, 6)), stackOf(productIds.slice(0, 6))] })),
      ),
    ).toMatch(/only be added once/);
  });

  it("refuses when combined stock across a stack and a loose unit is insufficient, and rolls back", async () => {
    const a = productIds[0]!;
    await db.update(schema.product).set({ stock: 1 }).where(eq(schema.product.id, a));
    const message = await runFail(
      createOrderModule.createOrder(baseOrder({ bundles: [stackOf(productIds.slice(0, 6))], items: [{ productId: a, quantity: 1 }] })),
    );
    expect(message).toMatch(/not enough stock/);
    const [row] = await db.select({ stock: schema.product.stock }).from(schema.product).where(eq(schema.product.id, a));
    expect(row!.stock).toBe(1);
  });

  it("keeps the snapshot intact after the live campaign is renamed, re-priced and deleted", async () => {
    const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [stackOf(productIds.slice(0, 6))] })));
    await Effect.runPromise(
      bundleService
        .updateBundleCampaign({ id: campaignId, title: "Renamed", fixedBundlePrice: 999 })
        .pipe(provideDatabase({ db: db as never })),
    );
    await Effect.runPromise(bundleService.deleteBundleCampaign(campaignId).pipe(provideDatabase({ db: db as never })));

    const [snapshot] = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, order.id));
    expect(snapshot).toMatchObject({ campaignId: null, campaignTitle: "Build Your Ear Stack", bundleTotal: "480.00" });
    const [persisted] = await db.select().from(schema.order).where(eq(schema.order.id, order.id));
    expect(Number(persisted!.total)).toBe(480 + Number(persisted!.shipping));
  });

  // ─── Curated stacks ─────────────────────────────────────────────────────────

  /** Creates a curated campaign: product0 ×1, product1 ×1, product2 ×2 → 4 units. */
  const createCuratedCampaign = async (fixedBundlePrice = 250) => {
    const created = await Effect.runPromise(
      bundleService
        .createBundleCampaign(
          bundleService.createBundleCampaignSchema.parse({
            internalName: `${TAG}curated`,
            title: "Golden Ear Stack",
            slug: `${TAG}golden-ear-stack`,
            type: "curated_stack",
            isActive: true,
            fixedBundlePrice,
            composition: [
              { productId: productIds[0]!, quantity: 1 },
              { productId: productIds[1]!, quantity: 1 },
              { productId: productIds[2]!, quantity: 2 },
            ],
          }),
        )
        .pipe(provideDatabase({ db: db as never })),
    );
    return created;
  };

  it("orders a curated stack from the stored composition when the client sends no items", async () => {
    const curated = await createCuratedCampaign(250);
    // Regular value: 120 (product0) + 80 (product1 discounted) + 2 × 100 = 400.
    expect(curated.regularValue).toBe(400);
    expect(curated.unitCount).toBe(4);

    const order = await run(
      createOrderModule.createOrder(
        baseOrder({
          bundles: [{ instanceId: "inst-curated", campaignId: curated.id, expectedBundleTotal: 250, items: [] }],
        }),
      ),
    );

    expect(Number(order.subtotal)).toBe(400);
    expect(Number(order.discount)).toBe(150);
    expect(Number(order.total)).toBe(250 + Number(order.shipping));

    const [snapshot] = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, order.id));
    expect(snapshot).toMatchObject({
      campaignId: curated.id,
      campaignTitle: "Golden Ear Stack",
      requiredQuantity: 4,
      regularTotal: "400.00",
      bundleTotal: "250.00",
    });

    // Three product lines, and the ×2 line keeps its quantity for fulfilment.
    const children = await db.select().from(schema.orderItem).where(eq(schema.orderItem.orderBundleId, snapshot!.id));
    expect(children).toHaveLength(3);
    expect(children.find((c) => c.productId === productIds[2])?.quantity).toBe(2);
  });

  it("decrements stock by each composition quantity, not once per product", async () => {
    const curated = await createCuratedCampaign();
    await run(
      createOrderModule.createOrder(
        baseOrder({ bundles: [{ instanceId: "inst-curated", campaignId: curated.id, items: [] }] }),
      ),
    );
    const rows = await db
      .select({ id: schema.product.id, stock: schema.product.stock })
      .from(schema.product)
      .where(inArray(schema.product.id, productIds.slice(0, 3)));
    const stockOf = (id: string) => rows.find((r) => r.id === id)?.stock;
    expect(stockOf(productIds[0]!)).toBe(9);
    expect(stockOf(productIds[1]!)).toBe(9);
    expect(stockOf(productIds[2]!)).toBe(8); // ×2
  });

  it("ignores a client that tries to swap the curated composition for cheaper products", async () => {
    const curated = await createCuratedCampaign(250);
    const order = await run(
      createOrderModule.createOrder(
        baseOrder({
          bundles: [
            {
              instanceId: "inst-curated",
              campaignId: curated.id,
              expectedBundleTotal: 250,
              // Not in the composition, and a quantity the merchant never set.
              items: [{ productId: productIds[5]!, quantity: 9 }],
            },
          ],
        }),
      ),
    );
    const [snapshot] = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, order.id));
    const children = await db.select().from(schema.orderItem).where(eq(schema.orderItem.orderBundleId, snapshot!.id));
    expect(children.map((c) => c.productId).sort()).toEqual(productIds.slice(0, 3).sort());
    expect(Number(order.total)).toBe(250 + Number(order.shipping));
  });

  it("refuses a curated stack when a composition line is short on stock", async () => {
    const curated = await createCuratedCampaign();
    // The ×2 line has only 1 left.
    await db.update(schema.product).set({ stock: 1 }).where(eq(schema.product.id, productIds[2]!));
    const message = await runFail(
      createOrderModule.createOrder(
        baseOrder({ bundles: [{ instanceId: "inst-curated", campaignId: curated.id, items: [] }] }),
      ),
    );
    expect(message).toMatch(/sold out|not enough stock/i);
  });

  it("refuses a curated stack whose price changed after the shopper saw it", async () => {
    const curated = await createCuratedCampaign(250);
    await Effect.runPromise(
      bundleService.updateBundleCampaign({ id: curated.id, fixedBundlePrice: 300 }).pipe(provideDatabase({ db: db as never })),
    );
    const message = await runFail(
      createOrderModule.createOrder(
        baseOrder({
          bundles: [{ instanceId: "inst-curated", campaignId: curated.id, expectedBundleTotal: 250, items: [] }],
        }),
      ),
    );
    expect(message).toMatch(/price .* has changed/);
  });

  it("still creates an ordinary order with no bundles exactly as before", async () => {
    const order = await run(createOrderModule.createOrder(baseOrder({ items: [{ productId: productIds[1]!, quantity: 2 }] })));
    expect(Number(order.subtotal)).toBe(160);
    expect(order.discount).toBeNull();
    const snapshots = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, order.id));
    expect(snapshots).toHaveLength(0);
  });

  it("snapshots the campaign type so admin history can label the group without the live campaign", async () => {
    const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [stackOf(productIds.slice(0, 6))] })));
    const [snapshot] = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, order.id));
    expect(snapshot!.campaignType).toBe("build_your_stack");
  });

  /**
   * Scenario D end to end: the rows an order actually persists, fed through
   * the grouping the admin order detail renders. This is the test that would
   * fail if two instances of one campaign ever merged, if a standalone product
   * were swallowed into a group, or if bundle children were counted as money
   * on top of the bundle price.
   */
  it("groups a mixed order into standalone lines and independent bundle instances", async () => {
    const { groupOrderLines, chargedMerchandiseTotal, totalUnits } = await import(
      "#root/shared/bundles/order-grouping"
    );

    // The campaign must be repeatable for one cart to hold two of its stacks.
    await Effect.runPromise(
      bundleService
        .updateBundleCampaign({ id: campaignId, isRepeatable: true })
        .pipe(provideDatabase({ db: db as never })),
    );

    const first = stackOf(productIds.slice(0, 6));
    const second = stackOf(productIds.slice(0, 6));
    const order = await run(
      createOrderModule.createOrder(
        baseOrder({
          items: [{ productId: productIds[6]!, quantity: 1 }],
          bundles: [first, second],
        }),
      ),
    );

    const items = await db
      .select()
      .from(schema.orderItem)
      .where(eq(schema.orderItem.orderId, order.id))
      .orderBy(asc(schema.orderItem.createdAt), asc(schema.orderItem.id));
    const bundles = await db
      .select()
      .from(schema.orderBundle)
      .where(eq(schema.orderBundle.orderId, order.id))
      .orderBy(asc(schema.orderBundle.createdAt), asc(schema.orderBundle.id));

    expect(bundles).toHaveLength(2);
    expect(bundles[0]!.instanceId).not.toBe(bundles[1]!.instanceId);

    const groups = groupOrderLines(
      items.map((i) => ({ ...i, price: String(i.price), discountPrice: i.discountPrice })),
      bundles.map((b) => ({ ...b, regularTotal: String(b.regularTotal), bundleTotal: String(b.bundleTotal) })),
    );

    // One standalone product + two separate bundle groups — never one merged group.
    expect(groups.filter((g) => g.kind === "bundle")).toHaveLength(2);
    expect(groups.filter((g) => g.kind === "item")).toHaveLength(1);
    for (const g of groups) {
      if (g.kind !== "bundle") continue;
      expect(g.items).toHaveLength(6);
      expect(g.bundleTotal).toBe(480);
    }

    // 1 standalone unit + 2 × 6 bundle children.
    expect(totalUnits(groups)).toBe(13);

    // The merchandise the groups describe reconciles with the authoritative
    // order row: subtotal (regular value) minus the recorded discount. If the
    // children were summed on top of the bundle prices this would be ~1300.
    expect(chargedMerchandiseTotal(groups)).toBe(100 + 480 + 480);
    expect(chargedMerchandiseTotal(groups)).toBe(Number(order.subtotal) - Number(order.discount));
    expect(Number(order.total)).toBe(chargedMerchandiseTotal(groups) + Number(order.shipping));
  });
  // ─── Phase 5: tiered Build Your Stack ──────────────────────────────────────

  describe("tiered campaigns", () => {
    let tieredId: string;

    /** 3 -> 270, 4 -> 340, 6 -> 480 over the same six products. */
    beforeEach(async () => {
      await db
        .delete(schema.bundleCampaign)
        .where(like(schema.bundleCampaign.internalName, `${TAG}tiered%`));
      const created = await Effect.runPromise(
        bundleService
          .createBundleCampaign(
            bundleService.createBundleCampaignSchema.parse({
              internalName: `${TAG}tiered`,
              title: "Tiered Ear Stack",
              slug: `${TAG}tiered-ear-stack`,
              tiers: [
                { quantity: 3, price: 270 },
                { quantity: 4, price: 340 },
                { quantity: 6, price: 480 },
              ],
              isActive: true,
              isRepeatable: true,
              eligibleProductIds: productIds.slice(0, 6),
            }),
          )
          .pipe(provideDatabase({ db: db as never })),
      );
      tieredId = created.id;
    });

    const tieredStack = (count: number, expectedBundleTotal?: number) => ({
      instanceId: `inst-${Math.random().toString(16).slice(2)}`,
      campaignId: tieredId,
      expectedBundleTotal,
      items: productIds.slice(0, count).map((productId) => ({ productId, quantity: 1 })),
    });

    it("charges the 3-piece tier and snapshots its quantity and id", async () => {
      const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [tieredStack(3)] })));
      // Products 0-2 are 120 + 80(discounted) + 100 = 300 regular.
      expect(Number(order.subtotal)).toBe(300);
      expect(Number(order.discount)).toBe(30);
      expect(Number(order.total)).toBe(270 + Number(order.shipping));

      const [snapshot] = await db
        .select()
        .from(schema.orderBundle)
        .where(eq(schema.orderBundle.orderId, order.id));
      expect(snapshot).toMatchObject({ requiredQuantity: 3, bundleTotal: "270.00", campaignType: "build_your_stack" });
      expect(snapshot!.tierId).not.toBeNull();

      const children = await db
        .select()
        .from(schema.orderItem)
        .where(eq(schema.orderItem.orderBundleId, snapshot!.id));
      expect(children).toHaveLength(3);
    });

    it("charges the 6-piece tier for the same campaign", async () => {
      const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [tieredStack(6)] })));
      expect(Number(order.total)).toBe(480 + Number(order.shipping));
      const [snapshot] = await db
        .select()
        .from(schema.orderBundle)
        .where(eq(schema.orderBundle.orderId, order.id));
      expect(snapshot!.requiredQuantity).toBe(6);
      expect(snapshot!.bundleTotal).toBe("480.00");
    });

    it("refuses a between-tiers selection instead of charging the tier below", async () => {
      const message = await runFail(createOrderModule.createOrder(baseOrder({ bundles: [tieredStack(5)] })));
      expect(message).toMatch(/sizes|stack/i);
      // Nothing was written.
      const orders = await db
        .select()
        .from(schema.order)
        .where(like(schema.order.customerEmail, `${TAG}%`));
      expect(orders).toHaveLength(0);
    });

    it("refuses a stale bundle total after the merchant repriced the tier", async () => {
      await Effect.runPromise(
        bundleService
          .updateBundleCampaign({
            id: tieredId,
            tiers: [
              { quantity: 3, price: 270 },
              { quantity: 6, price: 520 },
            ],
          })
          .pipe(provideDatabase({ db: db as never })),
      );
      const message = await runFail(
        createOrderModule.createOrder(baseOrder({ bundles: [tieredStack(6, 480)] })),
      );
      expect(message).toMatch(/price/i);
    });

    it("keeps two different tiers of one campaign as separate bundle instances", async () => {
      const order = await run(
        createOrderModule.createOrder(baseOrder({ bundles: [tieredStack(3), tieredStack(4)] })),
      );
      const snapshots = await db
        .select()
        .from(schema.orderBundle)
        .where(eq(schema.orderBundle.orderId, order.id))
        .orderBy(asc(schema.orderBundle.createdAt), asc(schema.orderBundle.id));
      expect(snapshots).toHaveLength(2);
      expect(snapshots.map((s) => s.requiredQuantity).sort()).toEqual([3, 4]);
      expect(snapshots[0]!.instanceId).not.toBe(snapshots[1]!.instanceId);
      expect(Number(order.total)).toBe(270 + 340 + Number(order.shipping));
    });

    it("keeps two instances of the SAME tier separate", async () => {
      const order = await run(
        createOrderModule.createOrder(baseOrder({ bundles: [tieredStack(3), tieredStack(3)] })),
      );
      const snapshots = await db
        .select()
        .from(schema.orderBundle)
        .where(eq(schema.orderBundle.orderId, order.id));
      expect(snapshots).toHaveLength(2);
      expect(snapshots[0]!.tierId).toBe(snapshots[1]!.tierId);
      expect(snapshots[0]!.instanceId).not.toBe(snapshots[1]!.instanceId);
      expect(Number(order.total)).toBe(540 + Number(order.shipping));
    });

    it("groups a mixed order and charges each bundle once at its own tier price", async () => {
      const { groupOrderLines, chargedMerchandiseTotal, bundleTierLabel } = await import(
        "#root/shared/bundles/order-grouping"
      );
      const curated = await Effect.runPromise(
        bundleService
          .createBundleCampaign(
            bundleService.createBundleCampaignSchema.parse({
              internalName: `${TAG}tiered-curated`,
              title: "Curated Set",
              slug: `${TAG}tiered-curated`,
              type: "curated_stack",
              fixedBundlePrice: 150,
              composition: [{ productId: productIds[6]!, quantity: 2 }],
              isActive: true,
            }),
          )
          .pipe(provideDatabase({ db: db as never })),
      );

      const order = await run(
        createOrderModule.createOrder(
          baseOrder({
            items: [{ productId: productIds[6]!, quantity: 1 }],
            bundles: [
              tieredStack(3),
              tieredStack(4),
              { instanceId: `inst-cur-${Math.random().toString(16).slice(2)}`, campaignId: curated.id, items: [] },
            ],
          }),
        ),
      );

      const items = await db
        .select()
        .from(schema.orderItem)
        .where(eq(schema.orderItem.orderId, order.id))
        .orderBy(asc(schema.orderItem.createdAt), asc(schema.orderItem.id));
      const bundles = await db
        .select()
        .from(schema.orderBundle)
        .where(eq(schema.orderBundle.orderId, order.id))
        .orderBy(asc(schema.orderBundle.createdAt), asc(schema.orderBundle.id));

      const groups = groupOrderLines(
        items.map((i) => ({ ...i, price: String(i.price), discountPrice: i.discountPrice })),
        bundles.map((b) => ({ ...b, regularTotal: String(b.regularTotal), bundleTotal: String(b.bundleTotal) })),
      );

      // One standalone line + three independently grouped bundles.
      expect(groups.filter((g) => g.kind === "bundle")).toHaveLength(3);
      expect(groups.filter((g) => g.kind === "item")).toHaveLength(1);

      // Each bundle counted ONCE at its own tier price; children excluded.
      expect(chargedMerchandiseTotal(groups)).toBe(100 + 270 + 340 + 150);
      expect(chargedMerchandiseTotal(groups)).toBe(Number(order.subtotal) - Number(order.discount));

      // The historical tier label comes from the snapshot alone.
      const labels = groups
        .filter((g) => g.kind === "bundle")
        .map((g) => (g.kind === "bundle" ? bundleTierLabel(g.bundle) : null));
      expect(labels).toContain("3-piece tier");
      expect(labels).toContain("4-piece tier");
      // Curated groups have no tier label.
      expect(labels).toContain(null);
    });

    it("keeps a placed order intact after its tier is repriced and deleted", async () => {
      const { groupOrderLines, bundleTierLabel } = await import("#root/shared/bundles/order-grouping");
      const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [tieredStack(6)] })));
      const before = await db
        .select()
        .from(schema.orderBundle)
        .where(eq(schema.orderBundle.orderId, order.id));

      // The merchant reprices, then removes the 6-piece tier entirely.
      await Effect.runPromise(
        bundleService
          .updateBundleCampaign({ id: tieredId, tiers: [{ quantity: 3, price: 999 }] })
          .pipe(provideDatabase({ db: db as never })),
      );

      const after = await db
        .select()
        .from(schema.orderBundle)
        .where(eq(schema.orderBundle.orderId, order.id));
      expect(after[0]).toMatchObject({
        requiredQuantity: 6,
        bundleTotal: "480.00",
        campaignTitle: "Tiered Ear Stack",
      });
      expect(after[0]!.tierId).toBe(before[0]!.tierId);
      // And the admin still labels it from the snapshot, with no live tier row.
      const group = groupOrderLines(
        [],
        after.map((b) => ({ ...b, regularTotal: String(b.regularTotal), bundleTotal: String(b.bundleTotal) })),
      )[0]!;
      if (group.kind !== "bundle") throw new Error("expected bundle");
      expect(bundleTierLabel(group.bundle)).toBe("6-piece tier");
      expect(group.bundleTotal).toBe(480);
    });
  });
});
