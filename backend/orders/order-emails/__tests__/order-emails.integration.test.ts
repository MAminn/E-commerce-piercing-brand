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
 *   • an online-payment order is confirmed only once payment is confirmed;
 *   • (ported from the Mach fix) sends carry one stable Message-ID across
 *     retries, failures back off, a late failure never downgrades a sent
 *     row (no duplicate), interrupted sends count as attempts, and order
 *     emails are claimed ahead of marketing rows.
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

/**
 * A due time older than anything another suite can leave queued in the shared
 * test database, used to make this file's claim tests take only their own rows.
 */
const ISOLATED_DUE_AT = new Date("2000-01-02T00:00:00Z");

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
    const sent: Array<{ to: string; subject: string; html: string; options?: { messageId?: string } & Record<string, unknown> }> = [];
    const service = {
      sendEmail: (to: string, subject: string, html: string, options?: { messageId?: string }) => {
        sent.push({ to, subject, html, options });
        return Effect.succeed(
          succeed
            ? { success: true, messageId: options?.messageId, response: "250 2.0.0 OK queued" }
            : { success: false, error: "SMTP 421 try later" },
        );
      },
    };
    return { service: service as never, sent };
  };

  const rowById = async (id: string) =>
    (await db.select().from(schema.scheduledEmail).where(eq(schema.scheduledEmail.id, id)))[0]!;

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
    // Isolation: this test's rows are made the oldest due rows, so the claim
    // takes exactly them whatever other suites left queued in the shared
    // database, and no other row is ever claimed or touched.
    const mine = await db
      .update(schema.scheduledEmail)
      .set({ scheduledFor: ISOLATED_DUE_AT })
      .where(like(schema.scheduledEmail.dedupeKey, `%${placed.id}%`))
      .returning({ id: schema.scheduledEmail.id });
    expect(mine.length).toBeGreaterThan(0);
    const claimed = await claimDueScheduledEmails(mine.length, TRANSACTIONAL_EMAIL_TYPES);
    try {
      expect(claimed.map((r) => r.id).sort()).toEqual(mine.map((r) => r.id).sort());
      expect(claimed.map((r) => r.dedupeKey)).toContain(`order_confirmation:${placed.id}`);
      expect(claimed.every((r) => TRANSACTIONAL_EMAIL_TYPES.includes(r.automationType as never))).toBe(true);
    } finally {
      // Never leave a row "sending"; this test's own rows are then retired.
      await db
        .update(schema.scheduledEmail)
        .set({ status: "cancelled" })
        .where(inArray(schema.scheduledEmail.id, [...new Set([...mine, ...claimed].map((r) => r.id))]));
    }
  });

  // ── Reliability (ported from the Mach Supplements fix) ───────────────────

  it("a retry reuses the same Message-ID, and the log records the provider's acceptance", async () => {
    const placed = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
    const [row] = await confirmationRow(placed.id);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = fakeEmail(false);
    await processRow(row!, failing.service);
    error.mockRestore();
    const ok = fakeEmail(true);
    await processRow(await rowById(row!.id), ok.service);

    const first = failing.sent[0]!.options?.messageId;
    expect(first).toMatch(new RegExp(`^<order-confirmation\\.${placed.id}@[^>]+>$`));
    expect(ok.sent[0]!.options?.messageId).toBe(first);

    expect(await rowById(row!.id)).toMatchObject({ status: "sent", attempts: 1, lastError: null });
    const sentLog = (await logFor(placed.id)).find((l) => l.action === "confirmation_email_sent");
    expect(sentLog?.note).toContain("accepted by the mail server");
    expect(sentLog?.note).toContain(`Message-ID ${first}`);
    expect(sentLog?.note).toContain("250 2.0.0 OK");
  });

  it("store notifications carry their own per-recipient Message-ID without the address in it", async () => {
    const placed = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
    await orderEmails.queueOrderPlacedEmails(
      { orderId: placed.id, customerEmail: placed.customerEmail },
      { listAdminEmails: async () => ["owner.one@example.test"] },
    );
    const [adminRow] = (await rowsFor(placed.id)).filter((r) => r.automationType === "order_admin_notification" && r.recipientEmail === "owner.one@example.test");
    const email = fakeEmail(true);
    await processRow(adminRow!, email.service);
    const id = email.sent[0]!.options?.messageId ?? "";
    expect(id).toMatch(new RegExp(`^<order-notification\\.${placed.id}\\.[0-9a-f]{12}@[^>]+>$`));
    expect(id).not.toContain("owner.one");
  });

  it("a failed order email backs off instead of retrying every minute, and gives up only after the transactional limit", async () => {
    const queue = await import("#root/backend/email-automations/queue/service");
    const placed = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
    const [row] = await confirmationRow(placed.id);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = Date.now();
    await processRow(row!, fakeEmail(false).service);
    let after = await rowById(row!.id);
    expect(after).toMatchObject({ status: "pending", attempts: 1 });
    expect(after.scheduledFor.getTime()).toBeGreaterThanOrEqual(before + 55_000);

    // Second failure → 5 minutes.
    const before2 = Date.now();
    await processRow(after, fakeEmail(false).service);
    after = await rowById(row!.id);
    expect(after.attempts).toBe(2);
    expect(after.scheduledFor.getTime()).toBeGreaterThanOrEqual(before2 + 5 * 60_000 - 5_000);

    // At the limit the row fails for good and the log says so.
    await db
      .update(schema.scheduledEmail)
      .set({ attempts: queue.TRANSACTIONAL_MAX_ATTEMPTS - 1 })
      .where(eq(schema.scheduledEmail.id, row!.id));
    await processRow(await rowById(row!.id), fakeEmail(false).service);
    error.mockRestore();
    expect(await rowById(row!.id)).toMatchObject({ status: "failed", attempts: queue.TRANSACTIONAL_MAX_ATTEMPTS });
    const notes = (await logFor(placed.id)).filter((l) => l.action === "confirmation_email_failed").map((l) => l.note);
    expect(notes.some((n) => n?.includes("retries exhausted, NOT sent"))).toBe(true);
  });

  it("a late failure never downgrades a row already marked sent (no duplicate, no false failure log)", async () => {
    const placed = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
    const [row] = await confirmationRow(placed.id);
    // Copy A succeeds first ...
    await processRow(row!, fakeEmail(true).service);
    expect((await rowById(row!.id)).status).toBe("sent");
    // ... then a stale copy B of the same claimed row fails.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await processRow(row!, fakeEmail(false).service);
    error.mockRestore();

    expect(await rowById(row!.id)).toMatchObject({ status: "sent", attempts: 0 });
    const actions = (await logFor(placed.id)).map((l) => l.action);
    expect(actions).toContain("confirmation_email_sent");
    expect(actions).not.toContain("confirmation_email_failed");
    // Nothing left for the worker to claim → no second email.
    const { claimDueScheduledEmails, TRANSACTIONAL_EMAIL_TYPES } = await import(
      "#root/backend/email-automations/queue/service"
    );
    const claimed = await claimDueScheduledEmails(100, TRANSACTIONAL_EMAIL_TYPES);
    expect(claimed.map((r) => r.id)).not.toContain(row!.id);
    if (claimed.length > 0) {
      await db
        .update(schema.scheduledEmail)
        .set({ status: "pending" })
        .where(inArray(schema.scheduledEmail.id, claimed.map((r) => r.id)));
    }
  });

  it("an interrupted send is re-queued as one attempt; past the limit it is failed, never looped forever", async () => {
    const queue = await import("#root/backend/email-automations/queue/service");
    const placed = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
    const [row] = await confirmationRow(placed.id);
    const longAgo = new Date(Date.now() - 60 * 60_000);
    await db
      .update(schema.scheduledEmail)
      .set({ status: "sending", updatedAt: longAgo })
      .where(eq(schema.scheduledEmail.id, row!.id));

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await queue.requeueStaleSendingEmails(queue.TRANSACTIONAL_EMAIL_TYPES, 15 * 60_000);
    let after = await rowById(row!.id);
    expect(after).toMatchObject({ status: "pending", attempts: 1 });
    expect(after.lastError).toMatch(/Interrupted mid-send/);

    await db
      .update(schema.scheduledEmail)
      .set({ status: "sending", updatedAt: longAgo, attempts: queue.TRANSACTIONAL_MAX_ATTEMPTS - 1 })
      .where(eq(schema.scheduledEmail.id, row!.id));
    await queue.requeueStaleSendingEmails(queue.TRANSACTIONAL_EMAIL_TYPES, 15 * 60_000);
    warn.mockRestore();
    after = await rowById(row!.id);
    expect(after).toMatchObject({ status: "failed", attempts: queue.TRANSACTIONAL_MAX_ATTEMPTS });

    // A row that is only briefly "sending" (a live send) is left alone.
    await db
      .update(schema.scheduledEmail)
      .set({ status: "sending", updatedAt: new Date(), attempts: 0 })
      .where(eq(schema.scheduledEmail.id, row!.id));
    await queue.requeueStaleSendingEmails(queue.TRANSACTIONAL_EMAIL_TYPES, 15 * 60_000);
    expect((await rowById(row!.id)).status).toBe("sending");
    await db.update(schema.scheduledEmail).set({ status: "cancelled" }).where(eq(schema.scheduledEmail.id, row!.id));
  });

  it("order emails are claimed ahead of an older marketing backlog", async () => {
    const queue = await import("#root/backend/email-automations/queue/service");
    // Isolation without touching anyone else's rows: the marketing backlog is
    // OLDER than this order's emails, which are older than anything another
    // suite can have left due. So claim(1) returns this order's email exactly
    // when transactional rows go ahead of older marketing ones.
    {
      const old = new Date(ISOLATED_DUE_AT.getTime() - 24 * 60 * 60_000);
      const marketing = await db
        .insert(schema.scheduledEmail)
        .values(
          Array.from({ length: 3 }, (_, i) => ({
            automationType: "win_back" as const,
            recipientEmail: `${TAG}mkt${i}@example.test`,
            payload: {},
            scheduledFor: old,
            dedupeKey: `${TAG}mkt:${Date.now()}:${i}`,
          })),
        )
        .returning({ id: schema.scheduledEmail.id });
      const placed = await run(createOrderModule.createOrder(order({ items: [{ productId: plain, quantity: 1 }] })));
      await db
        .update(schema.scheduledEmail)
        .set({ scheduledFor: ISOLATED_DUE_AT })
        .where(like(schema.scheduledEmail.dedupeKey, `%${placed.id}%`));

      try {
        const claimed = await queue.claimDueScheduledEmails(1);
        expect(claimed).toHaveLength(1);
        expect(queue.isTransactionalEmailType(claimed[0]!.automationType)).toBe(true);
        expect(claimed[0]!.payload).toMatchObject({ orderId: placed.id });
      } finally {
        await db.delete(schema.scheduledEmail).where(inArray(schema.scheduledEmail.id, marketing.map((m) => m.id)));
        await db.update(schema.scheduledEmail).set({ status: "cancelled" }).where(like(schema.scheduledEmail.dedupeKey, `%${placed.id}%`));
      }
    }
  });
});
