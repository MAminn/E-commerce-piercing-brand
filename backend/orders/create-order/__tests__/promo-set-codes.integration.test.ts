import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * PICK3 / PICK6-style promo codes and percentage Pick Your Set, end to end
 * against a real disposable Postgres:
 *
 *   • exact eligible-UNIT rules (3 / 6) accepted and rejected at order time;
 *   • the discount lands on eligible value only (unrelated products and the
 *     excluded fixed 3-piece set are untouched);
 *   • PICK6 free shipping zeroes a deliverable governorate and can never make
 *     an unavailable one deliverable;
 *   • a percentage Pick Your Set and an equivalent code never discount the
 *     same pieces; an overlapping automatic offer can't either;
 *   • persisted order totals equal the shared cart computation exactly.
 *
 * The codes here are TEST fixtures — nothing creates or activates live
 * PICK3/PICK6 campaigns. Skipped when TEST_DATABASE_URL is unset.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

type ShippingRulesConfig = import("#root/shared/shipping/rules").ShippingRulesConfig;
const ZONE_RULES: ShippingRulesConfig = {
  version: 1,
  mode: "zones",
  currency: "EGP",
  // Test fixtures only — real rates are entered by the merchant.
  rates: { CAI: 70, ALX: 100, SSI: null },
  fallbackFee: 90,
};

