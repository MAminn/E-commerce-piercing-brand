import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";

/**
 * The ERP export against a real Postgres: what the ERP will actually read.
 *
 *   • the digest pages by order number and every version matches the full export
 *   • a status change (the only thing many admin paths touch) changes the version,
 *     even though `order.updated_at` is not maintained by those paths
 *   • a hard-deleted order disappears from the digest — which is how the ERP
 *     detects deletions
 *   • products export their merchant SKU and cost without leaking anything else
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("ERP export (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let svc: typeof import("../export-service");

  const TAG = "erp-export-it-";
  const orderIds: string[] = [];
  let productIds: string[] = [];
  let categoryId: string;
  let fileId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    svc = await import("../export-service");

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = file!.id;
    const [cat] = await db.insert(schema.category).values({ name: `${TAG}Ear`, slug: `${TAG}ear`, type: "women" }).returning();
    categoryId = cat!.id;
    const products = await db
      .insert(schema.product)
      .values([
        {
          name: `${TAG}Hoop`, description: "d", imageId: fileId, categoryId, vendorId: storeOwner,
          price: "250.00", discountPrice: "195.00", stock: 8, internalCode: `${TAG}ER002`, costPrice: "60.00",
        },
        { name: `${TAG}Stud`, description: "d", imageId: fileId, categoryId, vendorId: storeOwner, price: "125.00", stock: 3 },
      ])
      .returning();
    productIds = products.map((p) => p.id);
    await db.insert(schema.productVariant).values({ productId: productIds[0]!, name: "Colour", values: [{ value: "Gold" }] });

    const base = {
      customerName: `${TAG}Mona`, customerEmail: `${TAG}mona@example.test`, customerPhone: "+201000000000",
      shippingAddress: "12 Secret Street", shippingCity: "Nasr City", shippingState: "Cairo", shippingPostalCode: "",
      shippingCountry: "EG", shippingGovernorateCode: "CAI", tax: "0",
    };
    const [o1] = await db
      .insert(schema.order)
      .values({ ...base, subtotal: "445.00", discount: "45.00", shipping: "70.00", total: "470.00" })
      .returning();
    const [o2] = await db
      .insert(schema.order)
      .values({ ...base, subtotal: "125.00", shipping: "70.00", total: "195.00", status: "delivered" })
      .returning();
    orderIds.push(o1!.id, o2!.id);
    await db.insert(schema.orderItem).values([
      { orderId: o1!.id, productId: productIds[0]!, vendorId: storeOwner, quantity: 1, price: "250.00", discountPrice: "195.00",
        name: "Hoop (Gold)", internalCode: `${TAG}ER002`, selectedOptions: { Colour: "Gold" } },
      { orderId: o1!.id, productId: productIds[1]!, vendorId: storeOwner, quantity: 2, price: "125.00", name: "Stud" },
      { orderId: o2!.id, productId: productIds[1]!, vendorId: storeOwner, quantity: 1, price: "125.00", name: "Stud" },
    ]);
    await db.insert(schema.orderLog).values({ orderId: o1!.id, action: "created", newStatus: "pending", note: "secret admin note" });
  });

  afterAll(async () => {
    if (!db) return;
    if (orderIds.length) await db.delete(schema.order).where(inArray(schema.order.id, orderIds));
    if (productIds.length) await db.delete(schema.product).where(inArray(schema.product.id, productIds));
    await db.delete(schema.category).where(like(schema.category.slug, `${TAG}%`));
    await db.delete(schema.file).where(like(schema.file.diskname, `${TAG}%`));
  });

  it("digest versions match the full export, page by page", async () => {
    const all: Array<{ id: string; orderNumber: number; version: string }> = [];
    let cursor: number | undefined;
    for (;;) {
      const page = await svc.listOrderDigest(db as never, { afterOrderNumber: cursor, limit: 1 });
      all.push(...page.orders);
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    const mine = all.filter((d) => orderIds.includes(d.id));
    expect(mine).toHaveLength(2);
    expect(mine[0]!.orderNumber).toBeLessThan(mine[1]!.orderNumber);

    const full = await svc.getOrdersForExport(db as never, orderIds);
    for (const d of mine) expect(full.find((f) => f.id === d.id)?.version).toBe(d.version);

    const o1 = full.find((f) => f.id === orderIds[0])!;
    expect(o1.lines.map((l) => [l.internalCode, l.quantity, l.unitPrice])).toEqual([
      [`${TAG}ER002`, 1, "195.00"],
      [null, 2, "125.00"],
    ]);
    expect(o1.amounts.total).toBe("470.00");
    expect(o1.events).toEqual([expect.objectContaining({ action: "created", newStatus: "pending" })]);
    expect(JSON.stringify(o1)).not.toContain("secret admin note");
    expect(JSON.stringify(o1)).not.toContain("Secret Street");
  });

  it("a status-only change changes the version", async () => {
    const [before] = await svc.getOrdersForExport(db as never, [orderIds[0]!]);
    await db.update(schema.order).set({ status: "shipped" }).where(eq(schema.order.id, orderIds[0]!));
    const [after] = await svc.getOrdersForExport(db as never, [orderIds[0]!]);
    expect(after!.status).toBe("shipped");
    expect(after!.version).not.toBe(before!.version);
  });

  it("a hard-deleted order leaves the digest", async () => {
    await db.delete(schema.order).where(eq(schema.order.id, orderIds[1]!));
    const page = await svc.listOrderDigest(db as never, { limit: 1000 });
    expect(page.orders.some((o) => o.id === orderIds[1])).toBe(false);
    expect(await svc.getOrdersForExport(db as never, [orderIds[1]!])).toEqual([]);
  });

  it("products carry the merchant SKU, cost and sellable counter", async () => {
    const products = (await svc.listProductsForExport(db as never)).filter((p) => productIds.includes(p.id));
    expect(products).toEqual([
      expect.objectContaining({ internalCode: `${TAG}ER002`, costPrice: "60.00", stock: 8, salePrice: "195.00", optionGroups: ["Colour"], category: `${TAG}Ear` }),
      expect.objectContaining({ internalCode: null, costPrice: null, stock: 3 }),
    ]);
  });

  it("a code reused after its old product was deleted exports once as live, history intact", async () => {
    // Migration 0068: a deleted product keeps its code but no longer reserves
    // it. The ERP keys mappings by storefront product id and ignores deleted
    // rows for issues, so the feed must flag which row is the live owner.
    const [oldCopy] = productIds;
    await db.update(schema.product).set({ deleted: true }).where(eq(schema.product.id, oldCopy!));
    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    const [live] = await db
      .insert(schema.product)
      .values({
        name: `${TAG}Hoop v2`, description: "d", imageId: fileId, categoryId, vendorId: storeOwner,
        price: "250.00", stock: 5, internalCode: `${TAG}ER002`,
      })
      .returning();
    productIds.push(live!.id);

    const rows = (await svc.listProductsForExport(db as never)).filter((p) => p.internalCode === `${TAG}ER002`);
    expect(rows.map((p) => [p.id, p.deleted])).toEqual([
      [oldCopy, true],
      [live!.id, false],
    ]);
    expect(rows.filter((p) => !p.deleted)).toHaveLength(1);

    // Orders placed against the old copy keep the code they were sold under.
    const [o1] = await svc.getOrdersForExport(db as never, [orderIds[0]!]);
    expect(o1!.lines.some((l) => l.internalCode === `${TAG}ER002`)).toBe(true);
  });
});
