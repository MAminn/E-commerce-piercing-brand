import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Order confirmation emails, end to end against a real disposable Postgres:
 *
 *   • every order gets a unique, sequential order number;
 *   • a COD order queues exactly ONE customer confirmation
 *     (`order_confirmation:<orderId>`) — repeats are deduped;
 *   • the worker renders it from the stored order, and the printed money
 *     reconciles (subtotal − discount + shipping = total) for promo, sale,
 *     variant and Set orders;
 *   • send outcomes land on the order activity log;
 *   • an email failure — queue, render or SMTP — never fails the order;
 *   • an online-payment order is confirmed only once payment is confirmed.
 *
 * No real email is sent: the worker is driven with a fake email service.
 * Skipped when TEST_DATABASE_URL is unset.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

/** Flip to make the email queue throw, to prove the order still succeeds. */
const queueFault = vi.hoisted(() => ({ fail: false }));
vi.mock("#root/backend/email-automations/queue/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#root/backend/email-automations/queue/service")>();
  return {
    ...actual,
    enqueueScheduledEmail: (...args: Parameters<typeof actual.enqueueScheduledEmail>) =>
      queueFault.fail ? Promise.reject(new Error("queue unavailable")) : actual.enqueueScheduledEmail(...args),
  };
});

type ShippingRulesConfig = import("#root/shared/shipping/rules").ShippingRulesConfig;
const ZONE_RULES: ShippingRulesConfig = {
  version: 1,
  mode: "zones",
  currency: "EGP",
  // Test fixtures only.
  rates: { CAI: 60 },
  fallbackFee: 90,
};

