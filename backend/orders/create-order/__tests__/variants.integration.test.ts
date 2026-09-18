import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asc, eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Phase 7 — variant-aware bundles end to end, against a real disposable
 * Postgres. Skipped when TEST_DATABASE_URL is unset (repo convention).
 *
 * The store's variant model: `product_variant` rows are option GROUPS; a
 * variant is one value per group; price = effective price + Σ modifiers;
 * stock is the PRODUCT's. Everything here exercises the real loader
 * (`loadPurchasableOptionGroups`), the real validator and the real order
 * transaction.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("create-order with variant-aware bundles (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let createOrderModule: typeof import("#root/backend/orders/create-order/service");
  let bundleService: typeof import("#root/backend/bundles/service");
  let selection: typeof import("#root/backend/bundles/selection");
  let analytics: typeof import("#root/backend/bundles/analytics");
  let grouping: typeof import("#root/shared/bundles/order-grouping");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;
  let EmailService: typeof import("#root/shared/email/service").EmailService;

  const TAG = "order-variant-it-";
  let vendorId: string;
  let categoryId: string;
  let fileId: string;
  /** S1, S2 simple; V1 "Flower Stud" Color Gold(+20)/Silver; V2 "Mini Hoop" Size 6mm/8mm(+10). */
  let S1: string;
  let S2: string;
  let V1: string;
  let V2: string;
  let v1VariantRowId: string;
  let campaignId: string;

  const stubEmail = { sendEmail: () => Effect.succeed({ success: true }) };
  type Needs =
    | import("#root/shared/database/drizzle/db").DatabaseClientService
    | import("#root/shared/email/service").EmailService;
  const run = <A, E>(effect: Effect.Effect<A, E, Needs>) =>
    Effect.runPromise(effect.pipe(provideDatabase({ db: db as never }), Effect.provideService(EmailService, stubEmail as never)));
  const runFail = async <A, E>(effect: Effect.Effect<A, E, Needs>): Promise<string> => {
    const exit = await Effect.runPromiseExit(
      effect.pipe(provideDatabase({ db: db as never }), Effect.provideService(EmailService, stubEmail as never)),
    );
    if (exit._tag === "Success") throw new Error("expected failure");
    const err = (exit.cause as { error?: { clientMessage?: string } }).error;
    return err?.clientMessage ?? String(exit.cause);
  };
  const svc = <A, E>(effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>) =>
    Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));
  const svcFail = async <A, E>(
    effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
  ): Promise<string> => {
    const exit = await Effect.runPromiseExit(effect.pipe(provideDatabase({ db: db as never })));
    if (exit._tag === "Success") throw new Error("expected failure");
    const err = (exit.cause as { error?: { clientMessage?: string } }).error;
    return err?.clientMessage ?? String(exit.cause);
  };

  const resetVariants = async () => {
    await db.delete(schema.productVariant).where(inArray(schema.productVariant.productId, [V1, V2]));
    const [v1] = await db
      .insert(schema.productVariant)
      .values({ productId: V1, name: "Color", values: [{ value: "Gold", priceModifier: 20 }, { value: "Silver" }] })
      .returning({ id: schema.productVariant.id });
    v1VariantRowId = v1!.id;
    await db.insert(schema.productVariant).values({ productId: V2, name: "Size", values: [{ value: "6mm" }, { value: "8mm", priceModifier: 10 }] });
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    createOrderModule = await import("#root/backend/orders/create-order/service");
    bundleService = await import("#root/backend/bundles/service");
    selection = await import("#root/backend/bundles/selection");
    analytics = await import("#root/backend/bundles/analytics");
    grouping = await import("#root/shared/bundles/order-grouping");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));
    ({ EmailService } = await import("#root/shared/email/service"));

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    vendorId = storeOwner;
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = file!.id;
    const [category] = await db.insert(schema.category).values({ name: `${TAG}cat`, slug: `${TAG}cat`, type: "general" }).returning();
    categoryId = category!.id;

    const rows = await db
      .insert(schema.product)
      .values(
        [
          { name: `${TAG}Star Stud`, price: "100.00" },
          { name: `${TAG}Crystal`, price: "40.00" },
          { name: `${TAG}Flower Stud`, price: "60.00" },
          { name: `${TAG}Mini Hoop`, price: "50.00" },
        ].map((p) => ({ ...p, description: "it", imageId: fileId, categoryId, vendorId, stock: 10 })),
      )
      .returning({ id: schema.product.id });
    [S1, S2, V1, V2] = rows.map((r) => r.id) as [string, string, string, string];
    // The strikethrough rules live on the single settings row — make sure it exists.
    await db.insert(schema.storeSettings).values({ key: "default", variantPresets: [] }).onConflictDoNothing();
  });

  beforeEach(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));
    await db.update(schema.product).set({ stock: 10, hidden: false, deleted: false }).where(inArray(schema.product.id, [S1, S2, V1, V2]));
    await db.update(schema.storeSettings).set({ variantPresets: [] }).where(eq(schema.storeSettings.key, "default"));
    await resetVariants();

    // 4 pieces → 200 (regular 100 + 40 + 80 + 60 = 280 when Gold + 8mm are picked).
    const created = await svc(
      bundleService.createBundleCampaign(
        bundleService.createBundleCampaignSchema.parse({
          internalName: `${TAG}stack`,
          title: "Build Your Ear Stack",
          slug: `${TAG}ear-stack`,
          requiredQuantity: 4,
          fixedBundlePrice: 200,
          isActive: true,
          eligibleProductIds: [S1, S2, V1, V2],
        }),
      ),
    );
    campaignId = created.id;
  });

  afterAll(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));
    await db.delete(schema.product).where(inArray(schema.product.id, [S1, S2, V1, V2]));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  const baseOrder = (overrides: Record<string, unknown> = {}) =>
    createOrderModule.createOrderSchema.parse({
      customerName: "Variant Tester",
      customerEmail: `${TAG}${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
      customerPhone: "+201000000000",
      shippingAddress: "1 Test St",
      shippingCity: "Cairo",
      shippingState: "Cairo",
      shippingPostalCode: "11511",
      shippingCountry: "Egypt",
      items: [],
      bundles: [],
      paymentMethod: "cod",
      ...overrides,
    });

  type Line = { productId: string; quantity?: number; selectedOptions?: Record<string, string> | string };
  const stack = (items: Line[], expectedBundleTotal = 200, id?: string) => ({
    instanceId: id ?? `inst-${Math.random().toString(16).slice(2)}`,
    campaignId,
    expectedBundleTotal,
    items: items.map((l) => ({ quantity: 1, ...l })),
  });
  // A function: the product ids are only known after beforeAll.
  const mixed = (): Line[] => [{ productId: S1 }, { productId: V1, selectedOptions: { Color: "Gold" } }, { productId: V2, selectedOptions: { Size: "8mm" } }, { productId: S2 }];

  const childrenOf = async (orderId: string) =>
    db
      .select()
      .from(schema.orderItem)
      .where(eq(schema.orderItem.orderId, orderId))
      .orderBy(asc(schema.orderItem.createdAt), asc(schema.orderItem.id));

  // ─── Trace A: mixed stack → order ─────────────────────────────────────────

  it("prices the exact variants into regularTotal, charges the tier, decrements product stock and snapshots options", async () => {
    const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [stack(mixed())] })));
    expect(Number(order.subtotal)).toBe(280);
    expect(Number(order.discount)).toBe(80);
    expect(Number(order.total)).toBe(200 + Number(order.shipping));

    const [snapshot] = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, order.id));
    expect(snapshot).toMatchObject({ requiredQuantity: 4, regularTotal: "280.00", bundleTotal: "200.00" });

    const children = await childrenOf(order.id);
    expect(children).toHaveLength(4);
    const v1 = children.find((c) => c.productId === V1)!;
    const v2 = children.find((c) => c.productId === V2)!;
    const s1 = children.find((c) => c.productId === S1)!;
    // Regular price of THIS configuration (modifier folded in) + structured snapshot + readable label.
    expect(v1).toMatchObject({ price: "80.00", discountPrice: null, selectedOptions: { Color: "Gold" }, orderBundleId: snapshot!.id });
    expect(v1.name).toBe(`${TAG}Flower Stud (Color: Gold) — Build Your Ear Stack`);
    expect(v2).toMatchObject({ price: "60.00", selectedOptions: { Size: "8mm" } });
    expect(s1).toMatchObject({ price: "100.00", selectedOptions: null });
    expect(s1.name).toBe(`${TAG}Star Stud — Build Your Ear Stack`);

    // Inventory: the PRODUCT's stock, the same unit an ordinary line decrements.
    const stocks = await db.select({ id: schema.product.id, stock: schema.product.stock }).from(schema.product).where(inArray(schema.product.id, [S1, S2, V1, V2]));
    expect(stocks.every((s) => s.stock === 9)).toBe(true);
  });

  it("stores the CANONICAL options: spoofed keys/labels never reach the order", async () => {
    const order = await run(
      createOrderModule.createOrder(
        baseOrder({
          bundles: [
            stack([
              { productId: S1 },
              { productId: V1, selectedOptions: { color: "Gold", Engraving: "free", Price: "1" } },
              { productId: V2, selectedOptions: { Size: "8mm" } },
              { productId: S2 },
            ]),
          ],
        }),
      ),
    );
    const v1 = (await childrenOf(order.id)).find((c) => c.productId === V1)!;
    expect(v1.selectedOptions).toEqual({ Color: "Gold" });
    expect(v1.name).toContain("(Color: Gold)");
    expect(v1.price).toBe("80.00");
  });

  // ─── Server authority ──────────────────────────────────────────────────────

  it("rejects an option belonging to another product / an invented value / a missing option", async () => {
    // V2's Size sent for V1 — V1 has no Size group, its Color is missing.
    expect(await runFail(createOrderModule.createOrder(baseOrder({ bundles: [stack([{ productId: S1 }, { productId: V1, selectedOptions: { Size: "8mm" } }, { productId: V2, selectedOptions: { Size: "8mm" } }, { productId: S2 }])] }))))
      .toMatch(/choose Color/i);
    expect(await runFail(createOrderModule.createOrder(baseOrder({ bundles: [stack([{ productId: S1 }, { productId: V1, selectedOptions: { Color: "Platinum" } }, { productId: V2, selectedOptions: { Size: "8mm" } }, { productId: S2 }])] }))))
      .toMatch(/no longer available/);
    expect(await runFail(createOrderModule.createOrder(baseOrder({ bundles: [stack([{ productId: S1 }, { productId: V1 }, { productId: V2, selectedOptions: { Size: "8mm" } }, { productId: S2 }])] }))))
      .toMatch(/choose Color/i);
  });

  it("Trace C — a variant removed after add-to-cart is refused at checkout; no substitution", async () => {
    await db.update(schema.productVariant).set({ values: [{ value: "Silver" }] }).where(eq(schema.productVariant.id, v1VariantRowId));
    const message = await runFail(createOrderModule.createOrder(baseOrder({ bundles: [stack(mixed())] })));
    expect(message).toMatch(/Color .* no longer available/);
    expect(await db.select().from(schema.order).where(like(schema.order.customerEmail, `${TAG}%`))).toHaveLength(0);
  });

  it("a variant struck through store-wide after add-to-cart is refused as unavailable", async () => {
    await db
      .update(schema.storeSettings)
      .set({ variantPresets: [{ id: "p1", name: "color", values: [{ value: "Gold" }, { value: "Silver" }], strikethroughValues: ["Gold"] }] })
      .where(eq(schema.storeSettings.key, "default"));
    expect(await runFail(createOrderModule.createOrder(baseOrder({ bundles: [stack(mixed())] })))).toMatch(/currently unavailable/);
    // The product lifts it with enabledOverride → accepted again.
    await db
      .update(schema.productVariant)
      .set({ values: [{ value: "Gold", priceModifier: 20, enabledOverride: true }, { value: "Silver" }] })
      .where(eq(schema.productVariant.id, v1VariantRowId));
    const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [stack(mixed())] })));
    expect(Number(order.subtotal)).toBe(280);
  });

  it("refuses when the product's stock no longer covers the variant lines, and rolls back", async () => {
    await db.update(schema.product).set({ stock: 0 }).where(eq(schema.product.id, V1));
    expect(await runFail(createOrderModule.createOrder(baseOrder({ bundles: [stack(mixed())] })))).toMatch(/sold out|not enough stock/i);
    const [row] = await db.select({ stock: schema.product.stock }).from(schema.product).where(eq(schema.product.id, S1));
    expect(row!.stock).toBe(10);
  });

  it("Trace D — a repriced variant is re-read at checkout: the tier stays 200, the regular value moves", async () => {
    await db
      .update(schema.productVariant)
      .set({ values: [{ value: "Gold", priceModifier: 30 }, { value: "Silver" }] })
      .where(eq(schema.productVariant.id, v1VariantRowId));
    const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [stack(mixed(), 200)] })));
    expect(Number(order.subtotal)).toBe(290);
    expect(Number(order.total)).toBe(200 + Number(order.shipping));
    const [snapshot] = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, order.id));
    expect(snapshot!.regularTotal).toBe("290.00");
    expect((await childrenOf(order.id)).find((c) => c.productId === V1)!.price).toBe("90.00");
    // …while a changed TIER price is still caught by the expected-total check.
    await svc(bundleService.updateBundleCampaign({ id: campaignId, fixedBundlePrice: 210 }));
    expect(await runFail(createOrderModule.createOrder(baseOrder({ bundles: [stack(mixed(), 200)] })))).toMatch(/price .* has changed/);
  });

  // ─── Trace B: duplicate rule ───────────────────────────────────────────────

  it("Trace B — Gold + Silver of one product is a duplicate PRODUCT when duplicates are off", async () => {
    const message = await runFail(
      createOrderModule.createOrder(
        baseOrder({
          bundles: [stack([{ productId: S1 }, { productId: V1, selectedOptions: { Color: "Gold" } }, { productId: V1, selectedOptions: { Color: "Silver" } }, { productId: S2 }])],
        }),
      ),
    );
    expect(message).toMatch(/only be added once/);
  });

  it("with duplicates on and maxPerProduct 2, Gold + Silver pass, a third unit of the product does not, and stock is product-level", async () => {
    await svc(bundleService.updateBundleCampaign({ id: campaignId, allowDuplicates: true, maxPerProduct: 2 }));
    const lines: Line[] = [{ productId: S1 }, { productId: V1, selectedOptions: { Color: "Gold" } }, { productId: V1, selectedOptions: { Color: "Silver" } }, { productId: S2 }];
    const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [stack(lines)] })));
    expect(Number(order.subtotal)).toBe(100 + 80 + 60 + 40);
    const children = await childrenOf(order.id);
    expect(children.filter((c) => c.productId === V1).map((c) => [c.selectedOptions, c.price])).toEqual([[{ Color: "Gold" }, "80.00"], [{ Color: "Silver" }, "60.00"]]);
    const [v1] = await db.select({ stock: schema.product.stock }).from(schema.product).where(eq(schema.product.id, V1));
    expect(v1!.stock).toBe(8);

    await svc(bundleService.updateBundleCampaign({ id: campaignId, requiredQuantity: 5 }));
    expect(
      await runFail(
        createOrderModule.createOrder(
          baseOrder({ bundles: [stack([...lines, { productId: V1, selectedOptions: { Color: "Gold" } }])] }),
        ),
      ),
    ).toMatch(/too many of the same product/);
  });

  // ─── Ordinary lines share the same resolver ────────────────────────────────

  it("ordinary lines: the modifier is charged and snapshotted; a missing option is refused; the legacy label still works", async () => {
    const order = await run(
      createOrderModule.createOrder(
        baseOrder({
          items: [
            { productId: V1, quantity: 2, selectedOptions: { Color: "Gold" } },
            { productId: V2, quantity: 1, selectedOptions: "Size: 8mm" },
            { productId: S2, quantity: 1, selectedOptions: { Color: "Gold" } },
          ],
        }),
      ),
    );
    expect(Number(order.subtotal)).toBe(160 + 60 + 40);
    const lines = await childrenOf(order.id);
    expect(lines.find((l) => l.productId === V1)).toMatchObject({ price: "80.00", quantity: 2, selectedOptions: { Color: "Gold" } });
    expect(lines.find((l) => l.productId === V2)).toMatchObject({ price: "60.00", selectedOptions: { Size: "8mm" }, name: `${TAG}Mini Hoop (Size: 8mm)` });
    // Options sent for a simple product are ignored, not stored.
    expect(lines.find((l) => l.productId === S2)).toMatchObject({ price: "40.00", selectedOptions: null, name: `${TAG}Crystal` });

    // Named-but-incomplete or unknown configurations are refused…
    expect(await runFail(createOrderModule.createOrder(baseOrder({ items: [{ productId: V1, quantity: 1, selectedOptions: { Color: "Rose" } }] })))).toMatch(/no longer available/);
    // …while the storefront's quick-add (no option named at all) keeps its
    // pre-Phase-7 behaviour: accepted at the base price, no snapshot.
    const quickAdd = await run(createOrderModule.createOrder(baseOrder({ items: [{ productId: V1, quantity: 1 }] })));
    expect(Number(quickAdd.subtotal)).toBe(60);
    expect((await childrenOf(quickAdd.id))[0]).toMatchObject({ price: "60.00", selectedOptions: null, name: `${TAG}Flower Stud` });
  });

  it("ordinary line with a discounted base: discount + modifier is charged and both prices are snapshotted", async () => {
    await db.update(schema.product).set({ discountPrice: "40.00" }).where(eq(schema.product.id, V2));
    try {
      const order = await run(createOrderModule.createOrder(baseOrder({ items: [{ productId: V2, quantity: 1, selectedOptions: { Size: "8mm" } }] })));
      // Product page shows (40 discount + 10 modifier) = 50; checkout charges 50.
      expect(Number(order.subtotal)).toBe(50);
      expect((await childrenOf(order.id))[0]).toMatchObject({ price: "60.00", discountPrice: "50.00", selectedOptions: { Size: "8mm" } });
    } finally {
      await db.update(schema.product).set({ discountPrice: null }).where(eq(schema.product.id, V2));
    }
  });

  it("simple-product regression: a stack of simple products only is unchanged from Phase 6", async () => {
    await svc(bundleService.updateBundleCampaign({ id: campaignId, requiredQuantity: 2, fixedBundlePrice: 120 }));
    const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [stack([{ productId: S1 }, { productId: S2 }], 120)] })));
    expect(Number(order.subtotal)).toBe(140);
    expect(Number(order.discount)).toBe(20);
    const lines = await childrenOf(order.id);
    expect(lines.every((l) => l.selectedOptions === null)).toBe(true);
    expect(lines.map((l) => l.name)).toEqual([`${TAG}Star Stud — Build Your Ear Stack`, `${TAG}Crystal — Build Your Ear Stack`]);
  });

  // ─── Trace E: curated stacks with fixed variants ───────────────────────────

  describe("curated stack with fixed variants", () => {
    let curatedId: string;
    const composition = () => [
      { productId: V1, quantity: 1, selectedOptions: { Color: "Gold" } },
      { productId: V2, quantity: 1, selectedOptions: { Size: "8mm" } },
      { productId: S2, quantity: 2 },
    ];
    beforeEach(async () => {
      const created = await svc(
        bundleService.createBundleCampaign(
          bundleService.createBundleCampaignSchema.parse({
            internalName: `${TAG}curated`,
            title: "Golden Ear Set",
            slug: `${TAG}golden-ear-set`,
            type: "curated_stack",
            fixedBundlePrice: 180,
            isActive: true,
            composition: composition(),
          }),
        ),
      );
      curatedId = created.id;
    });

    it("stores and exposes the fixed variants, priced with their modifiers", async () => {
      const dto = await svc(bundleService.getBundleCampaign(curatedId));
      expect(dto.eligibleProducts.map((p) => [p.productId, p.selectedOptions, p.unitPrice, p.purchasable])).toEqual([
        [V1, { Color: "Gold" }, 80, true],
        [V2, { Size: "8mm" }, 60, true],
        [S2, null, 40, true],
      ]);
      expect(dto.regularValue).toBe(80 + 60 + 80);
      expect(dto.savings).toBe(40);
      expect(dto.availability).toBe("available");
    });

    it("the shopper cannot substitute variants or products: the server owns the composition", async () => {
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({
            bundles: [
              {
                instanceId: "inst-curated",
                campaignId: curatedId,
                expectedBundleTotal: 180,
                items: [{ productId: V1, quantity: 5, selectedOptions: { Color: "Silver" } }, { productId: S1, quantity: 1 }],
              },
            ],
          }),
        ),
      );
      expect(Number(order.subtotal)).toBe(220);
      expect(Number(order.total)).toBe(180 + Number(order.shipping));
      const lines = await childrenOf(order.id);
      expect(lines.map((l) => [l.productId, l.quantity, l.selectedOptions, l.price])).toEqual([
        [V1, 1, { Color: "Gold" }, "80.00"],
        [V2, 1, { Size: "8mm" }, "60.00"],
        [S2, 2, null, "40.00"],
      ]);
    });

    it("refuses to save a composition that pairs a product with a variant it does not have, or none at all", async () => {
      expect(
        await svcFail(bundleService.updateBundleCampaign({ id: curatedId, composition: [{ productId: V1, quantity: 1, selectedOptions: { Color: "Rose" } }] })),
      ).toMatch(/not a Color of/);
      expect(await svcFail(bundleService.updateBundleCampaign({ id: curatedId, composition: [{ productId: V1, quantity: 1 }] }))).toMatch(/Choose a Color/);
      expect(
        await svcFail(bundleService.updateBundleCampaign({ id: curatedId, composition: [{ productId: V1, quantity: 1, selectedOptions: { Size: "8mm" } }] })),
      ).toMatch(/Choose a Color/);
    });

    it("a pre-Phase-7 curated line (no variant fixed) stays unsellable until the admin picks one — never auto-picked", async () => {
      await db.update(schema.bundleCampaignProduct).set({ selectedOptions: null }).where(eq(schema.bundleCampaignProduct.productId, V1));
      const dto = await svc(bundleService.getBundleCampaign(curatedId));
      expect(dto.availability).toBe("sold_out");
      expect(dto.eligibleProducts.find((p) => p.productId === V1)?.purchasable).toBe(false);
      // Checkout refuses without asking the shopper to choose.
      const message = await runFail(
        createOrderModule.createOrder(baseOrder({ bundles: [{ instanceId: "i", campaignId: curatedId, expectedBundleTotal: 180, items: [] }] })),
      );
      expect(message).toMatch(/not available right now/);
      // Re-activation is refused until the variant is chosen.
      await db.update(schema.bundleCampaign).set({ isActive: false }).where(eq(schema.bundleCampaign.id, curatedId));
      expect(await svcFail(bundleService.setBundleCampaignActive(curatedId, true))).toMatch(/Choose a Color/);
    });

    it("current stock and a removed fixed variant both make the stack sold out / refused", async () => {
      await db.update(schema.product).set({ stock: 1 }).where(eq(schema.product.id, S2));
      expect((await svc(bundleService.getBundleCampaign(curatedId))).availability).toBe("sold_out");
      await db.update(schema.product).set({ stock: 10 }).where(eq(schema.product.id, S2));
      await db.update(schema.productVariant).set({ values: [{ value: "Silver" }] }).where(eq(schema.productVariant.id, v1VariantRowId));
      expect((await svc(bundleService.getBundleCampaign(curatedId))).availability).toBe("sold_out");
      expect(
        await runFail(createOrderModule.createOrder(baseOrder({ bundles: [{ instanceId: "i", campaignId: curatedId, expectedBundleTotal: 180, items: [] }] }))),
      ).toMatch(/not available right now/);
    });
  });

  // ─── Historical integrity ──────────────────────────────────────────────────

  it("an order's lines read the same after the variant is renamed, then deleted", async () => {
    const order = await run(createOrderModule.createOrder(baseOrder({ bundles: [stack(mixed())] })));
    await db.update(schema.productVariant).set({ values: [{ value: "Yellow Gold", priceModifier: 99 }] }).where(eq(schema.productVariant.id, v1VariantRowId));
    await db.delete(schema.productVariant).where(eq(schema.productVariant.productId, V2));

    const lines = await childrenOf(order.id);
    const v1 = lines.find((l) => l.productId === V1)!;
    const v2 = lines.find((l) => l.productId === V2)!;
    expect(grouping.orderLineDisplay(v1.name, v1.selectedOptions, "Build Your Ear Stack")).toEqual({ name: `${TAG}Flower Stud`, options: "Gold" });
    expect(grouping.orderLineDisplay(v2.name, v2.selectedOptions, "Build Your Ear Stack")).toEqual({ name: `${TAG}Mini Hoop`, options: "8mm" });
    expect(v1.price).toBe("80.00");
  });

  // ─── Trace F: analytics stay product-level ────────────────────────────────

  it("Trace F — Gold and Silver purchases aggregate under one product; instances, revenue and tiers are unchanged", async () => {
    await svc(bundleService.updateBundleCampaign({ id: campaignId, allowDuplicates: true, maxPerProduct: 2 }));
    await run(createOrderModule.createOrder(baseOrder({ bundles: [stack(mixed())] })));
    await run(
      createOrderModule.createOrder(
        baseOrder({ bundles: [stack([{ productId: S1 }, { productId: V1, selectedOptions: { Color: "Silver" } }, { productId: V2, selectedOptions: { Size: "6mm" } }, { productId: S2 }])] }),
      ),
    );
    const result = await svc(analytics.getBundleAnalytics(analytics.bundleAnalyticsSchema.parse({ period: "all", limit: 100 })));
    const mine = result.byCampaign.find((c) => c.campaignId === campaignId)!;
    expect(mine.instances).toBe(2);
    expect(mine.revenue).toBe(400);
    expect(mine.pieces).toBe(8);
    const flower = result.mostSelectedInBuildYourStack.find((p) => p.productId === V1)!;
    expect(flower.units).toBe(2);
    expect(flower.instances).toBe(2);
    expect(result.mostSelectedInBuildYourStack.filter((p) => p.productId === V1)).toHaveLength(1);
    const tier = result.byTier.find((t) => t.campaignId === campaignId)!;
    expect(tier.quantity).toBe(4);
    expect(tier.instances).toBe(2);
  });

  // ─── The public evaluate path (what the builder calls) ────────────────────

  it("evaluateSelection returns canonical options, variant prices and detail for the builder", async () => {
    const check = await selection.loadAndValidateBundleSelection(db as never, {
      campaignId,
      requested: [
        { productId: S1, quantity: 1 },
        { productId: V1, quantity: 1, selectedOptions: { color: "Gold", junk: "x" } },
        { productId: V2, quantity: 1, selectedOptions: { Size: "8mm" } },
        { productId: S2, quantity: 1 },
      ],
      expectedBundleTotal: 200,
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.bundle.items.map((i) => [i.selectedOptions, i.unitPrice, i.optionsLabel])).toEqual([
      [{}, 100, null],
      [{ Color: "Gold" }, 80, "Color: Gold"],
      [{ Size: "8mm" }, 60, "Size: 8mm"],
      [{}, 40, null],
    ]);
    const bad = await selection.loadAndValidateBundleSelection(db as never, {
      campaignId,
      requested: [{ productId: V1, quantity: 1, selectedOptions: { Color: "Platinum" } }],
    });
    expect(!bad.ok && bad.code).toBe("option_not_found");
    expect(!bad.ok && bad.detail).toMatchObject({ productId: V1, optionName: "Color", value: "Platinum" });
  });
});
