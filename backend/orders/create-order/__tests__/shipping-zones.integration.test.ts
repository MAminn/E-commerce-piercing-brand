import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Destination-based shipping, end to end against a real Postgres:
 *
 *   • zones mode prices Cairo / Alexandria from their rates, an unlisted
 *     governorate from the explicit fallback, and refuses an unavailable one;
 *   • the client's `expectedShippingFee` is only a drift assertion — a
 *     mismatch is a 409, never a silently different charge;
 *   • a free-shipping cart offer still zeroes the charged fee, and the
 *     snapshot records both the rule fee and that the offer applied;
 *   • `order.shipping`, `order.total`, `shipping_governorate_code` and
 *     `shipping_quote` are exactly what the rules said at the time;
 *   • editing the rules afterwards changes NEW orders only;
 *   • `shipping_rules = NULL` is the pre-zones flat behaviour, and legacy rows
 *     with a null code/snapshot still read back;
 *   • the admin mutation refuses a zones config that could accept no order.
 *
 * Skipped when TEST_DATABASE_URL is unset, like the other *.integration.test.ts.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

type ShippingRulesConfig = import("#root/shared/shipping/rules").ShippingRulesConfig;

const ZONE_RULES: ShippingRulesConfig = {
  version: 1,
  mode: "zones",
  currency: "EGP",
  // Test fixtures only — real commercial rates are entered by the merchant.
  rates: { CAI: 60, ALX: 75, SSI: null },
  fallbackFee: 90,
};

