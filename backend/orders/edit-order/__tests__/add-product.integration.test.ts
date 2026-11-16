import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asc, eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Admin "Add product" on an existing order, end to end against a real
 * disposable Postgres (skipped when TEST_DATABASE_URL is unset — repo
 * convention). Exercises the real edit transaction, the real option loader,
 * the preview rollback, the version guard, the activity log, the GA4 outbox
 * and the ERP export of the edited order.
 *
 * Orders are inserted directly (not through checkout) so each test controls
 * the stored discount / shipping / status exactly.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("order edit — add existing catalogue products (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let svc: typeof import("#root/backend/orders/edit-order/service");
  let search: typeof import("#root/backend/orders/edit-order/catalog-search");
  let erp: typeof import("#root/backend/erp-sync/export-service");
  let ga4Owner: typeof import("#root/shared/config/ga4-purchase-owner");
  let rules: typeof import("#root/shared/orders/edit-rules");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "order-addprod-it-";
  let vendorId: string;
  let categoryId: string;
  let fileId: string;
  /** SIMPLE 100 · SALE 200→150 · HOOP Color Gold(+20)/Silver/Rose(struck) 80 (stock 10) · LOW 30 (stock 1; the rest 10) · HIDDEN · DELETED · CODE "FB_01" */
  let SIMPLE: string;
  let SALE: string;
  let HOOP: string;
  let LOW: string;
  let HIDDEN: string;
  let DELETED: string;
  let CODED: string;
  let ALL: string[];

  const admin = {
    id: "admin-it",
    token: "t",
    email: `${TAG}admin@example.test`,
    name: "Admin",
    phone: "",
    expiresAt: new Date(Date.now() + 3600e3),
    role: "admin",
  } as const;
  const shopper = { ...admin, email: `${TAG}shopper@example.test`, role: "user" } as const;

  type Needs = import("#root/shared/database/drizzle/db").DatabaseClientService;
  const run = <A, E>(effect: Effect.Effect<A, E, Needs>) =>
    Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));
  const runFail = async <A, E>(effect: Effect.Effect<A, E, Needs>): Promise<{ tag: string; message: string }> => {
    const exit = await Effect.runPromiseExit(effect.pipe(provideDatabase({ db: db as never })));
    if (exit._tag === "Success") throw new Error("expected failure");
    const err = (exit.cause as { error?: { clientMessage?: string; _tag?: string } }).error;
    return { tag: err?._tag ?? "?", message: err?.clientMessage ?? String(exit.cause) };
  };

  // Rest args, not a default parameter: an explicit `undefined` session must
  // stay undefined (a default would silently substitute the admin).
  const edit = (input: Record<string, unknown>, ...session: [unknown?]) =>
    svc.editOrder(svc.editOrderSchema.parse(input), (session.length > 0 ? session[0] : admin) as never);
  const preview = (input: Record<string, unknown>, ...session: [unknown?]) =>
    svc.previewOrderEdit(svc.editOrderSchema.parse(input), (session.length > 0 ? session[0] : admin) as never);

  const stockOf = async (id: string) =>
    (await db.select({ stock: schema.product.stock }).from(schema.product).where(eq(schema.product.id, id)))[0]!.stock;
  const linesOf = async (orderId: string) =>
    db.select().from(schema.orderItem).where(eq(schema.orderItem.orderId, orderId)).orderBy(asc(schema.orderItem.createdAt), asc(schema.orderItem.id));
  const orderOf = async (orderId: string) =>
    (await db.select().from(schema.order).where(eq(schema.order.id, orderId)))[0]!;
  const logsOf = async (orderId: string) =>
    db.select().from(schema.orderLog).where(eq(schema.orderLog.orderId, orderId)).orderBy(asc(schema.orderLog.createdAt));

  /**
   * A COD order: one SIMPLE line (qty 1 @ 100) unless `lines` says otherwise,
   * discount 10 (a promo), shipping 70, total 160. Stock is NOT deducted for
   * the seeded lines — tests measure stock deltas from the edit only.
   */
  async function seedOrder(
    opts: {
      status?: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
      paymentMethod?: "cod" | "paymob" | "stripe";
      paymentStatus?: "not_required" | "pending" | "paid";
      stockRestored?: boolean;
      bostaDeliveryId?: string | null;
      customerEmail?: string;
      discount?: string | null;
      lines?: Array<{
        productId: string;
        quantity: number;
        price: string;
        discountPrice?: string | null;
        name?: string;
        selectedOptions?: Record<string, string> | null;
        bundle?: boolean;
      }>;
      subtotal?: string;
      total?: string;
    } = {},
  ) {
    const lines = opts.lines ?? [{ productId: SIMPLE, quantity: 1, price: "100.00" }];
    const [o] = await db
      .insert(schema.order)
      .values({
        customerName: "Test Customer",
        customerEmail: opts.customerEmail ?? `${TAG}c@example.test`,
        customerPhone: "01000000000",
        shippingAddress: "1 Test St",
        shippingCity: "Cairo",
        shippingState: "Cairo",
        shippingPostalCode: "",
        shippingCountry: "EG",
        subtotal: opts.subtotal ?? "100.00",
        shipping: "70.00",
        tax: "0",
        discount: opts.discount === undefined ? "10.00" : opts.discount,
        total: opts.total ?? "160.00",
        status: opts.status ?? "pending",
        paymentMethod: opts.paymentMethod ?? "cod",
        paymentStatus: opts.paymentStatus ?? "not_required",
        stockRestored: opts.stockRestored ?? false,
        bostaDeliveryId: opts.bostaDeliveryId ?? null,
      })
      .returning();
    let bundleId: string | null = null;
    if (lines.some((l) => l.bundle)) {
      const [b] = await db
        .insert(schema.orderBundle)
        .values({
          orderId: o!.id,
          instanceId: "inst-1",
          campaignSlug: "pick-your-3",
          campaignTitle: "Pick Your 3",
          requiredQuantity: 3,
          regularTotal: "300.00",
          bundleTotal: "240.00",
          offerStacking: "exclusive",
        })
        .returning();
      bundleId = b!.id;
    }
    for (const l of lines) {
      await db.insert(schema.orderItem).values({
        orderId: o!.id,
        productId: l.productId,
        vendorId,
        quantity: l.quantity,
        price: l.price,
        discountPrice: l.discountPrice ?? null,
        name: l.name ?? "seeded line",
        selectedOptions: l.selectedOptions ?? null,
        orderBundleId: l.bundle ? bundleId : null,
      });
    }
    return o!;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    svc = await import("#root/backend/orders/edit-order/service");
    search = await import("#root/backend/orders/edit-order/catalog-search");
    erp = await import("#root/backend/erp-sync/export-service");
    ga4Owner = await import("#root/shared/config/ga4-purchase-owner");
    rules = await import("#root/shared/orders/edit-rules");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

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
          { name: `${TAG}Simple Stud`, price: "100.00" },
          { name: `${TAG}Sale Ring`, price: "200.00", discountPrice: "150.00" },
          { name: `${TAG}Hoop`, price: "80.00" },
          { name: `${TAG}Low Stock Bar`, price: "30.00" },
          { name: `${TAG}Hidden Piece`, price: "50.00", hidden: true },
          { name: `${TAG}Deleted Piece`, price: "50.00", deleted: true },
          { name: `${TAG}Coded Clicker`, price: "120.00", internalCode: `${TAG}FB_01` },
        ].map((p) => ({ description: "it", imageId: fileId, categoryId, vendorId, stock: 10, ...p })),
      )
      .returning({ id: schema.product.id });
    [SIMPLE, SALE, HOOP, LOW, HIDDEN, DELETED, CODED] = rows.map((r) => r.id) as [string, string, string, string, string, string, string];
    ALL = [SIMPLE, SALE, HOOP, LOW, HIDDEN, DELETED, CODED];
    await db.insert(schema.productVariant).values({
      productId: HOOP,
      name: "Color",
      values: [{ value: "Gold", priceModifier: 20 }, { value: "Silver" }, { value: "Rose" }],
    });
    await db.insert(schema.storeSettings).values({ key: "default", variantPresets: [] }).onConflictDoNothing();
  });

  beforeEach(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.update(schema.product).set({ stock: 10, hidden: false, deleted: false }).where(inArray(schema.product.id, [SIMPLE, SALE, HOOP, CODED]));
    await db.update(schema.product).set({ stock: 1 }).where(eq(schema.product.id, LOW));
    await db.update(schema.product).set({ stock: 10, hidden: true }).where(eq(schema.product.id, HIDDEN));
    await db.update(schema.product).set({ stock: 10, deleted: true }).where(eq(schema.product.id, DELETED));
    // "Rose" is struck through store-wide, exactly as the storefront hides it.
    await db
      .update(schema.storeSettings)
      .set({ variantPresets: [{ id: "p1", name: "color", values: [{ value: "Gold" }, { value: "Silver" }, { value: "Rose" }], strikethroughValues: ["Rose"] }] })
      .where(eq(schema.storeSettings.key, "default"));
    ga4Owner.setEffectiveGa4PurchaseOwner("browser");
  });

  afterAll(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.update(schema.storeSettings).set({ variantPresets: [] }).where(eq(schema.storeSettings.key, "default"));
    await db.delete(schema.product).where(inArray(schema.product.id, ALL));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  // ── Adding, pricing, totals ──────────────────────────────────────────────

  it("adds a simple product as a new line, deducts stock and recomputes the COD total without touching discount, shipping or anything else", async () => {
    const o = await seedOrder();
    await run(edit({ orderId: o.id, newItems: [{ productId: SALE, quantity: 2 }] }));

    const lines = await linesOf(o.id);
    expect(lines).toHaveLength(2);
    const added = lines.find((l) => l.productId === SALE)!;
    // Snapshotted like checkout: regular price + valid sale price, charged at the sale price.
    expect(added).toMatchObject({ quantity: 2, price: "200.00", discountPrice: "150.00", selectedOptions: null, orderBundleId: null });
    expect(added.name).toBe(`${TAG}Sale Ring`);
    // The original line is untouched.
    expect(lines.find((l) => l.productId === SIMPLE)).toMatchObject({ quantity: 1, price: "100.00", discountPrice: null });
    expect(await stockOf(SALE)).toBe(8);

    const after = await orderOf(o.id);
    // 100 + 2×150 = 400; discount 10 kept as an amount; shipping 70 frozen.
    expect(after).toMatchObject({
      subtotal: "400.00",
      discount: "10.00",
      shipping: "70.00",
      total: "460.00",
      status: "pending",
      paymentMethod: "cod",
      paymentStatus: "not_required",
      shippingAddress: "1 Test St",
      customerEmail: o.customerEmail,
    });
  });

  it("increases the quantity of an existing identical line instead of duplicating it", async () => {
    const o = await seedOrder();
    await run(edit({ orderId: o.id, newItems: [{ productId: SIMPLE, quantity: 2 }] }));
    const lines = await linesOf(o.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ productId: SIMPLE, quantity: 3, price: "100.00" });
    expect(await stockOf(SIMPLE)).toBe(8);
    expect((await orderOf(o.id)).total).toBe("360.00"); // 300 − 10 + 70
  });

  it("folds two additions of the same product in one save into a single new line", async () => {
    const o = await seedOrder();
    await run(edit({ orderId: o.id, newItems: [{ productId: SALE, quantity: 1 }, { productId: SALE, quantity: 2 }] }));
    const sale = (await linesOf(o.id)).filter((l) => l.productId === SALE);
    expect(sale).toHaveLength(1);
    expect(sale[0]!.quantity).toBe(3);
    expect(await stockOf(SALE)).toBe(7);
  });

  it("adds a new line when the catalogue price changed since the order was placed", async () => {
    // The order bought SIMPLE at 90; the catalogue now says 100.
    const o = await seedOrder({ lines: [{ productId: SIMPLE, quantity: 1, price: "90.00" }], subtotal: "90.00", total: "150.00" });
    await run(edit({ orderId: o.id, newItems: [{ productId: SIMPLE, quantity: 1 }] }));
    const lines = await linesOf(o.id);
    expect(lines.map((l) => [l.quantity, l.price])).toEqual([
      [1, "90.00"],
      [1, "100.00"],
    ]);
    expect((await orderOf(o.id)).subtotal).toBe("190.00");
  });

  it("never merges a loose unit into a Set (bundle) child line", async () => {
    const o = await seedOrder({
      lines: [{ productId: SIMPLE, quantity: 1, price: "100.00", bundle: true }],
    });
    await run(edit({ orderId: o.id, newItems: [{ productId: SIMPLE, quantity: 1 }] }));
    const lines = await linesOf(o.id);
    expect(lines).toHaveLength(2);
    expect(lines.filter((l) => l.orderBundleId !== null)).toHaveLength(1);
    expect(lines.find((l) => l.orderBundleId === null)!.quantity).toBe(1);
  });

  it("does not merge into a line the same save removes", async () => {
    const o = await seedOrder({
      lines: [
        { productId: SIMPLE, quantity: 1, price: "100.00" },
        { productId: SALE, quantity: 1, price: "200.00", discountPrice: "150.00" },
      ],
      subtotal: "250.00",
      total: "310.00",
    });
    const simpleLine = (await linesOf(o.id)).find((l) => l.productId === SIMPLE)!;
    await run(edit({ orderId: o.id, items: [{ orderItemId: simpleLine.id, quantity: 0 }], newItems: [{ productId: SIMPLE, quantity: 2 }] }));
    const lines = await linesOf(o.id);
    expect(lines.find((l) => l.id === simpleLine.id)).toBeUndefined();
    expect(lines.find((l) => l.productId === SIMPLE)!.quantity).toBe(2);
    // Removal released 1, the addition took 2.
    expect(await stockOf(SIMPLE)).toBe(9);
  });

  // ── Variants ─────────────────────────────────────────────────────────────

  it("requires the exact variant for a product with options", async () => {
    const o = await seedOrder();
    const missing = await runFail(edit({ orderId: o.id, newItems: [{ productId: HOOP, quantity: 1 }] }));
    expect(missing).toMatchObject({ tag: "ProductOptionInvalid", message: `Choose a Color for ${TAG}Hoop.` });
    const unknown = await runFail(edit({ orderId: o.id, newItems: [{ productId: HOOP, quantity: 1, selectedOptions: { Color: "Purple" } }] }));
    expect(unknown.tag).toBe("ProductOptionInvalid");
    const struck = await runFail(edit({ orderId: o.id, newItems: [{ productId: HOOP, quantity: 1, selectedOptions: { Color: "Rose" } }] }));
    expect(struck.message).toContain("currently unavailable");
    // Nothing was written by any of the refusals.
    expect(await linesOf(o.id)).toHaveLength(1);
    expect(await stockOf(HOOP)).toBe(10);
  });

  it("prices the chosen variant with its modifier, snapshots the options and merges only the same variant", async () => {
    const o = await seedOrder({
      lines: [{ productId: HOOP, quantity: 1, price: "100.00", name: `${TAG}Hoop (Color: Gold)`, selectedOptions: { Color: "Gold" } }],
    });
    await run(
      edit({
        orderId: o.id,
        newItems: [
          { productId: HOOP, quantity: 1, selectedOptions: { color: "Gold" } }, // key case is lenient, like checkout
          { productId: HOOP, quantity: 2, selectedOptions: { Color: "Silver" } },
        ],
      }),
    );
    const lines = await linesOf(o.id);
    expect(lines).toHaveLength(2);
    const gold = lines.find((l) => l.selectedOptions?.Color === "Gold")!;
    const silver = lines.find((l) => l.selectedOptions?.Color === "Silver")!;
    expect(gold).toMatchObject({ quantity: 2, price: "100.00" });
    expect(silver).toMatchObject({ quantity: 2, price: "80.00", name: `${TAG}Hoop (Color: Silver)`, selectedOptions: { Color: "Silver" } });
    // Stock is the product's: 1 + 2 units taken.
    expect(await stockOf(HOOP)).toBe(7);
    expect((await orderOf(o.id)).subtotal).toBe("360.00"); // 2×100 + 2×80
  });

  // ── Stock ────────────────────────────────────────────────────────────────

  it("refuses more units than are in stock and writes nothing", async () => {
    const o = await seedOrder();
    const res = await runFail(edit({ orderId: o.id, newItems: [{ productId: LOW, quantity: 2 }] }));
    expect(res).toMatchObject({ tag: "InsufficientStock", message: `Not enough stock for ${TAG}Low Stock Bar (only 1 left).` });
    expect(await stockOf(LOW)).toBe(1);
    expect(await linesOf(o.id)).toHaveLength(1);
    expect((await orderOf(o.id)).total).toBe("160.00");
    expect(await logsOf(o.id)).toHaveLength(0);
  });

  it("checks stock cumulatively across additions of the same product", async () => {
    const o = await seedOrder();
    const res = await runFail(edit({ orderId: o.id, newItems: [{ productId: LOW, quantity: 1 }, { productId: LOW, quantity: 1 }] }));
    expect(res.tag).toBe("InsufficientStock");
    expect(await stockOf(LOW)).toBe(1);
  });

  it("refuses hidden and deleted products", async () => {
    const o = await seedOrder();
    expect((await runFail(edit({ orderId: o.id, newItems: [{ productId: HIDDEN, quantity: 1 }] }))).message).toContain("hidden from the shop");
    expect((await runFail(edit({ orderId: o.id, newItems: [{ productId: DELETED, quantity: 1 }] }))).message).toContain("deleted from the catalogue");
    expect(await linesOf(o.id)).toHaveLength(1);
  });

  // ── Which orders accept new products ─────────────────────────────────────

  it.each([
    ["shipped", {}],
    ["delivered", {}],
    ["cancelled", {}],
    ["online payment", { paymentMethod: "paymob", paymentStatus: "paid" }],
    ["stock already released", { stockRestored: true }],
    ["handed to Bosta", { bostaDeliveryId: "bosta-123" }],
  ] as const)("refuses to add products to an order that is %s", async (label, extra) => {
    const status = (["shipped", "delivered", "cancelled"] as const).find((s) => s === label);
    const o = await seedOrder({ ...(status ? { status } : {}), ...(extra as object) });
    const res = await runFail(edit({ orderId: o.id, newItems: [{ productId: SIMPLE, quantity: 1 }] }));
    expect(res.tag).toBe("OrderNotEditable");
    expect(await linesOf(o.id)).toHaveLength(1);
    expect(await stockOf(SIMPLE)).toBe(10);
  });

  it("refuses to add a product and ship the order in the same save", async () => {
    const o = await seedOrder({ status: "processing" });
    const res = await runFail(edit({ orderId: o.id, status: "shipped", newItems: [{ productId: SIMPLE, quantity: 1 }] }));
    expect(res.message).toContain("this order is shipped");
    expect((await orderOf(o.id)).status).toBe("processing");
  });

  it("allows processing orders", async () => {
    const o = await seedOrder({ status: "processing" });
    await run(edit({ orderId: o.id, newItems: [{ productId: SALE, quantity: 1 }] }));
    expect(await linesOf(o.id)).toHaveLength(2);
  });

  it("leaves the pre-existing editor untouched for other edits on finished orders (regression)", async () => {
    const o = await seedOrder({ status: "delivered" });
    await run(edit({ orderId: o.id, notes: "left at reception" }));
    const after = await orderOf(o.id);
    expect(after.notes).toBe("left at reception");
    expect(after.total).toBe("160.00");
  });

  // ── Preview, version guard and confirmation ──────────────────────────────

  it("previews the exact result and writes nothing", async () => {
    ga4Owner.setEffectiveGa4PurchaseOwner("server");
    const o = await seedOrder();
    const summary = await run(preview({ orderId: o.id, newItems: [{ productId: SIMPLE, quantity: 1 }, { productId: HOOP, quantity: 1, selectedOptions: { Color: "Gold" } }] }));

    expect(summary.before).toEqual({ subtotal: 100, discount: 10, shipping: 70, tax: 0, total: 160 });
    expect(summary.after).toEqual({ subtotal: 300, discount: 10, shipping: 70, tax: 0, total: 360 });
    expect(summary.paymentMethod).toBe("cod");
    expect(summary.additions.map((a) => [a.name, a.quantity, a.unitPrice, a.mergedIntoLineId !== null, a.newLineQuantity])).toEqual([
      [`${TAG}Simple Stud`, 1, 100, true, 2],
      [`${TAG}Hoop (Color: Gold)`, 1, 100, false, 1],
    ]);
    expect(summary.lines).toHaveLength(2);
    expect(summary.lines[0]!.productImage).toBe(`/uploads/${TAG}img.webp`);

    // Rolled back: lines, stock, money, activity log and GA4 outbox are as before.
    expect(await linesOf(o.id)).toHaveLength(1);
    expect((await linesOf(o.id))[0]!.quantity).toBe(1);
    expect(await stockOf(SIMPLE)).toBe(10);
    expect(await stockOf(HOOP)).toBe(10);
    expect((await orderOf(o.id)).total).toBe("160.00");
    expect(await logsOf(o.id)).toHaveLength(0);
    expect(await db.select().from(schema.ga4PurchaseOutbox).where(eq(schema.ga4PurchaseOutbox.orderId, o.id))).toHaveLength(0);
  });

  it("previews validation failures the same way the save fails", async () => {
    const o = await seedOrder();
    const res = await runFail(preview({ orderId: o.id, newItems: [{ productId: LOW, quantity: 5 }] }));
    expect(res.tag).toBe("InsufficientStock");
  });

  it("refuses a save whose order changed since the editor opened, and accepts a fresh one", async () => {
    const o = await seedOrder();
    const ctx = await run(svc.getOrderEditContext({ orderId: o.id }, admin as never));
    expect(ctx.addProductBlockedReason).toBeNull();
    const summary = await run(preview({ orderId: o.id, expectedVersion: ctx.version, newItems: [{ productId: SALE, quantity: 1 }] }));
    expect(summary.version).toBe(ctx.version);

    // Someone moves the order on in between.
    await db.update(schema.order).set({ status: "processing" }).where(eq(schema.order.id, o.id));
    const stale = await runFail(edit({ orderId: o.id, expectedVersion: ctx.version, newItems: [{ productId: SALE, quantity: 1 }] }));
    expect(stale).toEqual({ tag: "OrderChanged", message: rules.ORDER_CHANGED_MESSAGE });
    expect(await linesOf(o.id)).toHaveLength(1);

    const fresh = await run(svc.getOrderEditContext({ orderId: o.id }, admin as never));
    expect(fresh.version).not.toBe(ctx.version);
    await run(edit({ orderId: o.id, expectedVersion: fresh.version, newItems: [{ productId: SALE, quantity: 1 }] }));
    expect(await linesOf(o.id)).toHaveLength(2);
  });

  it("reports why products cannot be added when the editor opens", async () => {
    const o = await seedOrder({ status: "delivered" });
    const ctx = await run(svc.getOrderEditContext({ orderId: o.id }, admin as never));
    expect(ctx.addProductBlockedReason).toContain("this order is delivered");
  });

  // ── Activity log, GA4, ERP ───────────────────────────────────────────────

  it("records the added product, quantity and previous/new totals in the activity log", async () => {
    const o = await seedOrder();
    await run(edit({ orderId: o.id, newItems: [{ productId: HOOP, quantity: 2, selectedOptions: { Color: "Silver" } }] }));
    const logs = await logsOf(o.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.action).toBe("items_edited");
    expect(logs[0]!.note).toBe(
      [
        "Order edited by admin",
        `Added 2 × ${TAG}Hoop (Color: Silver) at 80.00 EGP each`,
        "Subtotal 100.00 EGP → 260.00 EGP · Total 160.00 EGP → 320.00 EGP",
      ].join("\n"),
    );
  });

  it("never enqueues a GA4 purchase when products are added to a COD order", async () => {
    ga4Owner.setEffectiveGa4PurchaseOwner("server");
    const o = await seedOrder();
    await run(edit({ orderId: o.id, newItems: [{ productId: SALE, quantity: 1 }] }));
    expect(await db.select().from(schema.ga4PurchaseOutbox).where(eq(schema.ga4PurchaseOutbox.orderId, o.id))).toHaveLength(0);
  });

  it("keeps the ERP export self-consistent and changes its version (so the ERP re-pulls the order once)", async () => {
    const o = await seedOrder();
    const [beforeExport] = await erp.getOrdersForExport(db as never, [o.id]);
    await run(edit({ orderId: o.id, newItems: [{ productId: SALE, quantity: 2 }, { productId: SIMPLE, quantity: 1 }] }));
    const [exported] = await erp.getOrdersForExport(db as never, [o.id]);
    expect(exported!.version).not.toBe(beforeExport!.version);
    const sum = exported!.lines.reduce((s, l) => s + Math.round(Number(l.unitPrice) * 100) * l.quantity, 0) / 100;
    expect(sum.toFixed(2)).toBe(exported!.amounts.subtotal);
    expect(exported!.amounts).toMatchObject({ subtotal: "500.00", discount: "10.00", shipping: "70.00", total: "560.00" });
  });

  // ── Permissions and payload regressions ──────────────────────────────────

  it("restricts every order-edit procedure to admins", async () => {
    const o = await seedOrder();
    for (const session of [shopper, undefined]) {
      expect((await runFail(edit({ orderId: o.id, newItems: [{ productId: SIMPLE, quantity: 1 }] }, session))).tag).toBe("Forbidden");
      expect((await runFail(preview({ orderId: o.id, newItems: [{ productId: SIMPLE, quantity: 1 }] }, session))).tag).toBe("Forbidden");
      expect((await runFail(svc.getOrderEditContext({ orderId: o.id }, session as never))).tag).toBe("Forbidden");
      expect((await runFail(search.searchProductsForOrderEdit({ query: "", limit: 5 }, session as never))).tag).toBe("Forbidden");
    }
    expect(await linesOf(o.id)).toHaveLength(1);
  });

  it("accepts an order whose customer gave no email (COD) — the old editor rejected every save of these", async () => {
    const o = await seedOrder({ customerEmail: "" });
    try {
      await run(edit({ orderId: o.id, customerEmail: "", newItems: [{ productId: SIMPLE, quantity: 1 }] }));
      expect((await linesOf(o.id))[0]!.quantity).toBe(2);
    } finally {
      await db.delete(schema.order).where(eq(schema.order.id, o.id));
    }
  });

  it("does not rewrite money on an edit that changes no line or amount", async () => {
    // A legacy order whose stored total does not follow today's formula.
    const o = await seedOrder({ total: "155.00" });
    await run(edit({ orderId: o.id, customerName: "Renamed" }));
    const after = await orderOf(o.id);
    expect(after).toMatchObject({ customerName: "Renamed", total: "155.00", subtotal: "100.00", discount: "10.00" });
  });

  it("keeps a NULL discount NULL and never lets a discount eat into shipping", async () => {
    const o = await seedOrder({ discount: null, total: "170.00" });
    await run(edit({ orderId: o.id, newItems: [{ productId: SIMPLE, quantity: 1 }] }));
    expect(await orderOf(o.id)).toMatchObject({ discount: null, subtotal: "200.00", total: "270.00" });

    const big = await seedOrder({ discount: "500.00", total: "70.00" });
    await run(edit({ orderId: big.id, newItems: [{ productId: SIMPLE, quantity: 1 }] }));
    expect((await orderOf(big.id)).total).toBe("70.00"); // goods floor at 0, shipping still charged
  });

  // ── Catalogue search ─────────────────────────────────────────────────────

  it("searches live products by name or SKU with their purchasable options", async () => {
    const byName = await run(search.searchProductsForOrderEdit({ query: `${TAG}hoop`, limit: 20 }, admin as never));
    expect(byName).toHaveLength(1);
    expect(byName[0]).toMatchObject({ id: HOOP, effectivePrice: 80, stock: 10, purchasable: true, image: `/uploads/${TAG}img.webp` });
    expect(byName[0]!.optionGroups[0]!.values.map((v) => [v.value, v.priceModifier, v.available])).toEqual([
      ["Gold", 20, true],
      ["Silver", 0, true],
      ["Rose", 0, false],
    ]);

    const bySku = await run(search.searchProductsForOrderEdit({ query: `${TAG}fb_01`, limit: 20 }, admin as never));
    expect(bySku.map((p) => p.id)).toEqual([CODED]);
    // `_` is literal: "FBx01" must not match "FB_01".
    expect(await run(search.searchProductsForOrderEdit({ query: `${TAG}FBx01`, limit: 20 }, admin as never))).toHaveLength(0);

    const all = await run(search.searchProductsForOrderEdit({ query: TAG, limit: 30 }, admin as never));
    const ids = all.map((p) => p.id);
    expect(ids).not.toContain(HIDDEN);
    expect(ids).not.toContain(DELETED);
    const sale = all.find((p) => p.id === SALE)!;
    expect(sale).toMatchObject({ price: 200, discountPrice: 150, effectivePrice: 150 });
  });
});