describeIfDb("order confirmation emails (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let createOrderModule: typeof import("#root/backend/orders/create-order/service");
  let bundleService: typeof import("#root/backend/bundles/service");
  let orderEmails: typeof import("#root/backend/orders/order-emails/service");
  let worker: typeof import("#root/backend/email-automations/worker");
  let payments: typeof import("#root/backend/payments/confirm-online-payment");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "order-email-it-";
  let fileId: string;
  let categoryId: string;
  let plain: string;
  let sale: string;
  let variant: string;
  let setPieces: string[] = [];
  let campaignId: string;
  let promoId: string;

  const run = <A, E>(effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>) =>
    Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  const order = (overrides: Record<string, unknown> = {}) =>
    createOrderModule.createOrderSchema.parse({
      customerName: "Nour Tester",
      customerEmail: `${TAG}${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
      customerPhone: "01012345678",
      shippingAddress: "12 Test St",
      shippingCity: "Nasr City",
      shippingState: "",
      shippingPostalCode: "",
      shippingCountry: "Egypt",
      shippingGovernorateCode: "CAI",
      items: [],
      bundles: [],
      paymentMethod: "cod",
      ...overrides,
    });

  /** Captures what the worker would have sent. Never touches SMTP. */
  const fakeEmail = (succeed = true) => {
    const sent: Array<{ to: string; subject: string; html: string; options?: unknown }> = [];
    const service = {
      sendEmail: (to: string, subject: string, html: string, options?: unknown) => {
        sent.push({ to, subject, html, options });
        return Effect.succeed(succeed ? { success: true } : { success: false, error: "SMTP 421 try later" });
      },
    };
    return { service: service as never, sent };
  };

  const rowsFor = (orderId: string) =>
    db
      .select()
      .from(schema.scheduledEmail)
      .where(like(schema.scheduledEmail.dedupeKey, `%${orderId}%`));

  const confirmationRow = async (orderId: string) => {
    const rows = await rowsFor(orderId);
    return rows.filter((r) => r.automationType === "order_confirmation");
  };

  const logFor = (orderId: string) =>
    db.select().from(schema.orderLog).where(eq(schema.orderLog.orderId, orderId));

  const processRow = (row: import("#root/shared/database/drizzle/schema").ScheduledEmailRow, service: never) =>
    worker.processScheduledEmailRow(row, service, { enabled: false, email: "" });

  /** Reads one section's printed totals back out of the rendered HTML (the last amount in each totals row). */
  const printed = (html: string, lang: "en" | "ar") => {
    const start = html.indexOf(`data-lang="${lang}"`);
    const next = html.indexOf("data-lang=", start + 10);
    const section = html.slice(start, next === -1 ? undefined : next);
    const amount = (kind: string) => {
      const at = section.indexOf(`data-total="${kind}"`);
      if (at === -1) return 0;
      const row = section
        .slice(at, section.indexOf("</table>", at))
        .replace(/<[^>]+>/g, " ")
        .replace(/,/g, "");
      const numbers = row.match(/\d+(\.\d+)?/g) ?? [];
      return numbers.length > 0 ? Number(numbers[numbers.length - 1]) : 0;
    };
    return {
      subtotal: amount("subtotal"),
      discount: amount("discount"),
      shipping: amount("shipping"),
      total: amount("total"),
    };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    createOrderModule = await import("#root/backend/orders/create-order/service");
    bundleService = await import("#root/backend/bundles/service");
    orderEmails = await import("#root/backend/orders/order-emails/service");
    worker = await import("#root/backend/email-automations/worker");
    payments = await import("#root/backend/payments/confirm-online-payment");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = file!.id;
    const [category] = await db
      .insert(schema.category)
      .values({ name: `${TAG}cat`, slug: `${TAG}cat`, type: "general" })
      .returning();
    categoryId = category!.id;

    const product = (name: string, price: string, discountPrice: string | null = null) => ({
      name: `${TAG}${name}`,
      description: "it",
      imageId: fileId,
      categoryId,
      price,
      discountPrice,
      vendorId: storeOwner,
      stock: 100,
    });
    const rows = await db
      .insert(schema.product)
      .values([
        product("plain", "250.00"),
        product("sale", "350.00", "300.00"),
        product("variant", "200.00"),
        product("set-a", "120.00"),
        product("set-b", "120.00"),
        product("set-c", "120.00"),
      ])
      .returning({ id: schema.product.id });
    [plain, sale, variant] = rows.slice(0, 3).map((r) => r.id) as [string, string, string];
    setPieces = rows.slice(3).map((r) => r.id);
    await db
      .insert(schema.productVariant)
      .values({ productId: variant, name: "Color", values: [{ value: "Gold", priceModifier: 20 }, { value: "Silver" }] });

    const created = await run(
      bundleService.createBundleCampaign(
        bundleService.createBundleCampaignSchema.parse({
          internalName: `${TAG}set`,
          title: "Pick Your Set",
          slug: `${TAG}pick-your-set`,
          requiredQuantity: 3,
          fixedBundlePrice: 270,
          isActive: true,
          eligibleProductIds: setPieces,
        }),
      ) as never,
    );
    campaignId = (created as { id: string }).id;

    const [promo] = await db
      .insert(schema.promoCode)
      .values({
        code: "OEITPERCE100",
        discountType: "fixed_amount",
        discountValue: "100.00",
        status: "active",
        appliesToAllProducts: true,
      })
      .returning();
    promoId = promo!.id;

    await db.insert(schema.storeSettings).values({ key: "default" }).onConflictDoNothing();
    await db
      .update(schema.storeSettings)
      .set({ shippingRules: ZONE_RULES, shippingFee: "0.00", updatedAt: new Date() })
      .where(eq(schema.storeSettings.key, "default"));
  });

  beforeEach(async () => {
    queueFault.fail = false;
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.delete(schema.scheduledEmail).where(like(schema.scheduledEmail.recipientEmail, `${TAG}%`));
    await db
      .update(schema.product)
      .set({ stock: 100 })
      .where(inArray(schema.product.id, [plain, sale, variant, ...setPieces]));
  });

  afterAll(async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db.delete(schema.scheduledEmail).where(like(schema.scheduledEmail.recipientEmail, `${TAG}%`));
    await db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));
    await db.delete(schema.promoCode).where(eq(schema.promoCode.id, promoId));
    await db.delete(schema.product).where(inArray(schema.product.id, [plain, sale, variant, ...setPieces]));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
    await db
      .update(schema.storeSettings)
      .set({ shippingRules: null, updatedAt: new Date() })
      .where(eq(schema.storeSettings.key, "default"));
  });

  it("gives every order a unique, sequential order number", async () => {
    const a = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
    const b = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
    expect(a.orderNumber).toBeGreaterThanOrEqual(10001);
    expect(b.orderNumber).toBe(a.orderNumber + 1);
    const numbers = await db.select({ n: schema.order.orderNumber }).from(schema.order);
    expect(new Set(numbers.map((r) => r.n)).size).toBe(numbers.length);
  });

  it("queues exactly one customer confirmation per COD order, and repeats are deduped", async () => {
    const placed = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
    let rows = await confirmationRow(placed.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientEmail: placed.customerEmail,
      dedupeKey: `order_confirmation:${placed.id}`,
      status: "pending",
      payload: { orderId: placed.id },
    });

    // A second trigger for the same order (retry, duplicate webhook…) adds nothing.
    await orderEmails.queueOrderPlacedEmails({ orderId: placed.id, customerEmail: placed.customerEmail });
    await orderEmails.queueOrderPlacedEmails({ orderId: placed.id, customerEmail: placed.customerEmail });
    rows = await confirmationRow(placed.id);
    expect(rows).toHaveLength(1);

    // One store notification per admin, never the customer email.
    const admins = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.role, "admin"));
    const adminRows = (await rowsFor(placed.id)).filter((r) => r.automationType === "order_admin_notification");
    expect(adminRows).toHaveLength(admins.length);
  });

  it("sends a reconciled bilingual confirmation for a promo + sale + variant order and logs it", async () => {
    // 2 × variant (200 + Gold 20) + 1 × sale (300) = 740; promo −100; CAI shipping 60 → 700.
    const placed = await run(
      createOrderModule.createOrder(
        order({
          items: [
            { productId: variant, quantity: 2, selectedOptions: { Color: "Gold" } },
            { productId: sale, quantity: 1 },
          ],
          promoCodeId: promoId,
        }),
      ),
    );
    expect(Number(placed.total)).toBe(700);

    const [row] = await confirmationRow(placed.id);
    const email = fakeEmail(true);
    await processRow(row!, email.service);

    expect(email.sent).toHaveLength(1);
    const { html, subject, to } = email.sent[0]!;
    expect(to).toBe(placed.customerEmail);
    expect(subject).toContain(`#${placed.orderNumber}`);
    for (const lang of ["en", "ar"] as const) {
      const t = printed(html, lang);
      expect(t).toEqual({ subtotal: 740, discount: 100, shipping: 60, total: 700 });
      expect(t.subtotal - t.discount + t.shipping).toBe(t.total);
    }
    expect(html).toContain("Discount (code OEITPERCE100)");
    expect(html).toContain("Color: Gold");
    expect(html).toContain("Cash on delivery");
    expect(html).not.toContain(placed.id);
    // Transactional: no marketing unsubscribe headers.
    expect(JSON.stringify(email.sent[0]!.options ?? {})).not.toMatch(/List-Unsubscribe/i);

    const [after] = await confirmationRow(placed.id);
    expect(after!.status).toBe("sent");
    const log = await logFor(placed.id);
    expect(log.map((l) => l.action)).toContain("confirmation_email_sent");
  });

  it("prints a Set at its price and still reconciles", async () => {
    const placed = await run(
      createOrderModule.createOrder(
        order({
          items: [{ productId: plain, quantity: 1 }],
          bundles: [
            {
              instanceId: `inst-${Math.random().toString(16).slice(2)}`,
              campaignId,
              expectedBundleTotal: 270,
              items: setPieces.map((productId) => ({ productId, quantity: 1 })),
            },
          ],
        }),
      ),
    );
    const [row] = await confirmationRow(placed.id);
    const email = fakeEmail(true);
    await processRow(row!, email.service);
    const t = printed(email.sent[0]!.html, "en");
    expect(t.total).toBe(Number(placed.total));
    expect(t.subtotal - t.discount + t.shipping).toBe(t.total);
    expect(t.subtotal).toBe(270 + 250);
    expect(email.sent[0]!.html).toContain("Pick Your Set");
  });

  it("an SMTP failure keeps the order, retries the email and records confirmation_email_failed", async () => {
    const placed = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
    const [row] = await confirmationRow(placed.id);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await processRow(row!, fakeEmail(false).service);
    error.mockRestore();

    const [after] = await confirmationRow(placed.id);
    expect(after).toMatchObject({ status: "pending", attempts: 1, lastError: "SMTP 421 try later" });
    const log = await logFor(placed.id);
    const failed = log.find((l) => l.action === "confirmation_email_failed");
    expect(failed?.note).toContain("will retry");
    const [stillThere] = await db.select().from(schema.order).where(eq(schema.order.id, placed.id));
    expect(stillThere).toBeDefined();
  });

  it("a queue failure never fails the order", async () => {
    queueFault.fail = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const placed = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
    error.mockRestore();
    expect(placed.id).toBeTruthy();
    const [stored] = await db.select().from(schema.order).where(eq(schema.order.id, placed.id));
    expect(stored?.status).toBe("pending");
    expect(await confirmationRow(placed.id)).toHaveLength(0);
  });

  it("a render failure marks the email failed, never anything about the order", async () => {
    const ghost = "0192f000-0000-7000-8000-00000000dead";
    await db.insert(schema.scheduledEmail).values({
      automationType: "order_confirmation",
      recipientEmail: `${TAG}ghost@example.test`,
      payload: { orderId: ghost },
      scheduledFor: new Date(),
      dedupeKey: `order_confirmation:${ghost}`,
    });
    const [row] = await db
      .select()
      .from(schema.scheduledEmail)
      .where(eq(schema.scheduledEmail.dedupeKey, `order_confirmation:${ghost}`));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const email = fakeEmail(true);
    await processRow(row!, email.service);
    error.mockRestore();
    expect(email.sent).toHaveLength(0);
    const [after] = await db.select().from(schema.scheduledEmail).where(eq(schema.scheduledEmail.id, row!.id));
    expect(after).toMatchObject({ status: "pending", attempts: 1 });
    expect(after!.lastError).toMatch(/no longer exists/);
    await db.delete(schema.scheduledEmail).where(eq(schema.scheduledEmail.id, row!.id));
  });

  it("an online-payment order is not confirmed at checkout — only once paid, once", async () => {
    const placed = await run(
      createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }], paymentMethod: "paymob" })),
    );
    expect(await confirmationRow(placed.id)).toHaveLength(0);

    await payments.applyOnlinePaymentUpdate(db as never, placed.id, { paymentStatus: "paid", transactionId: "txn-1" });
    // A duplicate "paid" webhook.
    await payments.applyOnlinePaymentUpdate(db as never, placed.id, { paymentStatus: "paid", transactionId: "txn-1" });
    const rows = await confirmationRow(placed.id);
    expect(rows).toHaveLength(1);

    const email = fakeEmail(true);
    await processRow(rows[0]!, email.service);
    expect(email.sent[0]!.html).toContain("Paid online");
    expect(email.sent[0]!.html).not.toContain("Cash on delivery");
  });

  it("a confirmation row for an unpaid online order is cancelled, never sent", async () => {
    const placed = await run(
      createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }], paymentMethod: "paymob" })),
    );
    // Something queued it anyway — the send-time guard must hold.
    await orderEmails.queueOrderPlacedEmails({ orderId: placed.id, customerEmail: placed.customerEmail });
    const [row] = await confirmationRow(placed.id);
    const email = fakeEmail(true);
    await processRow(row!, email.service);
    expect(email.sent).toHaveLength(0);
    const [after] = await confirmationRow(placed.id);
    expect(after!.status).toBe("cancelled");
    expect(after!.lastError).toMatch(/not paid/);
  });

  it("transactional rows are claimed even while marketing automations are switched off", async () => {
    const placed = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
    const { claimDueScheduledEmails, TRANSACTIONAL_EMAIL_TYPES } = await import(
      "#root/backend/email-automations/queue/service"
    );
    const claimed = await claimDueScheduledEmails(100, TRANSACTIONAL_EMAIL_TYPES);
    expect(claimed.map((r) => r.dedupeKey)).toContain(`order_confirmation:${placed.id}`);
    expect(claimed.every((r) => TRANSACTIONAL_EMAIL_TYPES.includes(r.automationType as never))).toBe(true);
    // Put them back so other rows are not left "sending".
    await db
      .update(schema.scheduledEmail)
      .set({ status: "pending" })
      .where(and(inArray(schema.scheduledEmail.id, claimed.map((r) => r.id))));
  });
});
