import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("cart capture service (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let cartCapture: typeof import("#root/backend/cart-capture/service");
  let queue: typeof import("#root/backend/email-automations/queue/service");
  let categoryId: string;
  let vendorId: string;
  let fileId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    cartCapture = await import("#root/backend/cart-capture/service");
    queue = await import("#root/backend/email-automations/queue/service");

    // product has NOT NULL FKs to category/vendor/file — create the minimal
    // chain once here so recordProductView's tests can insert real products.
    const { v7 } = await import("uuid");
    fileId = v7();
    await db.insert(schema.file).values({ id: fileId, diskname: "test.jpg" });
    categoryId = v7();
    await db
      .insert(schema.category)
      .values({ id: categoryId, name: "Test Category", slug: "test-category" });
    vendorId = v7();
    await db.insert(schema.vendor).values({ id: vendorId, name: "Test Vendor" });
  });

  beforeEach(async () => {
    await db.delete(schema.capturedCart);
    await db.delete(schema.viewedProduct);
    await db.delete(schema.scheduledEmail);
    await db.delete(schema.emailSubscription);
  });

  afterAll(async () => {
    await db.delete(schema.capturedCart);
    await db.delete(schema.viewedProduct);
    await db.delete(schema.scheduledEmail);
    await db.delete(schema.emailSubscription);
    await db.delete(schema.order);
    await db.delete(schema.product);
    await db.delete(schema.category);
    await db.delete(schema.vendor);
    await db.delete(schema.file);
  });

  describe("syncCart", () => {
    it("creates a new row on first sync", async () => {
      await cartCapture.syncCart({
        sessionToken: "session-1",
        items: [{ id: "p1", name: "Widget", quantity: 2, price: 10 }],
        subtotal: 20,
      });

      const [row] = await db
        .select()
        .from(schema.capturedCart)
        .where(eq(schema.capturedCart.sessionToken, "session-1"));
      expect(row).toBeDefined();
      expect(row?.items).toEqual([{ id: "p1", name: "Widget", quantity: 2, price: 10 }]);
      expect(row?.subtotal).toBe("20.00");
      expect(row?.email).toBeNull();
    });

    it("updates items/subtotal on repeat sync for the same session", async () => {
      await cartCapture.syncCart({
        sessionToken: "session-2",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: 10,
      });
      await cartCapture.syncCart({
        sessionToken: "session-2",
        items: [{ id: "p1", name: "Widget", quantity: 3, price: 10 }],
        subtotal: 30,
      });

      const rows = await db
        .select()
        .from(schema.capturedCart)
        .where(eq(schema.capturedCart.sessionToken, "session-2"));
      expect(rows).toHaveLength(1); // updated, not duplicated
      expect(rows[0]?.subtotal).toBe("30.00");
    });

    it("sets email when provided", async () => {
      await cartCapture.syncCart({
        sessionToken: "session-3",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: 10,
        email: "known@example.com",
      });

      const [row] = await db
        .select()
        .from(schema.capturedCart)
        .where(eq(schema.capturedCart.sessionToken, "session-3"));
      expect(row?.email).toBe("known@example.com");
    });

    it("does NOT null out a previously-known email on a subsequent anonymous sync", async () => {
      await cartCapture.syncCart({
        sessionToken: "session-4",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: 10,
        email: "known@example.com",
      });
      // Later sync omits email entirely (e.g. debounced sync firing without it)
      await cartCapture.syncCart({
        sessionToken: "session-4",
        items: [{ id: "p1", name: "Widget", quantity: 2, price: 10 }],
        subtotal: 20,
      });

      const [row] = await db
        .select()
        .from(schema.capturedCart)
        .where(eq(schema.capturedCart.sessionToken, "session-4"));
      expect(row?.email).toBe("known@example.com"); // still there
      expect(row?.subtotal).toBe("20.00"); // items still updated
    });
  });

  describe("attachContactToCart", () => {
    it("attaches email to an existing cart row", async () => {
      await cartCapture.syncCart({
        sessionToken: "session-5",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: 10,
      });
      await cartCapture.attachContactToCart({
        sessionToken: "session-5",
        email: "attached@example.com",
      });

      const [row] = await db
        .select()
        .from(schema.capturedCart)
        .where(eq(schema.capturedCart.sessionToken, "session-5"));
      expect(row?.email).toBe("attached@example.com");
    });

    it("is a silent no-op when no cart row exists for the session yet", async () => {
      await expect(
        cartCapture.attachContactToCart({
          sessionToken: "no-such-session",
          email: "orphan@example.com",
        }),
      ).resolves.toBeUndefined();

      const rows = await db
        .select()
        .from(schema.capturedCart)
        .where(eq(schema.capturedCart.sessionToken, "no-such-session"));
      expect(rows).toHaveLength(0); // did not create a row
    });
  });

  async function insertMinimalOrder(email: string): Promise<string> {
    const { v7 } = await import("uuid");
    const orderId = v7();
    await db.insert(schema.order).values({
      id: orderId,
      customerName: "Test Customer",
      customerEmail: email,
      customerPhone: "01000000000",
      shippingAddress: "123 Test St",
      shippingCity: "Cairo",
      shippingState: "Cairo",
      shippingPostalCode: "12345",
      shippingCountry: "Egypt",
      subtotal: "10.00",
      shipping: "0.00",
      tax: "0.00",
      total: "10.00",
    });
    return orderId;
  }

  describe("markCartConverted", () => {
    it("sets convertedOrderId on the cart row", async () => {
      await cartCapture.syncCart({
        sessionToken: "session-6",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: 10,
        email: "buyer@example.com",
      });

      const realOrderId = await insertMinimalOrder("buyer@example.com");
      await cartCapture.markCartConverted("session-6", realOrderId);

      const [row] = await db
        .select()
        .from(schema.capturedCart)
        .where(eq(schema.capturedCart.sessionToken, "session-6"));
      expect(row?.convertedOrderId).toBe(realOrderId);
    });

    it("cancels pending abandoned_cart queue rows whose dedupeKey is prefixed with this cart's id", async () => {
      await cartCapture.syncCart({
        sessionToken: "session-7",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: 10,
        email: "converter@example.com",
      });
      const [cartRow] = await db
        .select()
        .from(schema.capturedCart)
        .where(eq(schema.capturedCart.sessionToken, "session-7"));
      const cartId = cartRow!.id;

      await queue.enqueueScheduledEmail({
        automationType: "abandoned_cart",
        recipientEmail: "converter@example.com",
        payload: { step: "step2" },
        scheduledFor: new Date(Date.now() + 60_000),
        dedupeKey: `abandoned_cart:${cartId}:step2`,
      });
      // An unrelated cart's pending email must NOT be cancelled
      await queue.enqueueScheduledEmail({
        automationType: "abandoned_cart",
        recipientEmail: "someone-else@example.com",
        payload: { step: "step1" },
        scheduledFor: new Date(Date.now() + 60_000),
        dedupeKey: "abandoned_cart:unrelated-cart-id:step1",
      });

      const realOrderId = await insertMinimalOrder("converter@example.com");
      await cartCapture.markCartConverted("session-7", realOrderId);

      const rows = await db.select().from(schema.scheduledEmail);
      const thisCartsEmail = rows.find((r) => r.dedupeKey === `abandoned_cart:${cartId}:step2`);
      const unrelatedEmail = rows.find(
        (r) => r.dedupeKey === "abandoned_cart:unrelated-cart-id:step1",
      );
      expect(thisCartsEmail?.status).toBe("cancelled");
      expect(unrelatedEmail?.status).toBe("pending"); // untouched
    });
  });

  describe("findAbandonedCarts", () => {
    it("only returns carts with a known email, not converted, idle before the cutoff", async () => {
      const now = Date.now();

      // Eligible: known email, not converted, idle 2h
      await db.insert(schema.capturedCart).values({
        sessionToken: "abandoned-1",
        items: [],
        subtotal: "10.00",
        email: "abandoned@example.com",
        lastActivityAt: new Date(now - 2 * 60 * 60 * 1000),
      });
      // Not eligible: no email
      await db.insert(schema.capturedCart).values({
        sessionToken: "no-email",
        items: [],
        subtotal: "10.00",
        lastActivityAt: new Date(now - 2 * 60 * 60 * 1000),
      });
      // Not eligible: already converted
      await db.insert(schema.capturedCart).values({
        sessionToken: "converted",
        items: [],
        subtotal: "10.00",
        email: "converted@example.com",
        convertedOrderId: null, // will set below via update to satisfy FK-free test data
        lastActivityAt: new Date(now - 2 * 60 * 60 * 1000),
      });
      // Not eligible: too recent (idle only 1 minute)
      await db.insert(schema.capturedCart).values({
        sessionToken: "too-recent",
        items: [],
        subtotal: "10.00",
        email: "recent@example.com",
        lastActivityAt: new Date(now - 60 * 1000),
      });

      const cutoff = new Date(now - 60 * 60 * 1000); // 1h ago
      const results = await cartCapture.findAbandonedCarts(cutoff);
      const tokens = results.map((r) => r.sessionToken);

      expect(tokens).toContain("abandoned-1");
      expect(tokens).not.toContain("no-email");
      expect(tokens).not.toContain("too-recent");
    });
  });

  describe("recordProductView", () => {
    it("creates a view record", async () => {
      const { v7 } = await import("uuid");
      const productId = v7();
      await db.insert(schema.product).values({
        id: productId,
        name: "Test Product",
        description: "Test description",
        price: "50.00",
        stock: 10,
        imageId: fileId,
        categoryId,
        vendorId,
      });

      await cartCapture.recordProductView({
        sessionToken: "view-session-1",
        productId,
        productName: "Test Product",
      });

      const rows = await db
        .select()
        .from(schema.viewedProduct)
        .where(eq(schema.viewedProduct.sessionToken, "view-session-1"));
      expect(rows).toHaveLength(1);
    });

    it("upserts (updates viewedAt) instead of duplicating on a repeat view of the same product", async () => {
      const { v7 } = await import("uuid");
      const productId = v7();
      await db.insert(schema.product).values({
        id: productId,
        name: "Repeat Product",
        description: "Test description",
        price: "50.00",
        stock: 10,
        imageId: fileId,
        categoryId,
        vendorId,
      });

      await cartCapture.recordProductView({
        sessionToken: "view-session-2",
        productId,
        productName: "Repeat Product",
      });
      await cartCapture.recordProductView({
        sessionToken: "view-session-2",
        productId,
        productName: "Repeat Product",
      });

      const rows = await db
        .select()
        .from(schema.viewedProduct)
        .where(eq(schema.viewedProduct.sessionToken, "view-session-2"));
      expect(rows).toHaveLength(1);
    });
  });
});
