import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asc, eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Internal product code snapshotting onto order lines, against a real
 * Postgres.
 *
 * The property under test is SNAPSHOT semantics, the same treatment
 * `order_item.name` and `order_item.price` already get: the code is copied
 * onto the line at the moment the order is placed and never read back from
 * the live product. A merchant who renames PC001 to PC101 tomorrow must not
 * silently rewrite what last week's orders were picked and shipped against.
 *
 * The second property is confinement. `order.create` is a PUBLIC procedure
 * that returns its inserted rows to the shopper's browser, and `order.view`
 * is a PROTECTED one that serves an ordinary signed-in customer their own
 * orders through the very query the admin uses. Both are covered here.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("order line internal-code snapshot (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let createOrderModule: typeof import("#root/backend/orders/create-order/service");
  let viewOrders: typeof import("#root/backend/orders/view-orders/service").viewOrders;
  let bundleService: typeof import("#root/backend/bundles/service");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;
  let EmailService: typeof import("#root/shared/email/service").EmailService;

  const TAG = "order-code-it-";
  let vendorId: string;
  let categoryId: string;
  let fileId: string;
  /** CODED carries PC001; BLANK has no internal code at all. */
  let CODED: string;
  let BLANK: string;
  let EXTRA: string;
  let campaignId: string;

  const stubEmail = { sendEmail: () => Effect.succeed({ success: true }) };
  type Needs =
    | import("#root/shared/database/drizzle/db").DatabaseClientService
    | import("#root/shared/email/service").EmailService;

  const run = <A, E>(effect: Effect.Effect<A, E, Needs>) =>
    Effect.runPromise(
      effect.pipe(
        provideDatabase({ db: db as never }),
        Effect.provideService(EmailService, stubEmail as never),
      ),
    );
  const svc = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      import("#root/shared/database/drizzle/db").DatabaseClientService
    >,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  const adminSession = { role: "admin", email: `${TAG}admin@example.test` } as never;
  const customerSession = {
    role: "user",
    email: `${TAG}customer@example.test`,
  } as never;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    createOrderModule = await import(
      "#root/backend/orders/create-order/service"
    );
    ({ viewOrders } = await import(
      "#root/backend/orders/view-orders/service"
    ));
    bundleService = await import("#root/backend/bundles/service");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));
    ({ EmailService } = await import("#root/shared/email/service"));

    const storeOwner = (
      await import("#root/shared/config/store")
    ).getStoreOwnerId();
    await db
      .insert(schema.vendor)
      .values({ id: storeOwner, name: `${TAG}store`, status: "active" })
      .onConflictDoNothing();
    vendorId = storeOwner;

    const [file] = await db
      .insert(schema.file)
      .values({ diskname: `${TAG}img.webp` })
      .returning();
    fileId = file!.id;

    const [category] = await db
      .insert(schema.category)
      .values({ name: `${TAG}cat`, slug: `${TAG}cat`, type: "general" })
      .returning();
    categoryId = category!.id;

    const rows = await db
      .insert(schema.product)
      .values(
        [
          {
            name: `${TAG}Polished Ball Labret Piercing - Silver`,
            price: "75.00",
            internalCode: "PC001",
          },
          // No internal code: an ordinary product nobody has coded yet.
          { name: `${TAG}Uncoded Hoop`, price: "40.00" },
          { name: `${TAG}Crystal Stud`, price: "60.00", internalCode: "ER001" },
        ].map((p) => ({
          ...p,
          description: "a piece",
          imageId: fileId,
          categoryId,
          vendorId,
          stock: 50,
        })),
      )
      .returning({ id: schema.product.id });
    [CODED, BLANK, EXTRA] = rows.map((r) => r.id) as [string, string, string];

    await db
      .insert(schema.storeSettings)
      .values({ key: "default", variantPresets: [] })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db
      .delete(schema.bundleCampaign)
      .where(like(schema.bundleCampaign.internalName, `${TAG}%`));
    await db
      .update(schema.product)
      .set({ stock: 50, hidden: false, deleted: false })
      .where(inArray(schema.product.id, [CODED, BLANK, EXTRA]));
    // Restore the codes: several tests deliberately change them mid-flight.
    await db
      .update(schema.product)
      .set({ internalCode: "PC001" })
      .where(eq(schema.product.id, CODED));
    await db
      .update(schema.product)
      .set({ internalCode: null })
      .where(eq(schema.product.id, BLANK));
    await db
      .update(schema.product)
      .set({ internalCode: "ER001" })
      .where(eq(schema.product.id, EXTRA));

    const created = await svc(
      bundleService.createBundleCampaign(
        bundleService.createBundleCampaignSchema.parse({
          internalName: `${TAG}stack`,
          title: "Pick Your Set",
          slug: `${TAG}pick-your-set`,
          requiredQuantity: 3,
          fixedBundlePrice: 150,
          isActive: true,
          eligibleProductIds: [CODED, BLANK, EXTRA],
        }),
      ),
    );
    campaignId = created.id;
  });

  afterAll(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db
      .delete(schema.bundleCampaign)
      .where(like(schema.bundleCampaign.internalName, `${TAG}%`));
    await db
      .delete(schema.product)
      .where(inArray(schema.product.id, [CODED, BLANK, EXTRA]));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  const baseOrder = (overrides: Record<string, unknown> = {}) =>
    createOrderModule.createOrderSchema.parse({
      customerName: "Code Tester",
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

  /** Raw order lines, bypassing every serialization layer. */
  const linesOf = async (orderId: string) =>
    db
      .select()
      .from(schema.orderItem)
      .where(eq(schema.orderItem.orderId, orderId))
      .orderBy(asc(schema.orderItem.createdAt), asc(schema.orderItem.id));

  // ─── Snapshot on create ───────────────────────────────────────────────────

  describe("capture", () => {
    it("stores the product's code on the line", async () => {
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: CODED, quantity: 1 }] }),
        ),
      );

      const lines = await linesOf(order.id);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.internalCode).toBe("PC001");
      expect(lines[0]!.name).toContain("Polished Ball Labret");
    });

    it("stores NULL for a product that has no code", async () => {
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: BLANK, quantity: 2 }] }),
        ),
      );

      const lines = await linesOf(order.id);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.internalCode).toBeNull();
      // The order is otherwise entirely normal.
      expect(lines[0]!.quantity).toBe(2);
      expect(Number(order.subtotal)).toBe(80);
    });

    it("gives each line of a mixed order its own code", async () => {
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({
            items: [
              { productId: CODED, quantity: 1 },
              { productId: BLANK, quantity: 1 },
              { productId: EXTRA, quantity: 1 },
            ],
          }),
        ),
      );

      const lines = await linesOf(order.id);
      const byProduct = new Map(lines.map((l) => [l.productId, l.internalCode]));
      expect(byProduct.get(CODED)).toBe("PC001");
      expect(byProduct.get(BLANK)).toBeNull();
      expect(byProduct.get(EXTRA)).toBe("ER001");
    });
  });

  // ─── The point of a snapshot ──────────────────────────────────────────────

  describe("immutability against later product edits", () => {
    it("keeps PC001 on an old order after the product becomes PC101", async () => {
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: CODED, quantity: 1 }] }),
        ),
      );
      expect((await linesOf(order.id))[0]!.internalCode).toBe("PC001");

      // The merchant re-codes the product some time later.
      await db
        .update(schema.product)
        .set({ internalCode: "PC101" })
        .where(eq(schema.product.id, CODED));

      // The historical line is untouched — nothing joins back to `product`.
      expect((await linesOf(order.id))[0]!.internalCode).toBe("PC001");

      // And the admin read shows the snapshot, not the live value.
      const viewed = await svc(
        viewOrders({ limit: 50, offset: 0 } as never, adminSession),
      );
      const found = viewed.items.find((o) => o.id === order.id);
      expect(
        (found?.items[0] as { internalCode?: string | null })?.internalCode,
      ).toBe("PC001");
    });

    it("keeps NULL on an old order after the product gains a code", async () => {
      // No backfill: a code assigned afterwards was NOT what the line sold as.
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: BLANK, quantity: 1 }] }),
        ),
      );
      expect((await linesOf(order.id))[0]!.internalCode).toBeNull();

      await db
        .update(schema.product)
        .set({ internalCode: "NB001" })
        .where(eq(schema.product.id, BLANK));

      expect((await linesOf(order.id))[0]!.internalCode).toBeNull();
    });

    it("gives a NEW order the new code while the old one keeps the old", async () => {
      const first = await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: CODED, quantity: 1 }] }),
        ),
      );

      await db
        .update(schema.product)
        .set({ internalCode: "PC101" })
        .where(eq(schema.product.id, CODED));

      const second = await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: CODED, quantity: 1 }] }),
        ),
      );

      expect((await linesOf(first.id))[0]!.internalCode).toBe("PC001");
      expect((await linesOf(second.id))[0]!.internalCode).toBe("PC101");
    });
  });

  // ─── Bundles / Pick Your Set ──────────────────────────────────────────────

  describe("bundles", () => {
    const stack = (productIds: string[]) => ({
      instanceId: `inst-${Math.random().toString(16).slice(2)}`,
      campaignId,
      expectedBundleTotal: 150,
      items: productIds.map((productId) => ({ productId, quantity: 1 })),
    });

    it("snapshots a code per constituent line, not per bundle", async () => {
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({ bundles: [stack([CODED, BLANK, EXTRA])] }),
        ),
      );

      const [snapshot] = await db
        .select()
        .from(schema.orderBundle)
        .where(eq(schema.orderBundle.orderId, order.id));
      const lines = await linesOf(order.id);

      expect(lines).toHaveLength(3);
      // Every child is still an individually pickable SKU carrying its own code.
      for (const line of lines) {
        expect(line.orderBundleId).toBe(snapshot!.id);
      }
      const byProduct = new Map(lines.map((l) => [l.productId, l.internalCode]));
      expect(byProduct.get(CODED)).toBe("PC001");
      expect(byProduct.get(EXTRA)).toBe("ER001");
      expect(byProduct.get(BLANK)).toBeNull();
    });

    it("leaves bundle pricing and grouping untouched", async () => {
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({ bundles: [stack([CODED, BLANK, EXTRA])] }),
        ),
      );

      // 75 + 40 + 60 = 175 regular, charged 150.
      expect(Number(order.subtotal)).toBe(175);
      expect(Number(order.discount)).toBe(25);
      expect(Number(order.total)).toBe(150 + Number(order.shipping));

      const [snapshot] = await db
        .select()
        .from(schema.orderBundle)
        .where(eq(schema.orderBundle.orderId, order.id));
      expect(snapshot).toMatchObject({
        regularTotal: "175.00",
        bundleTotal: "150.00",
        requiredQuantity: 3,
      });
    });

    it("keeps a bundle child's code after the product is re-coded", async () => {
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({ bundles: [stack([CODED, BLANK, EXTRA])] }),
        ),
      );

      await db
        .update(schema.product)
        .set({ internalCode: "PC101" })
        .where(eq(schema.product.id, CODED));

      const lines = await linesOf(order.id);
      const coded = lines.find((l) => l.productId === CODED);
      expect(coded!.internalCode).toBe("PC001");
    });
  });

  // ─── Commerce behaviour is unchanged ──────────────────────────────────────

  describe("pricing", () => {
    it("charges exactly what it would without any code", async () => {
      const withCode = await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: CODED, quantity: 2 }] }),
        ),
      );

      // Strip the code off the product and place the identical order again.
      await db
        .update(schema.product)
        .set({ internalCode: null })
        .where(eq(schema.product.id, CODED));

      const withoutCode = await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: CODED, quantity: 2 }] }),
        ),
      );

      expect(withoutCode.subtotal).toBe(withCode.subtotal);
      expect(withoutCode.total).toBe(withCode.total);
      expect(withoutCode.discount).toBe(withCode.discount);
      expect(withoutCode.shipping).toBe(withCode.shipping);
    });

    it("decrements stock the same way regardless of the code", async () => {
      await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: CODED, quantity: 3 }] }),
        ),
      );
      const [row] = await db
        .select({ stock: schema.product.stock })
        .from(schema.product)
        .where(eq(schema.product.id, CODED));
      expect(row!.stock).toBe(47);
    });
  });

  // ─── Legacy lines ─────────────────────────────────────────────────────────

  describe("legacy order lines", () => {
    it("read back fine with a NULL code", async () => {
      // Exactly what every line looks like after the additive migration.
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: CODED, quantity: 1 }] }),
        ),
      );
      await db
        .update(schema.orderItem)
        .set({ internalCode: null })
        .where(eq(schema.orderItem.orderId, order.id));

      const viewed = await svc(
        viewOrders({ limit: 50, offset: 0 } as never, adminSession),
      );
      const found = viewed.items.find((o) => o.id === order.id);
      expect(found).toBeDefined();
      expect(found!.items).toHaveLength(1);
      expect(
        (found!.items[0] as { internalCode?: string | null }).internalCode,
      ).toBeNull();
      // The rest of the line still renders.
      expect(found!.items[0]!.name).toContain("Polished Ball Labret");
      expect(found!.items[0]!.quantity).toBe(1);
    });
  });

  // ─── Confinement ──────────────────────────────────────────────────────────

  describe("customer-facing payloads", () => {
    /** Asserts a payload carries neither the key nor any code value. */
    const expectNoLeak = (payload: unknown) => {
      const json = JSON.stringify(payload);
      expect(json).not.toContain("internalCode");
      expect(json).not.toContain("internal_code");
      expect(json).not.toContain("PC001");
      expect(json).not.toContain("ER001");
    };

    it("the checkout response does not expose the code", async () => {
      // `order.create` is a PUBLIC procedure and this object is what the
      // shopper's browser receives.
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({
            items: [
              { productId: CODED, quantity: 1 },
              { productId: EXTRA, quantity: 1 },
            ],
          }),
        ),
      );

      expect(order.items).toHaveLength(2);
      for (const line of order.items) {
        expect(line).not.toHaveProperty("internalCode");
      }
      expectNoLeak(order);

      // ...while the database row behind it does carry the snapshot.
      const lines = await linesOf(order.id);
      expect(lines.map((l) => l.internalCode).sort()).toEqual([
        "ER001",
        "PC001",
      ]);
    });

    it("strips a value that is provably present on the stored row", async () => {
      // Guards against the leakage tests passing vacuously. It is not enough
      // that the response lacks the key — the SAME line, identified by id,
      // must carry the code in the database. That is the difference between
      // "the strip works" and "there was never anything to strip".
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: CODED, quantity: 1 }] }),
        ),
      );

      const responseLine = order.items[0]!;
      const [storedLine] = await linesOf(order.id);

      expect(storedLine!.id).toBe(responseLine.id);
      expect(storedLine!.internalCode).toBe("PC001");
      expect(responseLine).not.toHaveProperty("internalCode");

      // Every other field of that line survived the strip untouched.
      expect(responseLine.name).toBe(storedLine!.name);
      expect(responseLine.price).toBe(storedLine!.price);
      expect(responseLine.quantity).toBe(storedLine!.quantity);
    });

    it("a bundle checkout response does not expose the code either", async () => {
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({
            bundles: [
              {
                instanceId: `inst-${Math.random().toString(16).slice(2)}`,
                campaignId,
                expectedBundleTotal: 150,
                items: [CODED, BLANK, EXTRA].map((productId) => ({
                  productId,
                  quantity: 1,
                })),
              },
            ],
          }),
        ),
      );

      expect(order.items).toHaveLength(3);
      expectNoLeak(order);
    });

    it("an ordinary signed-in customer's order history does not expose it", async () => {
      await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: CODED, quantity: 1 }] }),
        ),
      );

      // `order.view` is `protectedProcedure` — a non-admin reaches it for
      // their own orders through the same query the admin uses.
      const viewed = await svc(
        viewOrders({ limit: 50, offset: 0 } as never, customerSession),
      );
      expectNoLeak(viewed);
      for (const o of viewed.items) {
        for (const line of o.items) {
          expect(line).not.toHaveProperty("internalCode");
        }
      }
    });

    it("the admin order response DOES include it", async () => {
      const order = await run(
        createOrderModule.createOrder(
          baseOrder({ items: [{ productId: CODED, quantity: 1 }] }),
        ),
      );

      const viewed = await svc(
        viewOrders({ limit: 50, offset: 0 } as never, adminSession),
      );
      const found = viewed.items.find((o) => o.id === order.id);
      expect(
        (found?.items[0] as { internalCode?: string | null })?.internalCode,
      ).toBe("PC001");
    });
  });
});
