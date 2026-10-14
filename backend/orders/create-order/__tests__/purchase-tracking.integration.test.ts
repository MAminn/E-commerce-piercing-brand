import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Purchase tracking against real persisted orders: a normal order, a PICK3
 * (3 pieces, 20% off) and a PICK6 (6 pieces, 15% off + free shipping) Pick
 * Your Set order are created through the real create-order service, read
 * back through the real public `payment.verify` procedure (what
 * /order-confirmation calls), and fed through the same confirmation logic the
 * page runs. Each emits exactly one Purchase whose value is the order total
 * stored in Postgres; a refused order emits none.
 *
 * Campaigns here are TEST fixtures — nothing touches live campaigns.
 * Skipped when TEST_DATABASE_URL is unset.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("Purchase tracking from persisted orders (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let createOrderModule: typeof import("#root/backend/orders/create-order/service");
  let bundleService: typeof import("#root/backend/bundles/service");
  let appRouter: typeof import("#root/shared/trpc/router").appRouter;
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;
  let EmailService: typeof import("#root/shared/email/service").EmailService;
  let purchase: typeof import("#root/frontend/tracking/purchase-event");
  let confirmation: typeof import("#root/pages/order-confirmation/confirmation-state");

  const TAG = "purchase-it-";
  let fileId: string;
  let categoryId: string;
  let p: string[] = [];
  const prices = [150, 150, 175, 200, 200, 100];

  const stubEmail = { sendEmail: () => Effect.succeed({ success: true }) };
  type Env =
    | import("#root/shared/database/drizzle/db").DatabaseClientService
    | import("#root/shared/email/service").EmailService;
  const provide = <A, E>(effect: Effect.Effect<A, E, Env>) =>
    effect.pipe(provideDatabase({ db: db as never }), Effect.provideService(EmailService, stubEmail as never));
  const run = <A, E>(effect: Effect.Effect<A, E, Env>) => Effect.runPromise(provide(effect));

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    createOrderModule = await import("#root/backend/orders/create-order/service");
    bundleService = await import("#root/backend/bundles/service");
    ({ appRouter } = await import("#root/shared/trpc/router"));
    ({ provideDatabase } = await import("#root/shared/trpc/server"));
    ({ EmailService } = await import("#root/shared/email/service"));
    purchase = await import("#root/frontend/tracking/purchase-event");
    confirmation = await import("#root/pages/order-confirmation/confirmation-state");

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = file!.id;
    const [cat] = await db
      .insert(schema.category)
      .values({ name: `${TAG}earrings`, slug: `${TAG}earrings`, type: "general" })
      .returning();
    categoryId = cat!.id;
    const rows = await db
      .insert(schema.product)
      .values(
        prices.map((price, i) => ({
          name: `${TAG}piece-${i}`,
          description: "it",
          imageId: fileId,
          categoryId,
          price: price.toFixed(2),
          vendorId: storeOwner,
          stock: 100,
        })),
      )
      .returning({ id: schema.product.id });
    p = rows.map((r) => r.id);
    await db.insert(schema.storeSettings).values({ key: "default" }).onConflictDoNothing();
  });

  const cleanup = async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));
  };

  beforeEach(async () => {
    await cleanup();
    await db.update(schema.product).set({ stock: 100 }).where(inArray(schema.product.id, p));
    await db
      .update(schema.storeSettings)
      .set({
        shippingRules: { version: 1, mode: "zones", currency: "EGP", rates: { CAI: 70 }, fallbackFee: 90 },
        shippingFee: "0.00",
        updatedAt: new Date(),
      })
      .where(eq(schema.storeSettings.key, "default"));
  });

  afterAll(async () => {
    await cleanup();
    await db
      .update(schema.storeSettings)
      .set({ shippingRules: null, shippingFee: "0.00" })
      .where(eq(schema.storeSettings.key, "default"));
    await db.delete(schema.product).where(inArray(schema.product.id, p));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  const createSet = (slug: string, quantity: number, discountPercent: number, freeShipping: boolean) =>
    Effect.runPromise(
      bundleService
        .createBundleCampaign(
          bundleService.createBundleCampaignSchema.parse({
            internalName: `${TAG}${slug}`,
            title: slug,
            slug: `${TAG}${slug}`,
            isActive: true,
            pricingType: "percentage_discount",
            allowDuplicates: true,
            freeShipping,
            tiers: [{ quantity, discountPercent }],
            eligibleProductIds: p,
          }),
        )
        .pipe(provideDatabase({ db: db as never })),
    );

  const stack = (campaignId: string, items: { productId: string; quantity: number }[]) => ({
    instanceId: `inst-${Math.random().toString(16).slice(2)}`,
    campaignId,
    items,
  });

  const place = (overrides: Record<string, unknown>) =>
    run(
      createOrderModule.createOrder(
        createOrderModule.createOrderSchema.parse({
          customerName: "Purchase Tester",
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
        }),
      ),
    );

  const memoryStorage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
  };

  /** One browser: what checkout stores, and the confirmation page's effect. */
  const browser = () => {
    const local = memoryStorage();
    const session = memoryStorage();
    const trackEvent = vi.fn();
    const guest = appRouter.createCaller({
      db,
      clientSession: null,
      emailService: undefined,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    } as never);

    return {
      trackEvent,
      afterCheckout: (created: { id: string; items: import("#root/frontend/tracking/purchase-event").PersistedOrderLine[] }) =>
        purchase.savePurchaseItems(session, created.id, created.items),
      /** A visit to /order-confirmation?id=… (also: every refresh). */
      openConfirmation: async (orderId: string) => {
        const res = (await guest.payment.verify({ orderId }).catch(() => null)) as {
          success: boolean;
          result?: { paymentStatus: never; total: string };
        } | null;
        const view = confirmation.deriveConfirmationView({
          orderRef: orderId,
          paymentParam: "none",
          lookup:
            res?.success && res.result
              ? { status: "found", order: { paymentStatus: res.result.paymentStatus, total: res.result.total } }
              : { status: "missing" },
        });
        if (view.kind === "placed" && res?.result) {
          purchase.trackPurchaseOnce({ orderId, total: res.result.total, trackEvent, local, session });
        }
        return view.kind;
      },
    };
  };

  const loadOrder = async (id: string) => {
    const [row] = await db.select().from(schema.order).where(eq(schema.order.id, id));
    return row!;
  };

  const expectOnePurchase = async (
    b: ReturnType<typeof browser>,
    orderId: string,
    expected: { units: number; productIds: string[] },
  ) => {
    expect(b.trackEvent).toHaveBeenCalledTimes(1);
    const [name, data] = b.trackEvent.mock.calls[0]!;
    expect(name).toBe("checkout_completed");
    const row = await loadOrder(orderId);
    expect(data.eventId).toBe(`purchase-${orderId}`);
    expect(data.ecommerce.currency).toBe("EGP");
    expect(data.ecommerce.value).toBe(Number(row.total));
    expect(data.ecommerce.transactionId).toBe(orderId);
    const items = data.ecommerce.items as { itemId: string; quantity: number }[];
    expect(items.map((i) => i.itemId).sort()).toEqual([...expected.productIds].sort());
    expect(items.reduce((s, i) => s + i.quantity, 0)).toBe(expected.units);
    return row;
  };

  it("normal order → exactly one Purchase at the persisted total (refresh included)", async () => {
    const b = browser();
    const created = await place({ items: [{ productId: p[0]!, quantity: 2 }, { productId: p[2]!, quantity: 1 }] });
    b.afterCheckout(created as never);

    expect(await b.openConfirmation(created.id)).toBe("placed");
    expect(await b.openConfirmation(created.id)).toBe("placed"); // refresh

    const row = await expectOnePurchase(b, created.id, { units: 3, productIds: [p[0]!, p[2]!] });
    expect(Number(row.total)).toBe(150 * 2 + 175 + 70);
  });

  it("PICK3 order → exactly one Purchase; the 20% set price is the reported value", async () => {
    const pick3 = await createSet("pick3", 3, 20, false);
    const b = browser();
    const created = await place({
      bundles: [stack(pick3.id, [{ productId: p[0]!, quantity: 1 }, { productId: p[2]!, quantity: 1 }, { productId: p[3]!, quantity: 1 }])],
    });
    b.afterCheckout(created as never);
    await b.openConfirmation(created.id);
    await b.openConfirmation(created.id);

    const row = await expectOnePurchase(b, created.id, { units: 3, productIds: [p[0]!, p[2]!, p[3]!] });
    // (150 + 175 + 200) × 0.8 + Cairo 70
    expect(Number(row.total)).toBe(420 + 70);
  });

  it("PICK6 order → exactly one Purchase; 15% off and free shipping are in the reported value", async () => {
    const pick6 = await createSet("pick6", 6, 15, true);
    const b = browser();
    const created = await place({
      bundles: [stack(pick6.id, p.map((productId) => ({ productId, quantity: 1 })))],
      expectedShippingFee: 0,
    });
    b.afterCheckout(created as never);
    await b.openConfirmation(created.id);
    await b.openConfirmation(created.id);
    await b.openConfirmation(created.id);

    const row = await expectOnePurchase(b, created.id, { units: 6, productIds: p });
    expect(Number(row.shipping)).toBe(0);
    // 975 × 0.85, no shipping
    expect(Number(row.total)).toBe(828.75);
  });

  it("PICK6 + a loose piece → still ONE Purchase for the order, bundle children merged by product", async () => {
    const pick6 = await createSet("pick6", 6, 15, true);
    const b = browser();
    const created = await place({
      bundles: [stack(pick6.id, p.map((productId) => ({ productId, quantity: 1 })))],
      items: [{ productId: p[0]!, quantity: 2 }],
      expectedShippingFee: 0,
    });
    b.afterCheckout(created as never);
    await b.openConfirmation(created.id);

    await expectOnePurchase(b, created.id, { units: 8, productIds: p });
  });

  it("a refused order (incomplete PICK6) persists nothing and emits no Purchase", async () => {
    const pick6 = await createSet("pick6", 6, 15, true);
    const b = browser();
    await expect(
      place({ bundles: [stack(pick6.id, p.slice(0, 5).map((productId) => ({ productId, quantity: 1 })))] }),
    ).rejects.toBeDefined();
    const orders = await db.select().from(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    expect(orders).toHaveLength(0);

    // Whatever id the browser might hold, the server knows no such order.
    expect(await b.openConfirmation("0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f")).toBe("not-found");
    expect(b.trackEvent).not.toHaveBeenCalled();
  });

  it("an unpaid online order emits nothing until it is paid", async () => {
    const b = browser();
    const created = await place({ items: [{ productId: p[5]!, quantity: 1 }] });
    await db.update(schema.order).set({ paymentMethod: "paymob", paymentStatus: "pending" }).where(eq(schema.order.id, created.id));
    expect(await b.openConfirmation(created.id)).toBe("pending");
    expect(b.trackEvent).not.toHaveBeenCalled();

    await db.update(schema.order).set({ paymentStatus: "failed" }).where(eq(schema.order.id, created.id));
    expect(await b.openConfirmation(created.id)).toBe("failed");
    expect(b.trackEvent).not.toHaveBeenCalled();
  });
});