describeIfDb("destination-based shipping (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let t: typeof import("#root/shared/trpc/server").t;
  let createOrderProcedure: typeof import("../trpc").createOrderProcedure;
  let updateShippingRules: typeof import("#root/backend/shipping/rules-store").updateShippingRules;
  let runBackendEffect: typeof import("#root/shared/backend/effect").runBackendEffect;
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;
  let describeShippingSnapshot: typeof import("#root/shared/shipping/describe-snapshot").describeShippingSnapshot;

  const TAG = "ship-zones-it-";
  let productId: string;
  let categoryId: string;
  let fileId: string;
  let vendorId: string;
  let call: (input: unknown) => Promise<{ success: boolean; result?: { id: string; total: string }; error?: string }>;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    ({ t, provideDatabase } = await import("#root/shared/trpc/server"));
    ({ createOrderProcedure } = await import("../trpc"));
    ({ updateShippingRules } = await import("#root/backend/shipping/rules-store"));
    ({ runBackendEffect } = await import("#root/shared/backend/effect"));
    ({ describeShippingSnapshot } = await import("#root/shared/shipping/describe-snapshot"));

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    vendorId = storeOwner;

    const [f] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = f!.id;
    const [category] = await db
      .insert(schema.category)
      .values({ name: `${TAG}cat`, slug: `${TAG}cat`, type: "general" })
      .returning();
    categoryId = category!.id;
    const [product] = await db
      .insert(schema.product)
      .values({ name: `${TAG}stud`, description: "it", imageId: fileId, categoryId, price: "150.00", vendorId, stock: 100 })
      .returning();
    productId = product!.id;

    await db.insert(schema.storeSettings).values({ key: "default" }).onConflictDoNothing();

    const router = t.router({ create: createOrderProcedure });
    const caller = router.createCaller({
      db,
      clientSession: null,
      emailService: { sendEmail: async () => undefined },
    } as never);
    call = (input: unknown) => caller.create(input as never) as never;
  });

  const setRules = (rules: ShippingRulesConfig | null, flatFee = "0.00") =>
    db
      .update(schema.storeSettings)
      .set({ shippingRules: rules, shippingFee: flatFee, updatedAt: new Date() })
      .where(eq(schema.storeSettings.key, "default"));

  const clearOffers = () => db.delete(schema.cartOffer).where(like(schema.cartOffer.name, `${TAG}%`));

  beforeEach(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await clearOffers();
    await db.update(schema.product).set({ stock: 100 }).where(eq(schema.product.id, productId));
    await setRules(ZONE_RULES);
  });

  afterAll(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await clearOffers();
    await setRules(null);
    await db.delete(schema.product).where(eq(schema.product.id, productId));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  const payload = (overrides: Record<string, unknown> = {}) => ({
    customerName: "Zone Tester",
    customerEmail: `${TAG}${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
    customerPhone: "+201000000000",
    shippingAddress: "12 Road 9",
    shippingCity: "Maadi",
    shippingState: "typed by hand",
    shippingPostalCode: "",
    shippingCountry: "Egypt",
    items: [{ productId, quantity: 2 }], // 2 × 150 = 300 goods
    bundles: [],
    paymentMethod: "cod",
    ...overrides,
  });

  const loadOrder = async (id: string) => {
    const [row] = await db.select().from(schema.order).where(eq(schema.order.id, id));
    if (!row) throw new Error("order not found");
    return row;
  };

  const place = async (overrides: Record<string, unknown> = {}) => {
    const result = await call(payload(overrides));
    expect(result.success, result.error).toBe(true);
    return loadOrder(result.result!.id);
  };

  // ── Zone pricing ──────────────────────────────────────────────────────

  it("Cairo pays its own rate and the order snapshots the derivation", async () => {
    const row = await place({ shippingGovernorateCode: "CAI", expectedShippingFee: 60 });
    expect(row.shipping).toBe("60.00");
    expect(row.subtotal).toBe("300.00");
    expect(row.total).toBe("360.00");
    expect(row.shippingGovernorateCode).toBe("CAI");
    // The canonical pick overrides the free-text governorate.
    expect(row.shippingState).toBe("Cairo");
    expect(row.shippingCity).toBe("Maadi");
    expect(row.shippingQuote).toMatchObject({
      version: 1,
      provider: "manual_zone",
      method: "standard",
      mode: "zones",
      governorateCode: "CAI",
      governorateName: "Cairo",
      rateSource: "governorate_rate",
      ruleFee: 60,
      freeShippingApplied: false,
      chargedFee: 60,
      currency: "EGP",
    });
    expect(typeof row.shippingQuote?.quotedAt).toBe("string");
    expect(typeof row.shippingQuote?.rulesUpdatedAt).toBe("string");
    expect(describeShippingSnapshot(row.shippingQuote)).toBe("Zone rate · Cairo");
  });

  it("Alexandria pays a different rate", async () => {
    const row = await place({ shippingGovernorateCode: "ALX", expectedShippingFee: 75 });
    expect(row.shipping).toBe("75.00");
    expect(row.total).toBe("375.00");
    expect(row.shippingQuote).toMatchObject({ governorateCode: "ALX", rateSource: "governorate_rate", ruleFee: 75 });
  });

  it("an unlisted governorate pays the explicit fallback", async () => {
    const row = await place({ shippingGovernorateCode: "ASW", expectedShippingFee: 90 });
    expect(row.shipping).toBe("90.00");
    expect(row.total).toBe("390.00");
    expect(row.shippingState).toBe("Aswan");
    expect(row.shippingQuote).toMatchObject({ governorateCode: "ASW", rateSource: "fallback", ruleFee: 90 });
    expect(describeShippingSnapshot(row.shippingQuote)).toBe("Other-governorates rate · Aswan");
  });

  it("an unavailable governorate is refused with a clear message and no order", async () => {
    const result = await call(payload({ shippingGovernorateCode: "SSI" }));
    expect(result.success).toBe(false);
    expect(result.error).toBe("We don't deliver to South Sinai yet. Please choose another destination.");
    const rows = await db.select({ id: schema.order.id }).from(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    expect(rows).toHaveLength(0);
  });

  it("an unlisted governorate with no fallback is refused", async () => {
    await setRules({ ...ZONE_RULES, fallbackFee: null });
    const result = await call(payload({ shippingGovernorateCode: "ASW" }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/don't deliver to Aswan/);
  });

  // ── Server authority ──────────────────────────────────────────────────

  it("zones mode rejects an order with no governorate", async () => {
    const result = await call(payload());
    expect(result.success).toBe(false);
    expect(result.error).toBe("Please select your governorate so we can calculate shipping.");
    const rows = await db.select({ id: schema.order.id }).from(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    expect(rows).toHaveLength(0);
  });

  it("an unknown governorate code is rejected at the input boundary (400, no INSERT)", async () => {
    let error: { code?: string } | undefined;
    try {
      await call(payload({ shippingGovernorateCode: "Cairo" }));
    } catch (err) {
      error = err as { code?: string };
    }
    expect(error?.code).toBe("BAD_REQUEST");
    const rows = await db.select({ id: schema.order.id }).from(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    expect(rows).toHaveLength(0);
  });

  it("a stale expectedShippingFee is a 409 with the new amount, never a silent charge", async () => {
    // The shopper saw 60 for Cairo; the merchant then raised Cairo to 80.
    await setRules({ ...ZONE_RULES, rates: { ...ZONE_RULES.rates, CAI: 80 } });
    const result = await call(payload({ shippingGovernorateCode: "CAI", expectedShippingFee: 60 }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^Shipping fee changed to EGP 80\. Please review your order\.$/);
    const rows = await db.select({ id: schema.order.id }).from(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    expect(rows).toHaveLength(0);

    // Re-asserting the current figure goes through and is charged 80, not 60.
    const row = await place({ shippingGovernorateCode: "CAI", expectedShippingFee: 80 });
    expect(row.shipping).toBe("80.00");
    expect(row.total).toBe("380.00");
  });

  it("the 409 carries the HTTP status a client can branch on", async () => {
    const { createOrder } = await import("../service");
    await setRules({ ...ZONE_RULES, rates: { ...ZONE_RULES.rates, CAI: 80 } });
    const { EmailService } = await import("#root/shared/email/service");
    const outcome = await runBackendEffect(
      createOrder(payload({ shippingGovernorateCode: "CAI", expectedShippingFee: 60 }) as never).pipe(
        provideDatabase({ db: db as never }),
        Effect.provideService(EmailService, { sendEmail: async () => undefined } as never),
      ),
    );
    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.error._tag).toBe("ShippingFeeChanged");
      expect(outcome.error.statusCode).toBe(409);
    }
  });

  it("the client's fee is never used as a price: a lower expectedShippingFee does not lower the charge", async () => {
    const result = await call(payload({ shippingGovernorateCode: "CAI", expectedShippingFee: 0 }));
    expect(result.success).toBe(false); // 409, not an order at 0 shipping
    const row = await place({ shippingGovernorateCode: "CAI" }); // no assertion at all → server figure
    expect(row.shipping).toBe("60.00");
  });

  // ── Free-shipping offers ──────────────────────────────────────────────

  it("a free-shipping offer zeroes the charged fee; the snapshot keeps the rule fee", async () => {
    await db.insert(schema.cartOffer).values({
      name: `${TAG}free shipping`,
      isActive: true,
      priority: 0,
      isExclusive: false,
      condition: { type: "always" },
      reward: { type: "free_shipping" },
    });
    const row = await place({ shippingGovernorateCode: "CAI", expectedShippingFee: 0 });
    expect(row.shipping).toBe("0.00");
    expect(row.total).toBe("300.00");
    expect(row.shippingGovernorateCode).toBe("CAI");
    expect(row.shippingQuote).toMatchObject({
      rateSource: "governorate_rate",
      ruleFee: 60,
      freeShippingApplied: true,
      chargedFee: 0,
    });
    expect(describeShippingSnapshot(row.shippingQuote)).toBe("Zone rate · Cairo · 60.00 EGP waived by a free-shipping offer");
  });

  it("a free-shipping offer does not make an unavailable destination deliverable", async () => {
    await db.insert(schema.cartOffer).values({
      name: `${TAG}free shipping`,
      isActive: true,
      priority: 0,
      isExclusive: false,
      condition: { type: "always" },
      reward: { type: "free_shipping" },
    });
    const result = await call(payload({ shippingGovernorateCode: "SSI", expectedShippingFee: 0 }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/don't deliver to South Sinai/);
  });

  // ── History is frozen ─────────────────────────────────────────────────

  it("editing the rules afterwards changes new orders only", async () => {
    const before = await place({ shippingGovernorateCode: "CAI", expectedShippingFee: 60 });
    await setRules({ ...ZONE_RULES, rates: { ...ZONE_RULES.rates, CAI: 120 }, fallbackFee: null });

    const beforeAgain = await loadOrder(before.id);
    expect(beforeAgain.shipping).toBe("60.00");
    expect(beforeAgain.total).toBe("360.00");
    expect(beforeAgain.shippingQuote).toEqual(before.shippingQuote);

    const after = await place({ shippingGovernorateCode: "CAI", expectedShippingFee: 120 });
    expect(after.shipping).toBe("120.00");
    expect(after.shippingQuote).toMatchObject({ ruleFee: 120 });
  });

  // ── Backward compatibility ────────────────────────────────────────────

  it("shipping_rules = NULL keeps the flat fee for every order, governorate optional", async () => {
    await setRules(null, "45.00");
    const noPick = await place();
    expect(noPick.shipping).toBe("45.00");
    expect(noPick.total).toBe("345.00");
    expect(noPick.shippingGovernorateCode).toBeNull();
    expect(noPick.shippingState).toBe("typed by hand");
    expect(noPick.shippingQuote).toMatchObject({ provider: "flat", mode: "flat", rateSource: "flat", ruleFee: 45, chargedFee: 45, governorateCode: null });

    const withPick = await place({ shippingGovernorateCode: "ASW", expectedShippingFee: 45 });
    expect(withPick.shipping).toBe("45.00");
    expect(withPick.shippingGovernorateCode).toBe("ASW");
    expect(withPick.shippingState).toBe("Aswan");
  });

  it("shipping_rules = NULL with a 0 flat fee charges nothing, as before", async () => {
    await setRules(null, "0.00");
    const row = await place();
    expect(row.shipping).toBe("0.00");
    expect(row.total).toBe("300.00");
  });

  it("flat mode ignores the governorate rates even when some are saved", async () => {
    await setRules({ ...ZONE_RULES, mode: "flat" }, "45.00");
    const row = await place({ shippingGovernorateCode: "CAI", expectedShippingFee: 45 });
    expect(row.shipping).toBe("45.00");
    expect(row.shippingQuote).toMatchObject({ provider: "flat", ruleFee: 45 });
  });

  it("a legacy order row with no code and no snapshot still reads back and is described as legacy", async () => {
    const [legacy] = await db
      .insert(schema.order)
      .values({
        customerName: "Legacy",
        customerEmail: `${TAG}legacy@example.test`,
        customerPhone: "+201000000000",
        shippingAddress: "old street",
        shippingCity: "Cairo",
        shippingState: "",
        shippingPostalCode: "",
        shippingCountry: "Egypt",
        subtotal: "100.00",
        shipping: "30.00",
        tax: "0",
        total: "130.00",
      })
      .returning();
    const row = await loadOrder(legacy!.id);
    expect(row.shippingGovernorateCode).toBeNull();
    expect(row.shippingQuote).toBeNull();
    expect(row.shipping).toBe("30.00");
    expect(describeShippingSnapshot(row.shippingQuote)).toBe("Flat fee (legacy order)");
  });

  // ── Admin rules mutation ──────────────────────────────────────────────

  it("the admin mutation refuses zones mode with no rates and no fallback", async () => {
    const outcome = await runBackendEffect(
      updateShippingRules({ version: 1, mode: "zones", currency: "EGP", rates: {}, fallbackFee: null }).pipe(
        provideDatabase({ db: db as never }),
      ),
    );
    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.error.statusCode).toBe(400);
      expect(outcome.error.clientMessage).toMatch(/at least one governorate rate or a fee for other governorates/i);
    }
    // Nothing was written: the previous zones config is still in force.
    const [settings] = await db.select({ rules: schema.storeSettings.shippingRules }).from(schema.storeSettings).where(eq(schema.storeSettings.key, "default"));
    expect(settings?.rules).toEqual(ZONE_RULES);
  });

  it("the admin mutation saves a valid config and it takes effect on the next order", async () => {
    const outcome = await runBackendEffect(
      updateShippingRules({ version: 1, mode: "zones", currency: "EGP", rates: { GIZ: 55 }, fallbackFee: null }).pipe(
        provideDatabase({ db: db as never }),
      ),
    );
    expect(outcome.success).toBe(true);
    const giza = await place({ shippingGovernorateCode: "GIZ", expectedShippingFee: 55 });
    expect(giza.shipping).toBe("55.00");
    const cairo = await call(payload({ shippingGovernorateCode: "CAI" }));
    expect(cairo.success).toBe(false); // no longer listed, no fallback
  });
});