describeIfDb("promo set codes + percentage Pick Your Set (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let createOrderModule: typeof import("#root/backend/orders/create-order/service");
  let bundleService: typeof import("#root/backend/bundles/service");
  let validateModule: typeof import("#root/backend/promo-codes/validate-promo-code/validate-promo-code");
  let pricing: typeof import("#root/shared/bundles/cart-pricing");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;
  let EmailService: typeof import("#root/shared/email/service").EmailService;

  const TAG = "promo-set-it-";
  const CODE_PREFIX = "PSETIT";
  let fileId: string;
  let earringsCat: string;
  let ringsCat: string;
  /** e[0..7]: single earrings, eligible by category. */
  let e: string[] = [];
  let ring: string;
  let set3: string;
  let saleEarring: string;
  const prices = [150, 150, 175, 200, 200, 100, 100, 100];

  const stubEmail = { sendEmail: () => Effect.succeed({ success: true }) };
  type Env =
    | import("#root/shared/database/drizzle/db").DatabaseClientService
    | import("#root/shared/email/service").EmailService;
  const provide = <A, E>(effect: Effect.Effect<A, E, Env>) =>
    effect.pipe(provideDatabase({ db: db as never }), Effect.provideService(EmailService, stubEmail as never));
  const run = <A, E>(effect: Effect.Effect<A, E, Env>) => Effect.runPromise(provide(effect));
  const runFail = async <A, E>(effect: Effect.Effect<A, E, Env>): Promise<string> => {
    const exit = await Effect.runPromiseExit(provide(effect));
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
    validateModule = await import("#root/backend/promo-codes/validate-promo-code/validate-promo-code");
    pricing = await import("#root/shared/bundles/cart-pricing");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));
    ({ EmailService } = await import("#root/shared/email/service"));

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = file!.id;
    const [earrings] = await db
      .insert(schema.category)
      .values({ name: `${TAG}earrings`, slug: `${TAG}earrings`, type: "general" })
      .returning();
    const [rings] = await db
      .insert(schema.category)
      .values({ name: `${TAG}rings`, slug: `${TAG}rings`, type: "general" })
      .returning();
    earringsCat = earrings!.id;
    ringsCat = rings!.id;

    const product = (name: string, categoryId: string, price: string, discountPrice: string | null = null) => ({
      name: `${TAG}${name}`,
      description: "it",
      imageId: fileId,
      categoryId,
      price,
      discountPrice,
      vendorId: storeOwner,
      stock: 100,
    });
    const earringRows = await db
      .insert(schema.product)
      .values(prices.map((p, i) => product(`earring-${i}`, earringsCat, p.toFixed(2))))
      .returning({ id: schema.product.id });
    e = earringRows.map((r) => r.id);
    const [ringRow, setRow, saleRow] = await db
      .insert(schema.product)
      .values([
        product("ring", ringsCat, "200.00"),
        // The fixed 3-piece set lives in the SAME category as single earrings
        // and is kept out by an explicit product exclusion, never by price.
        product("huggie-set-3-pieces", earringsCat, "250.00"),
        product("sale-earring", earringsCat, "200.00", "150.00"),
      ])
      .returning({ id: schema.product.id });
    ring = ringRow!.id;
    set3 = setRow!.id;
    saleEarring = saleRow!.id;

    await db.insert(schema.storeSettings).values({ key: "default" }).onConflictDoNothing();
  });

  const allProductIds = () => [...e, ring, set3, saleEarring];

  const setRules = (rules: ShippingRulesConfig | null) =>
    db
      .update(schema.storeSettings)
      .set({ shippingRules: rules, shippingFee: "0.00", updatedAt: new Date() })
      .where(eq(schema.storeSettings.key, "default"));

  const cleanup = async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.delete(schema.promoCode).where(like(schema.promoCode.code, `${CODE_PREFIX}%`));
    await db.delete(schema.cartOffer).where(like(schema.cartOffer.name, `${TAG}%`));
    await db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));
  };

  beforeEach(async () => {
    await cleanup();
    await db.update(schema.product).set({ stock: 100 }).where(inArray(schema.product.id, allProductIds()));
    await setRules(ZONE_RULES);
  });

  afterAll(async () => {
    await cleanup();
    await setRules(null);
    await db.delete(schema.product).where(inArray(schema.product.id, allProductIds()));
    await db.delete(schema.category).where(inArray(schema.category.id, [earringsCat, ringsCat]));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  /** A PICK-style code: earrings by category, the 3-piece set excluded, exact quantity. */
  const createSetCode = async (
    suffix: string,
    opts: { percent: number; exact: number | null; freeShipping: boolean; usageLimit?: number | null; allProducts?: boolean },
  ) => {
    const [row] = await db
      .insert(schema.promoCode)
      .values({
        code: `${CODE_PREFIX}${suffix}`,
        discountType: "percentage",
        discountValue: opts.percent.toFixed(2),
        status: "active",
        appliesToAllProducts: opts.allProducts ?? false,
        eligibleMinQuantity: opts.exact,
        eligibleMaxQuantity: opts.exact,
        freeShipping: opts.freeShipping,
        usageLimit: opts.usageLimit ?? null,
      })
      .returning();
    if (!opts.allProducts) {
      await db.insert(schema.promoCodeCategories).values({ promoCodeId: row!.id, categoryId: earringsCat });
      await db.insert(schema.promoCodeExcludedProducts).values({ promoCodeId: row!.id, productId: set3 });
    }
    return row!;
  };
  const PICK3 = () => createSetCode("PICK3", { percent: 20, exact: 3, freeShipping: false });
  const PICK6 = () => createSetCode("PICK6", { percent: 15, exact: 6, freeShipping: true });

  const order = (overrides: Record<string, unknown> = {}) =>
    createOrderModule.createOrderSchema.parse({
      customerName: "Set Code Tester",
      customerEmail: `${TAG}${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
      customerPhone: "+201000000000",
      shippingAddress: "1 Test St",
      shippingCity: "Maadi",
      shippingState: "",
      shippingPostalCode: "",
      shippingCountry: "Egypt",
      shippingGovernorateCode: "CAI",
      items: [],
      bundles: [],
      paymentMethod: "cod",
      ...overrides,
    });

  const line = (productId: string, quantity = 1) => ({ productId, quantity });
  /** Six eligible units worth 1,075.00 (150 + 150 + 175 + 200 + 2 × 200). */
  const sixEligible = () => [line(e[0]!), line(e[1]!), line(e[2]!), line(e[3]!), line(e[4]!, 2)];

  const place = (overrides: Record<string, unknown>) => run(createOrderModule.createOrder(order(overrides)));
  const refuse = (overrides: Record<string, unknown>) => runFail(createOrderModule.createOrder(order(overrides)));
  const loadOrder = async (id: string) => {
    const [row] = await db.select().from(schema.order).where(eq(schema.order.id, id));
    if (!row) throw new Error("order not found");
    return row;
  };

  // ─── PICK6 ──────────────────────────────────────────────────────────────

  it("PICK6: exactly 6 eligible + an unrelated ring → 15% of 1,075 only, free Cairo shipping, totals persisted exactly", async () => {
    const code = await PICK6();
    const created = await place({
      items: [...sixEligible(), line(ring)],
      promoCodeId: code.id,
      expectedShippingFee: 0,
    });
    const row = await loadOrder(created.id);
    expect(Number(row.subtotal)).toBe(1275);
    expect(Number(row.discount)).toBe(161.25);
    expect(Number(row.shipping)).toBe(0);
    expect(Number(row.total)).toBe(1113.75);
    expect(row.shippingQuote).toMatchObject({
      governorateCode: "CAI",
      ruleFee: 70,
      chargedFee: 0,
      freeShippingApplied: true,
      freeShippingSource: "promo_code",
    });

    // The checkout's own computation (the shared function the cart runs)
    // yields exactly what was persisted.
    const lines = [
      ...[0, 1, 2, 3].map((i) => ({ id: e[i]!, name: "x", quantity: 1, price: prices[i]!, categoryIds: [earringsCat] })),
      { id: e[4]!, name: "x", quantity: 2, price: 200, categoryIds: [earringsCat] },
      { id: ring, name: "ring", quantity: 1, price: 200, categoryIds: [ringsCat] },
    ];
    const checkout = pricing.computeCartTotals({
      regularLines: lines,
      bundles: [],
      offerDiscount: 0,
      promo: {
        discountType: "percentage",
        discountValue: 15,
        eligibility: { appliesToAllProducts: false, productIds: [], categoryIds: [earringsCat], excludedProductIds: [set3] },
        quantityRule: { minQuantity: 6, maxQuantity: 6 },
        freeShipping: true,
      },
      baseShippingFee: 70,
      freeShipping: false,
    });
    expect(checkout.total.toFixed(2)).toBe(row.total);
    expect((checkout.bundleSavings + checkout.offerDiscount + checkout.promoDiscount).toFixed(2)).toBe(row.discount);
    expect(checkout.shipping.toFixed(2)).toBe(row.shipping);

    const [after] = await db.select().from(schema.promoCode).where(eq(schema.promoCode.id, code.id));
    expect(after!.usedCount).toBe(1);
  });

  it.each([
    [3, "PSETITPICK6 needs exactly 6 eligible pieces. Your cart has 3 eligible pieces."],
    [5, "PSETITPICK6 needs exactly 6 eligible pieces. Your cart has 5 eligible pieces."],
    [7, "PSETITPICK6 needs exactly 6 eligible pieces. Your cart has 7 eligible pieces."],
  ])("PICK6 with %i eligible units is refused at order time", async (units, message) => {
    const code = await PICK6();
    const items = Array.from({ length: units }, (_, i) => line(e[i % e.length]!, 1));
    // Merge duplicates the cart would hold as one line.
    const merged = new Map<string, number>();
    for (const item of items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + 1);
    expect(
      await refuse({ items: [...merged].map(([productId, quantity]) => line(productId, quantity)), promoCodeId: code.id }),
    ).toBe(message);
  });

  it("PICK6 free shipping never makes an unavailable governorate deliverable", async () => {
    const code = await PICK6();
    const message = await refuse({ items: sixEligible(), promoCodeId: code.id, shippingGovernorateCode: "SSI" });
    expect(message).toMatch(/don't deliver/i);
  });

  it("a client that still expects the governorate fee for PICK6 is stopped by the drift check", async () => {
    const code = await PICK6();
    const message = await refuse({ items: sixEligible(), promoCodeId: code.id, expectedShippingFee: 70 });
    expect(message).toMatch(/Shipping fee changed/);
  });

  // ─── PICK3 ──────────────────────────────────────────────────────────────

  it("PICK3: exactly 3 eligible → 20% of eligible value only, normal governorate shipping", async () => {
    const code = await PICK3();
    const created = await place({
      items: [line(e[5]!), line(e[6]!), line(e[7]!), line(ring)],
      promoCodeId: code.id,
      expectedShippingFee: 70,
    });
    const row = await loadOrder(created.id);
    expect(Number(row.discount)).toBe(60); // 20% of 300; the 200 ring is untouched
    expect(Number(row.shipping)).toBe(70);
    expect(Number(row.total)).toBe(300 + 200 - 60 + 70);
  });

  it.each([1, 2, 4, 6])("PICK3 with %i eligible units is refused", async (units) => {
    const code = await PICK3();
    const message = await refuse({ items: [line(e[5]!, units)], promoCodeId: code.id });
    expect(message).toMatch(/needs exactly 3 eligible pieces/);
  });

  it("units of ONE SKU count individually (3 × the same earring satisfies PICK3)", async () => {
    const code = await PICK3();
    const created = await place({ items: [line(e[5]!, 3)], promoCodeId: code.id });
    expect(Number((await loadOrder(created.id)).discount)).toBe(60);
  });

  // ─── Excluded products ─────────────────────────────────────────────────

  it("the fixed 3-piece set neither counts toward PICK6 nor makes up the sixth unit", async () => {
    const code = await PICK6();
    const message = await refuse({
      items: [line(e[0]!), line(e[1]!), line(e[2]!), line(e[3]!), line(e[4]!), line(set3)],
      promoCodeId: code.id,
    });
    expect(message).toMatch(/Your cart has 5 eligible pieces/);
  });

  it("the fixed 3-piece set is not discounted when PICK3 qualifies on other pieces", async () => {
    const code = await PICK3();
    const created = await place({ items: [line(e[5]!), line(e[6]!), line(e[7]!), line(set3)], promoCodeId: code.id });
    const row = await loadOrder(created.id);
    expect(Number(row.discount)).toBe(60);
    expect(Number(row.total)).toBe(300 + 250 - 60 + 70);
  });

  // ─── Sale prices ─────────────────────────────────────────────────────────

  it("a valid sale price is the base: 20% of the 150 sale price, not of the 200 regular price", async () => {
    const code = await PICK3();
    const created = await place({ items: [line(saleEarring), line(e[5]!), line(e[6]!)], promoCodeId: code.id });
    const row = await loadOrder(created.id);
    expect(Number(row.subtotal)).toBe(350); // sale 150 + 100 + 100
    expect(Number(row.discount)).toBe(70);
  });

  // ─── Stacking ────────────────────────────────────────────────────────────

  it("an overlapping automatic offer only discounts the units PICK6 does not own", async () => {
    const code = await PICK6();
    await db.insert(schema.cartOffer).values({
      name: `${TAG}everything-10`,
      isActive: true,
      condition: { type: "always" },
      reward: { type: "percentage_off", percentOff: 10 },
    });
    const created = await place({ items: [...sixEligible(), line(ring)], promoCodeId: code.id });
    const row = await loadOrder(created.id);
    // 161.25 (PICK6 on 1,075) + 20 (offer on the 200 ring only)
    expect(Number(row.discount)).toBe(181.25);
    expect(Number(row.total)).toBe(1275 - 181.25);
  });

  it("an old '2+ pieces free shipping' offer cannot override PICK3's normal shipping", async () => {
    const code = await PICK3();
    await db.insert(schema.cartOffer).values({
      name: `${TAG}two-plus-free-shipping`,
      isActive: true,
      condition: { type: "quantity_threshold", minQuantity: 2 },
      reward: { type: "free_shipping" },
    });
    const created = await place({ items: [line(e[5]!), line(e[6]!), line(e[7]!)], promoCodeId: code.id });
    expect(Number((await loadOrder(created.id)).shipping)).toBe(70);
  });

  describe("percentage Pick Your Set", () => {
    const createPercentCampaign = (overrides: Record<string, unknown> = {}) =>
      Effect.runPromise(
        bundleService
          .createBundleCampaign(
            bundleService.createBundleCampaignSchema.parse({
              internalName: `${TAG}pick-your-set`,
              title: "Pick Your Set",
              slug: `${TAG}pick-your-set`,
              isActive: true,
              pricingType: "percentage_discount",
              allowDuplicates: true,
              tiers: [
                { quantity: 3, discountPercent: 20 },
                { quantity: 6, discountPercent: 15 },
              ],
              eligibleProductIds: e,
              ...overrides,
            }),
          )
          .pipe(provideDatabase({ db: db as never })),
      );

    const stack = (campaignId: string, items: { productId: string; quantity: number }[], expectedBundleTotal?: number) => ({
      instanceId: `inst-${Math.random().toString(16).slice(2)}`,
      campaignId,
      expectedBundleTotal,
      items,
    });

    it("prices 6 selected pieces at 15% off with a percentage snapshot", async () => {
      const campaign = await createPercentCampaign();
      expect(campaign.pricingType).toBe("percentage_discount");
      expect(campaign.tiers.map((t) => [t.quantity, t.price, t.discountPercent])).toEqual([
        [3, null, 20],
        [6, null, 15],
      ]);
      expect(campaign.fixedBundlePrice).toBeNull();

      const created = await place({ bundles: [stack(campaign.id, sixEligible(), 913.75)] });
      const row = await loadOrder(created.id);
      expect(Number(row.subtotal)).toBe(1075);
      expect(Number(row.discount)).toBe(161.25);
      expect(Number(row.total)).toBe(913.75 + 70);
      const [snapshot] = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, created.id));
      expect(snapshot).toMatchObject({
        pricingType: "percentage_discount",
        discountPercent: "15.00",
        requiredQuantity: 6,
        regularTotal: "1075.00",
        bundleTotal: "913.75",
        offerStacking: "exclusive",
      });
    });

    it("a stale expected total is refused rather than silently repriced", async () => {
      const campaign = await createPercentCampaign();
      const message = await refuse({ bundles: [stack(campaign.id, sixEligible(), 900)] });
      expect(message).toMatch(/price of "Pick Your Set" has changed/);
    });

    it("the set's pieces + the equivalent PICK6 code are never discounted twice", async () => {
      const campaign = await createPercentCampaign();
      const code = await PICK6();
      // Only the set: the code has no loose eligible pieces to apply to.
      const message = await refuse({ bundles: [stack(campaign.id, sixEligible())], promoCodeId: code.id });
      expect(message).toMatch(/doesn't apply to any of the items/);

      // The set + six LOOSE eligible pieces: each group gets exactly one discount.
      const created = await place({
        bundles: [stack(campaign.id, sixEligible())],
        items: sixEligible(),
        promoCodeId: code.id,
      });
      const row = await loadOrder(created.id);
      expect(Number(row.subtotal)).toBe(2150);
      expect(Number(row.discount)).toBe(161.25 + 161.25);
      expect(Number(row.shipping)).toBe(0);
      expect(Number(row.total)).toBe(913.75 + 913.75);
    });

    it("refuses a stackable percentage set and a percentage Ready Set", async () => {
      await expect(async () => createPercentCampaign({ offerStacking: "stackable" })).rejects.toThrow(
        /cannot stack with offers or promo codes/,
      );
      expect(() =>
        bundleService.createBundleCampaignSchema.parse({
          internalName: `${TAG}ready`,
          title: "Ready",
          type: "curated_stack",
          pricingType: "percentage_discount",
          fixedBundlePrice: 250,
          composition: [{ productId: e[0]!, quantity: 3 }],
        }),
      ).toThrow(/Ready Set/);
    });

    describe("campaign free shipping", () => {
      it("OFF (PICK3-style, the default) → normal governorate shipping", async () => {
        const campaign = await createPercentCampaign();
        expect(campaign.freeShipping).toBe(false);
        const created = await place({
          bundles: [stack(campaign.id, [line(e[5]!), line(e[6]!), line(e[7]!)], 240)],
          expectedShippingFee: 70,
        });
        const row = await loadOrder(created.id);
        expect(Number(row.shipping)).toBe(70);
        expect(Number(row.total)).toBe(240 + 70);
        const [snapshot] = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, created.id));
        expect(snapshot?.freeShipping).toBe(false);
      });

      it("ON (PICK6-style) → shipping 0 with no promo code, snapshotted and attributed to the set", async () => {
        const campaign = await createPercentCampaign({ freeShipping: true });
        expect(campaign.freeShipping).toBe(true);
        const created = await place({ bundles: [stack(campaign.id, sixEligible(), 913.75)], expectedShippingFee: 0 });
        const row = await loadOrder(created.id);
        expect(Number(row.shipping)).toBe(0);
        expect(Number(row.total)).toBe(913.75);
        expect(row.shippingQuote).toMatchObject({
          ruleFee: 70,
          chargedFee: 0,
          freeShippingApplied: true,
          freeShippingSource: "bundle",
        });
        const [snapshot] = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, created.id));
        expect(snapshot).toMatchObject({ freeShipping: true, pricingType: "percentage_discount", bundleTotal: "913.75" });

        // Persisted totals equal the shared checkout computation.
        const checkout = pricing.computeCartTotals({
          regularLines: [],
          bundles: [
            {
              instanceId: "x",
              offerStacking: "exclusive",
              regularTotal: 1075,
              bundleTotal: 913.75,
              freeShipping: true,
              items: [],
            },
          ],
          offerDiscount: 0,
          promo: null,
          baseShippingFee: 70,
          freeShipping: false,
        });
        expect(checkout.total.toFixed(2)).toBe(row.total);
        expect(checkout.shipping.toFixed(2)).toBe(row.shipping);
        expect(checkout.subtotal.toFixed(2)).toBe(row.subtotal);
      });

      it("never makes an unavailable governorate deliverable", async () => {
        const campaign = await createPercentCampaign({ freeShipping: true });
        const message = await refuse({ bundles: [stack(campaign.id, sixEligible())], shippingGovernorateCode: "SSI" });
        expect(message).toMatch(/don't deliver/i);
      });

      it("a set that no longer qualifies (5 of 6 pieces) is refused — no free shipping survives it", async () => {
        const campaign = await createPercentCampaign({ freeShipping: true });
        const five = [line(e[0]!), line(e[1]!), line(e[2]!), line(e[3]!), line(e[4]!)];
        const message = await refuse({ bundles: [stack(campaign.id, five)], expectedShippingFee: 0 });
        expect(message).toMatch(/isn't one of this set's sizes|not complete/);
        // The same cart without the set pays the governorate fee.
        const created = await place({ items: five, expectedShippingFee: 70 });
        expect(Number((await loadOrder(created.id)).shipping)).toBe(70);
      });

      it("mixed cart: the whole order ships free, the unrelated ring keeps its full price", async () => {
        const campaign = await createPercentCampaign({ freeShipping: true });
        const created = await place({
          bundles: [stack(campaign.id, sixEligible(), 913.75)],
          items: [line(ring)],
          expectedShippingFee: 0,
        });
        const row = await loadOrder(created.id);
        expect(Number(row.subtotal)).toBe(1075 + 200);
        expect(Number(row.discount)).toBe(161.25);
        expect(Number(row.shipping)).toBe(0);
        expect(Number(row.total)).toBe(913.75 + 200);
      });

      it("a second free-shipping source (code + offer) still zeroes shipping exactly once", async () => {
        const campaign = await createPercentCampaign({ freeShipping: true });
        const code = await PICK6();
        await db.insert(schema.cartOffer).values({
          name: `${TAG}free-ship-all`,
          isActive: true,
          condition: { type: "always" },
          reward: { type: "free_shipping" },
        });
        const created = await place({
          bundles: [stack(campaign.id, sixEligible(), 913.75)],
          items: sixEligible(),
          promoCodeId: code.id,
          expectedShippingFee: 0,
        });
        const row = await loadOrder(created.id);
        expect(Number(row.shipping)).toBe(0);
        expect(Number(row.total)).toBe(913.75 + 913.75);
        expect(row.shippingQuote).toMatchObject({ freeShippingSource: "bundle", chargedFee: 0 });
      });

      it("is stored off for a Ready Set", async () => {
        const ready = await Effect.runPromise(
          bundleService
            .createBundleCampaign(
              bundleService.createBundleCampaignSchema.parse({
                internalName: `${TAG}ready-set`,
                title: "Ready Set",
                slug: `${TAG}ready-set`,
                type: "curated_stack",
                fixedBundlePrice: 250,
                freeShipping: true,
                composition: [{ productId: e[0]!, quantity: 3 }],
              }),
            )
            .pipe(provideDatabase({ db: db as never })),
        );
        expect(ready.freeShipping).toBe(false);
      });
    });

    it("existing fixed-total campaigns keep pricing exactly as before", async () => {
      const fixed = await Effect.runPromise(
        bundleService
          .createBundleCampaign(
            bundleService.createBundleCampaignSchema.parse({
              internalName: `${TAG}fixed`,
              title: "Fixed Six",
              slug: `${TAG}fixed`,
              isActive: true,
              allowDuplicates: true,
              tiers: [{ quantity: 6, price: 900 }],
              eligibleProductIds: e,
            }),
          )
          .pipe(provideDatabase({ db: db as never })),
      );
      expect(fixed.pricingType).toBe("fixed_total");
      const created = await place({ bundles: [stack(fixed.id, sixEligible(), 900)] });
      const row = await loadOrder(created.id);
      expect(Number(row.total)).toBe(900 + 70);
      const [snapshot] = await db.select().from(schema.orderBundle).where(eq(schema.orderBundle.orderId, created.id));
      expect(fixed.freeShipping).toBe(false);
      expect(snapshot).toMatchObject({
        pricingType: "fixed_total",
        discountPercent: null,
        bundleTotal: "900.00",
        freeShipping: false,
      });
    });
  });

  // ─── Validation endpoint ─────────────────────────────────────────────────

  describe("promoCode.validate", () => {
    const validate = (code: string, cartItems: { id: string; quantity: number; price: number; bundled?: boolean }[]) =>
      validateModule.validatePromoCode(
        validateModule.validatePromoCodeSchema.parse({
          code,
          cartItems,
          subtotal: cartItems.reduce((s, i) => s + i.quantity * i.price, 0),
        }),
      );
    const sixItems = () => [
      { id: e[0]!, quantity: 1, price: 150 },
      { id: e[1]!, quantity: 1, price: 150 },
      { id: e[2]!, quantity: 1, price: 175 },
      { id: e[3]!, quantity: 1, price: 200 },
      { id: e[4]!, quantity: 2, price: 200 },
    ];

    it("accepts exactly 6 and returns the server-resolved eligibility", async () => {
      await PICK6();
      const result = await run(validate(`${CODE_PREFIX}PICK6`, [...sixItems(), { id: ring, quantity: 1, price: 200 }]));
      expect(result.eligibleUnits).toBe(6);
      expect(result.discountAmount).toBe(161.25);
      expect(result.freeShipping).toBe(true);
      expect(result.eligibleMinQuantity).toBe(6);
      expect(result.eligibleMaxQuantity).toBe(6);
      expect(new Set(result.eligibleProductIds)).toEqual(new Set(e.slice(0, 5)));
      expect(result.discountLabel).toBe("15% off + free shipping");
    });

    it("rejects 5 with the quantity reason, and never counts bundled units", async () => {
      await PICK6();
      const five = sixItems().slice(0, 4).concat({ id: e[4]!, quantity: 1, price: 200 });
      expect(await runFail(validate(`${CODE_PREFIX}PICK6`, five))).toBe(
        "PSETITPICK6 needs exactly 6 eligible pieces. Your cart has 5 eligible pieces.",
      );
      const bundledOnly = sixItems().map((i) => ({ ...i, bundled: true }));
      expect(await runFail(validate(`${CODE_PREFIX}PICK6`, bundledOnly))).toMatch(/Pieces already inside a set/);
    });
  });

  // ─── Regressions ─────────────────────────────────────────────────────────

  it("an ordinary all-products percentage code still discounts the whole cart", async () => {
    const code = await createSetCode("PLAIN10", { percent: 10, exact: null, freeShipping: false, allProducts: true });
    const created = await place({ items: [line(e[0]!), line(ring)], promoCodeId: code.id });
    const row = await loadOrder(created.id);
    expect(Number(row.discount)).toBe(35); // 10% of 350
    expect(Number(row.shipping)).toBe(70);
  });

  it("usage limits still apply to set codes", async () => {
    const code = await createSetCode("ONCE", { percent: 20, exact: 3, freeShipping: false, usageLimit: 1 });
    await place({ items: [line(e[5]!, 3)], promoCodeId: code.id });
    expect(await refuse({ items: [line(e[5]!, 3)], promoCodeId: code.id })).toMatch(/usage limit/);
  });
});
