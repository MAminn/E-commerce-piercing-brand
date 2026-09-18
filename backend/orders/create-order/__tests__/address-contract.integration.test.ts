import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { count, eq, like } from "drizzle-orm";

/**
 * Proves the create-order address contract at the real boundary: a request
 * missing a NOT NULL address field is rejected by tRPC's input parsing and
 * never reaches the order transaction.
 *
 * Before the fix, the same request parsed cleanly, opened a transaction and
 * failed inside Postgres with a not-null violation — surfacing as a 500. The
 * assertions below are deliberately about BOTH halves: the error is a
 * client-side BAD_REQUEST, and no `order` row exists afterwards.
 *
 * Skipped when TEST_DATABASE_URL is unset, like the other
 * *.integration.test.ts files.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("create-order address contract (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let t: typeof import("#root/shared/trpc/server").t;
  let createOrderProcedure: typeof import("../trpc").createOrderProcedure;

  const TAG = "order-addr-it-";
  let productId: string;
  let categoryId: string;
  let fileId: string;
  let vendorId: string;

  /** A caller for the real procedure, so input parsing runs exactly as in production. */
  let call: (input: unknown) => Promise<unknown>;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    ({ t } = await import("#root/shared/trpc/server"));
    ({ createOrderProcedure } = await import("../trpc"));

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db
      .insert(schema.vendor)
      .values({ id: storeOwner, name: `${TAG}store`, status: "active" })
      .onConflictDoNothing();
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
      .values({
        name: `${TAG}product`,
        description: "it",
        imageId: fileId,
        categoryId,
        price: "100.00",
        vendorId,
        stock: 10,
      })
      .returning();
    productId = product!.id;

    const router = t.router({ create: createOrderProcedure });
    // The resolver never runs in the rejection cases, so a minimal context is
    // enough; the happy-path case exercises the real service with `db`.
    const caller = router.createCaller({
      db,
      clientSession: null,
      // The service fires confirmation email(s) after committing and swallows
      // failures; a no-op stub keeps the test output clean.
      emailService: { sendEmail: async () => undefined },
    } as never);
    call = (input: unknown) => caller.create(input as never);
  });

  const ordersPlaced = async () => {
    const [row] = await db
      .select({ n: count() })
      .from(schema.order)
      .where(like(schema.order.customerEmail, `${TAG}%`));
    return row?.n ?? 0;
  };

  beforeEach(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.update(schema.product).set({ stock: 10 }).where(eq(schema.product.id, productId));
  });

  afterAll(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.delete(schema.product).where(eq(schema.product.id, productId));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  const payload = (overrides: Record<string, unknown> = {}) => ({
    customerName: "Address Tester",
    customerEmail: `${TAG}${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
    customerPhone: "+201000000000",
    shippingAddress: "12 Road 9, Maadi",
    shippingCity: "Cairo",
    shippingState: "Cairo",
    shippingPostalCode: "11511",
    shippingCountry: "Egypt",
    items: [{ productId, quantity: 1 }],
    bundles: [],
    paymentMethod: "cod",
    ...overrides,
  });

  const omit = (key: string) => {
    const full = payload() as Record<string, unknown>;
    delete full[key];
    return full;
  };

  /** Asserts a client-side rejection that never opened the order transaction. */
  const expectRejectedBeforeInsert = async (input: unknown, field: string) => {
    const before = await ordersPlaced();
    let error: unknown;
    try {
      await call(input);
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    const e = error as { code?: string; name?: string; message?: string };
    // tRPC turns a failed `.input()` parse into BAD_REQUEST (HTTP 400) — not
    // the INTERNAL_SERVER_ERROR a Postgres not-null violation would produce.
    expect(e.code).toBe("BAD_REQUEST");
    expect(String(e.message)).toContain(field);
    expect(await ordersPlaced()).toBe(before);
  };

  it("accepts a fully populated address and writes the order", async () => {
    const result = (await call(payload())) as { success: boolean };
    expect(result.success).toBe(true);
    expect(await ordersPlaced()).toBe(1);
  });

  it("accepts the blank state / blank postal code the real checkout submits", async () => {
    const result = (await call(
      payload({ shippingState: "", shippingPostalCode: "" }),
    )) as { success: boolean };
    expect(result.success).toBe(true);

    const [row] = await db
      .select({ state: schema.order.shippingState, postal: schema.order.shippingPostalCode })
      .from(schema.order)
      .where(like(schema.order.customerEmail, `${TAG}%`));
    // Empty, not null — the NOT NULL invariant holds without inventing data.
    expect(row?.state).toBe("");
    expect(row?.postal).toBe("");
  });

  it("rejects a missing shippingState with a 400 and no INSERT", async () => {
    await expectRejectedBeforeInsert(omit("shippingState"), "shippingState");
  });

  it("rejects a missing shippingPostalCode with a 400 and no INSERT", async () => {
    await expectRejectedBeforeInsert(omit("shippingPostalCode"), "shippingPostalCode");
  });

  it("rejects a missing shippingCountry with a 400 and no INSERT", async () => {
    await expectRejectedBeforeInsert(omit("shippingCountry"), "shippingCountry");
  });

  it("rejects an explicitly null shippingState with a 400 and no INSERT", async () => {
    await expectRejectedBeforeInsert(payload({ shippingState: null }), "shippingState");
  });

  it("rejects an explicitly null shippingPostalCode with a 400 and no INSERT", async () => {
    await expectRejectedBeforeInsert(payload({ shippingPostalCode: null }), "shippingPostalCode");
  });

  it("rejects a blank shippingCountry with a 400 and no INSERT", async () => {
    await expectRejectedBeforeInsert(payload({ shippingCountry: "   " }), "shippingCountry");
  });

  it("does not decrement stock when the address is rejected", async () => {
    const [before] = await db
      .select({ stock: schema.product.stock })
      .from(schema.product)
      .where(eq(schema.product.id, productId));
    await expectRejectedBeforeInsert(omit("shippingState"), "shippingState");
    const [after] = await db
      .select({ stock: schema.product.stock })
      .from(schema.product)
      .where(eq(schema.product.id, productId));
    expect(after?.stock).toBe(before?.stock);
  });
});
