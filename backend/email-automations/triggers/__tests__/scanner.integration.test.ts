import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("trigger scanner (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let scanner: typeof import("#root/backend/email-automations/triggers/scanner");
  let templateService: typeof import("#root/backend/email-automations/templates/service");
  let cartCapture: typeof import("#root/backend/cart-capture/service");

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    scanner = await import("#root/backend/email-automations/triggers/scanner");
    templateService = await import("#root/backend/email-automations/templates/service");
    cartCapture = await import("#root/backend/cart-capture/service");
  });

  beforeEach(async () => {
    await db.delete(schema.scheduledEmail);
    await db.delete(schema.capturedCart);
    await db.delete(schema.viewedProduct);
    await db.delete(schema.order);
    await db.delete(schema.emailTemplate);
    await db.delete(schema.emailSubscription);
  });

  afterAll(async () => {
    await db.delete(schema.scheduledEmail);
    await db.delete(schema.capturedCart);
    await db.delete(schema.viewedProduct);
    await db.delete(schema.order);
    await db.delete(schema.emailTemplate);
    await db.delete(schema.emailSubscription);
  });

  describe("scanAbandonedCarts", () => {
    it("enqueues step1 for a cart idle past step1's configured delay", async () => {
      // step1 default delay is 60 minutes
      await db.insert(schema.capturedCart).values({
        sessionToken: "scan-cart-1",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: "10.00",
        email: "idle@example.com",
        lastActivityAt: new Date(Date.now() - 90 * 60_000), // 90 min ago
      });

      await scanner.scanAbandonedCarts();

      const rows = await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.recipientEmail, "idle@example.com"));
      const step1 = rows.find((r) => (r.payload as { step?: string })?.step === "step1");
      expect(step1).toBeDefined();
      expect(step1?.automationType).toBe("abandoned_cart");
    });

    it("does NOT enqueue for a cart that hasn't been idle long enough yet", async () => {
      await db.insert(schema.capturedCart).values({
        sessionToken: "scan-cart-2",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: "10.00",
        email: "fresh@example.com",
        lastActivityAt: new Date(Date.now() - 5 * 60_000), // only 5 min ago
      });

      await scanner.scanAbandonedCarts();

      const rows = await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.recipientEmail, "fresh@example.com"));
      expect(rows).toHaveLength(0);
    });

    it("does not re-enqueue a step that's already pending on a second scan (idempotent)", async () => {
      await db.insert(schema.capturedCart).values({
        sessionToken: "scan-cart-3",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: "10.00",
        email: "repeat-scan@example.com",
        lastActivityAt: new Date(Date.now() - 90 * 60_000),
      });

      await scanner.scanAbandonedCarts();
      await scanner.scanAbandonedCarts();

      const rows = await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.recipientEmail, "repeat-scan@example.com"));
      expect(rows).toHaveLength(1); // not duplicated
    });

    it("skips a step entirely when its template is disabled by the admin", async () => {
      await templateService.upsertTemplate({
        automationType: "abandoned_cart",
        stepKey: "step1",
        enabled: false,
        delayMinutes: 60,
        subjectEn: "x",
        subjectAr: "x",
        content: (await templateService.getEffectiveTemplate("abandoned_cart", "step1")).content,
        promoCodeId: null,
      });

      await db.insert(schema.capturedCart).values({
        sessionToken: "scan-cart-4",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: "10.00",
        email: "disabled-step@example.com",
        lastActivityAt: new Date(Date.now() - 90 * 60_000),
      });

      await scanner.scanAbandonedCarts();

      const rows = await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.recipientEmail, "disabled-step@example.com"));
      expect(rows).toHaveLength(0);
    });

    it("does not enqueue for a cart with no known email", async () => {
      await db.insert(schema.capturedCart).values({
        sessionToken: "scan-cart-5",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: "10.00",
        lastActivityAt: new Date(Date.now() - 90 * 60_000),
      });

      await scanner.scanAbandonedCarts();

      const rows = await db.select().from(schema.scheduledEmail);
      expect(rows).toHaveLength(0);
    });

    it("does not enqueue for a cart that already converted to an order", async () => {
      const { v7 } = await import("uuid");
      await db.insert(schema.capturedCart).values({
        sessionToken: "scan-cart-6",
        items: [{ id: "p1", name: "Widget", quantity: 1, price: 10 }],
        subtotal: "10.00",
        email: "converted-scan@example.com",
        lastActivityAt: new Date(Date.now() - 90 * 60_000),
        convertedOrderId: null,
      });
      // Mark it converted via the real service (exercises the actual path)
      const orderId = v7();
      await db.insert(schema.order).values({
        id: orderId,
        customerName: "Test",
        customerEmail: "converted-scan@example.com",
        customerPhone: "01000000000",
        shippingAddress: "x",
        shippingCity: "x",
        shippingState: "x",
        shippingPostalCode: "x",
        shippingCountry: "Egypt",
        subtotal: "10.00",
        shipping: "0.00",
        tax: "0.00",
        total: "10.00",
      });
      await cartCapture.markCartConverted("scan-cart-6", orderId);

      await scanner.scanAbandonedCarts();

      const rows = await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.recipientEmail, "converted-scan@example.com"));
      expect(rows).toHaveLength(0);
    });
  });

  describe("scanAbandonedBrowses", () => {
    it("enqueues for a viewed product past the configured delay", async () => {
      const { v7 } = await import("uuid");
      // viewedProduct.productId has a real FK — but scanAbandonedBrowses
      // never touches the product table, only viewedProduct's own columns,
      // so a syntactically valid (but non-existent) FK target would fail
      // on insert. Use a real minimal product via the same chain as
      // cart-capture's tests.
      const fileId = v7();
      await db.insert(schema.file).values({ id: fileId, diskname: "x.jpg" });
      const categoryId = v7();
      await db.insert(schema.category).values({ id: categoryId, name: "Cat", slug: "cat" });
      const vendorId = v7();
      await db.insert(schema.vendor).values({ id: vendorId, name: "Vendor" });
      const productId = v7();
      await db.insert(schema.product).values({
        id: productId,
        name: "Browsed Product",
        description: "x",
        price: "20.00",
        stock: 5,
        imageId: fileId,
        categoryId,
        vendorId,
      });

      await db.insert(schema.viewedProduct).values({
        sessionToken: "scan-view-1",
        productId,
        productName: "Browsed Product",
        email: "browser@example.com",
        viewedAt: new Date(Date.now() - 25 * 60 * 60_000), // 25h ago (default delay is 24h)
      });

      await scanner.scanAbandonedBrowses();

      const rows = await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.recipientEmail, "browser@example.com"));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.automationType).toBe("abandoned_browse");

      await db.delete(schema.viewedProduct);
      await db.delete(schema.product);
      await db.delete(schema.category);
      await db.delete(schema.vendor);
      await db.delete(schema.file);
    });
  });

  describe("scanWinBack", () => {
    it("enqueues win-back for a customer whose last order is past the threshold", async () => {
      const { v7 } = await import("uuid");
      await db.insert(schema.order).values({
        id: v7(),
        customerName: "Old Customer",
        customerEmail: "winback@example.com",
        customerPhone: "01000000000",
        shippingAddress: "x",
        shippingCity: "x",
        shippingState: "x",
        shippingPostalCode: "x",
        shippingCountry: "Egypt",
        subtotal: "10.00",
        shipping: "0.00",
        tax: "0.00",
        total: "10.00",
        createdAt: new Date(Date.now() - 100 * 24 * 60 * 60_000), // 100 days ago (default threshold 90)
      });

      await scanner.scanWinBack();

      const rows = await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.recipientEmail, "winback@example.com"));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.automationType).toBe("win_back");
    });

    it("does NOT enqueue for a customer whose most recent order is still within the threshold, even if an OLDER order exists", async () => {
      const { v7 } = await import("uuid");
      // Older order, past threshold
      await db.insert(schema.order).values({
        id: v7(),
        customerName: "Recent Customer",
        customerEmail: "recent-buyer@example.com",
        customerPhone: "01000000000",
        shippingAddress: "x",
        shippingCity: "x",
        shippingState: "x",
        shippingPostalCode: "x",
        shippingCountry: "Egypt",
        subtotal: "10.00",
        shipping: "0.00",
        tax: "0.00",
        total: "10.00",
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60_000),
      });
      // MOST RECENT order is recent — should suppress win-back (uses MAX(createdAt))
      await db.insert(schema.order).values({
        id: v7(),
        customerName: "Recent Customer",
        customerEmail: "recent-buyer@example.com",
        customerPhone: "01000000000",
        shippingAddress: "x",
        shippingCity: "x",
        shippingState: "x",
        shippingPostalCode: "x",
        shippingCountry: "Egypt",
        subtotal: "10.00",
        shipping: "0.00",
        tax: "0.00",
        total: "10.00",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60_000), // 5 days ago
      });

      await scanner.scanWinBack();

      const rows = await db
        .select()
        .from(schema.scheduledEmail)
        .where(eq(schema.scheduledEmail.recipientEmail, "recent-buyer@example.com"));
      expect(rows).toHaveLength(0);
    });
  });
});
