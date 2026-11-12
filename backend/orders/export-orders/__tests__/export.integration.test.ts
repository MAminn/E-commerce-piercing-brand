import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, like, sql } from "drizzle-orm";
import unzipper from "unzipper";

/**
 * The admin Excel export against a real Postgres, read back from the .xlsx:
 *
 *   • Export All contains every order — every status — across many batches,
 *     and its count matches the database
 *   • orders with several products produce one Order Items row per line,
 *     each carrying its order's id
 *   • money matches the stored order totals; Arabic text survives
 *   • Export Filtered returns exactly what the Orders page filters select
 *     (the same `order.view` conditions), plus the search box text
 *   • formula-looking customer text is stored as inert text
 *   • the HTTP route is admin-only and never writes to the database
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

type Row = Record<string, string | number>;

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

/** Minimal reader for the writer's own output: inline strings and numbers. */
function parseSheet(xml: string): Row[] {
  const rows: Array<Record<string, string | number>> = [];
  for (const m of xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)) {
    const cells: Record<string, string | number> = {};
    for (const c of m[2]!.matchAll(
      /<c r="([A-Z]+)\d+"(?: s="\d+")?( t="inlineStr")?>(?:<v>(.*?)<\/v>|<is><t xml:space="preserve">(.*?)<\/t><\/is>)<\/c>/g,
    )) {
      cells[c[1]!] = c[2] ? unescapeXml(c[4] ?? "") : Number(c[3]);
    }
    rows.push(cells);
  }
  const [header, ...data] = rows;
  return data.map((r) => {
    const out: Row = {};
    for (const [colRef, name] of Object.entries(header ?? {})) {
      if (r[colRef] !== undefined) out[String(name)] = r[colRef]!;
    }
    return out;
  });
}

async function readWorkbook(buf: Buffer) {
  const dir = await unzipper.Open.buffer(buf);
  const text = async (p: string) => (await dir.files.find((f) => f.path === p)!.buffer()).toString("utf8");
  const workbook = await text("xl/workbook.xml");
  const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => unescapeXml(m[1]!));
  const sheets: Record<string, Row[]> = {};
  for (let i = 0; i < names.length; i++) {
    sheets[names[i]!] = parseSheet(await text(`xl/worksheets/sheet${i + 1}.xml`));
  }
  return { names, sheets };
}

describeIfDb("admin orders Excel export (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let svc: typeof import("../service");
  let appRouter: typeof import("#root/shared/trpc/router").appRouter;

  const TAG = "ordexport-it-";
  const orderIds: string[] = [];
  const byStatus: Record<string, string> = {};
  let productIds: string[] = [];
  let promoId: string;

  const adminSession = {
    id: `${TAG}admin`,
    token: "hashed",
    email: `${TAG}admin@example.test`,
    name: "QA Admin",
    phone: "",
    expiresAt: new Date(Date.now() + 3_600_000),
    role: "admin",
    emailVerified: true,
    profilePicture: null,
  };

  const exportBuffer = async (req: import("../service").ExportOrdersRequest, batchSize = 2) => {
    const { workbook, summary } = await svc.buildOrdersWorkbook(db as never, req, { generatedBy: "QA", batchSize });
    try {
      return { buf: await workbook.toBuffer(), summary };
    } finally {
      await workbook.dispose();
    }
  };

  /** A fingerprint of everything the export reads, to prove it writes nothing. */
  const fingerprint = async () => {
    const r = await db.execute(sql`
      select
        (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from "order" t) as orders,
        (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from order_item t) as items,
        (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from order_log t) as logs,
        (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from order_bundle t) as bundles`);
    return r.rows[0];
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    svc = await import("../service");
    ({ appRouter } = await import("#root/shared/trpc/router"));

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db.insert(schema.vendor).values({ id: storeOwner, name: `${TAG}store`, status: "active" }).onConflictDoNothing();
    await db.insert(schema.user).values({ id: adminSession.id, email: adminSession.email, name: "QA Admin", role: "admin" });
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    const [cat] = await db.insert(schema.category).values({ name: `${TAG}Ear`, slug: `${TAG}ear`, type: "women" }).returning();
    const products = await db
      .insert(schema.product)
      .values([
        { name: `${TAG}Hoop`, description: "d", imageId: file!.id, categoryId: cat!.id, vendorId: storeOwner,
          price: "250.00", discountPrice: "195.00", stock: 8, internalCode: `${TAG}ER002`, costPrice: "60.00" },
        { name: `${TAG}Stud`, description: "d", imageId: file!.id, categoryId: cat!.id, vendorId: storeOwner, price: "125.00", stock: 3 },
      ])
      .returning();
    productIds = products.map((p) => p.id);
    const [promo] = await db
      .insert(schema.promoCode)
      .values({ code: `${TAG.toUpperCase()}WELCOME5`, discountType: "percentage", discountValue: "5" })
      .returning();
    promoId = promo!.id;

    const base = {
      customerEmail: `${TAG}customer@example.test`, customerPhone: "+201000000000", shippingAddress: "12 Street",
      shippingCity: "Nasr City", shippingState: "Cairo", shippingPostalCode: "", shippingCountry: "EG",
      shippingGovernorateCode: "CAI", tax: "0",
    };
    const statuses = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
    for (const [i, status] of statuses.entries()) {
      const [o] = await db
        .insert(schema.order)
        .values({
          ...base,
          customerName: i === 0 ? `${TAG}منى عبد الرحمن` : `${TAG}Customer ${status}`,
          shippingAddress: i === 0 ? "١٢ شارع التحرير، الدقي" : base.shippingAddress,
          status,
          subtotal: "445.00",
          discount: i === 0 ? "22.25" : null,
          promoCodeId: i === 0 ? promoId : null,
          shipping: "70.00",
          total: i === 0 ? "492.75" : "515.00",
          bostaTrackingNumber: status === "shipped" ? "TRK-555" : null,
          bostaStatus: status === "shipped" ? "In transit" : null,
        })
        .returning();
      orderIds.push(o!.id);
      byStatus[status] = o!.id;
      await db.insert(schema.orderItem).values([
        { orderId: o!.id, productId: productIds[0]!, vendorId: storeOwner, quantity: 1, price: "250.00",
          discountPrice: "195.00", name: "حلق ذهبي Hoop", internalCode: `${TAG}ER002`, selectedOptions: { Colour: "Gold" } },
        { orderId: o!.id, productId: productIds[1]!, vendorId: storeOwner, quantity: 2, price: "125.00", name: "Stud" },
      ]);
      await db.insert(schema.orderLog).values({ orderId: o!.id, action: "created", newStatus: "pending" });
      if (status === "delivered") {
        await db.insert(schema.orderLog).values({
          orderId: o!.id, action: "status_changed", oldStatus: "shipped", newStatus: "delivered", userId: adminSession.id,
        });
      }
    }
    // A Set order and a formula-injection attempt.
    const [setOrder] = await db
      .insert(schema.order)
      .values({ ...base, customerName: `=HYPERLINK("http://evil.test","${TAG}x")`, subtotal: "375.00",
        discount: "75.00", shipping: "0.00", total: "300.00", paymentMethod: "paymob", paymentStatus: "paid",
        paymentTransactionId: "txn-123" })
      .returning();
    orderIds.push(setOrder!.id);
    const [bundle] = await db
      .insert(schema.orderBundle)
      .values({ orderId: setOrder!.id, instanceId: "inst-1", campaignSlug: "pick-your-3", campaignTitle: "Pick Your 3",
        requiredQuantity: 3, regularTotal: "375.00", bundleTotal: "300.00", pricingType: "percentage_discount",
        discountPercent: "20.00", offerStacking: "exclusive" })
      .returning();
    await db.insert(schema.orderItem).values({ orderId: setOrder!.id, productId: productIds[1]!, vendorId: storeOwner,
      quantity: 3, price: "125.00", name: "Stud", orderBundleId: bundle!.id });
    await db.insert(schema.webhookLog).values({ orderId: setOrder!.id, provider: "paymob", webhookType: "payment",
      payload: { secret: "card-data-should-not-leak" }, status: "processed" });
  });

  afterAll(async () => {
    if (!db) return;
    if (orderIds.length) await db.delete(schema.order).where(inArray(schema.order.id, orderIds));
    if (productIds.length) await db.delete(schema.product).where(inArray(schema.product.id, productIds));
    if (promoId) await db.delete(schema.promoCode).where(inArray(schema.promoCode.id, [promoId]));
    await db.delete(schema.category).where(like(schema.category.slug, `${TAG}%`));
    await db.delete(schema.file).where(like(schema.file.diskname, `${TAG}%`));
    await db.delete(schema.user).where(like(schema.user.id, `${TAG}%`));
  });

  it("Export All: every order and status, across batches, matching the database", async () => {
    const before = Number((await db.execute(sql`select count(*)::int as n from "order"`)).rows[0]!.n);
    const { buf, summary } = await exportBuffer({ scope: "all" }, 2);
    const after = Number((await db.execute(sql`select count(*)::int as n from "order"`)).rows[0]!.n);
    const { names, sheets } = await readWorkbook(buf);

    expect(names).toEqual(["Orders", "Order Items", "Sets", "Status History", "Payment & Courier Webhooks", "Export Info"]);
    const orders = sheets.Orders!;
    // Other suites share this database; when nothing changed during the export the count must be exact.
    if (before === after) expect(orders).toHaveLength(before);
    expect(summary.orders).toBe(orders.length);
    const ids = new Set(orders.map((o) => o["Order ID"]));
    for (const id of orderIds) expect(ids.has(id)).toBe(true);
    expect(new Set(orders.map((o) => o["Order ID"])).size).toBe(orders.length); // no duplicates across batches

    const mine = orders.filter((o) => orderIds.includes(String(o["Order ID"])));
    expect(new Set(mine.map((o) => o["Order status"]))).toEqual(
      new Set(["pending", "processing", "shipped", "delivered", "cancelled"]),
    );
    // Newest first, like the dashboard.
    const numbers = orders.map((o) => Number(o["Order number"]));
    expect([...numbers].sort((a, b) => b - a)).toEqual(numbers);

    // Totals equal what is stored.
    const stored = await db.execute(
      sql`select coalesce(sum(total),0)::text as t, coalesce(sum(discount),0)::text as d from "order" where id in ${sql.raw(`(${orderIds.map((id) => `'${id}'`).join(",")})`)}`,
    );
    const sum = (k: string) => Math.round(mine.reduce((s, o) => s + Number(o[k] ?? 0), 0) * 100) / 100;
    expect(sum("Total (EGP)")).toBe(Number(stored.rows[0]!.t));
    expect(sum("Discount (EGP) — Sets + offers + promo code")).toBe(Number(stored.rows[0]!.d));
  });

  it("multi-product orders: one Order Items row per line, linked by order id; Arabic intact", async () => {
    const { buf } = await exportBuffer({ scope: "all" }, 3);
    const { sheets } = await readWorkbook(buf);
    const pendingId = byStatus.pending!;
    const lines = sheets["Order Items"]!.filter((r) => r["Order ID"] === pendingId);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.Line)).toEqual([1, 2]);
    expect(lines[0]!["Product name (as sold)"]).toBe("حلق ذهبي Hoop");
    expect(lines[0]!["Charged unit price before order discounts (EGP)"]).toBe(195);
    expect(lines[0]!["Current unit cost (EGP, not a purchase-time snapshot)"]).toBe(60);
    expect(lines[1]!["Line total before order discounts (EGP)"]).toBe(250);

    const pending = sheets.Orders!.find((o) => o["Order ID"] === pendingId)!;
    expect(pending["Customer name"]).toBe(`${TAG}منى عبد الرحمن`);
    expect(pending["Street address"]).toBe("١٢ شارع التحرير، الدقي");
    expect(pending["Promo code"]).toBe(`${TAG.toUpperCase()}WELCOME5`);
    expect(pending.Units).toBe(3);
    expect(pending["Total (EGP)"]).toBe(492.75);
    expect(pending["Customer phone"]).toBe("+201000000000");

    const shipped = sheets.Orders!.find((o) => o["Order ID"] === byStatus.shipped)!;
    expect(shipped["Shipping provider"]).toBe("Bosta");
    expect(shipped["Tracking number"]).toBe("TRK-555");
    const delivered = sheets.Orders!.find((o) => o["Order ID"] === byStatus.delivered)!;
    expect(typeof delivered["Delivered at (Cairo time, from status history)"]).toBe("number");
    const history = sheets["Status History"]!.filter((r) => r["Order ID"] === byStatus.delivered);
    expect(history.map((h) => h.Event)).toEqual(["created", "status_changed"]);
    expect(history[1]!["Changed by"]).toBe("QA Admin");
  });

  it("Sets, webhook metadata without payload, and formula text stored inert", async () => {
    const { buf } = await exportBuffer({ scope: "all" }, 500);
    const { sheets } = await readWorkbook(buf);
    const setOrderId = orderIds[orderIds.length - 1]!;
    const set = sheets.Sets!.find((r) => r["Order ID"] === setOrderId)!;
    expect(set["Set name"]).toBe("Pick Your 3");
    expect(set["Set savings (EGP)"]).toBe(75);
    expect(sheets["Order Items"]!.find((r) => r["Order ID"] === setOrderId)!["Set name"]).toBe("Pick Your 3");
    const hook = sheets["Payment & Courier Webhooks"]!.find((r) => r["Order ID"] === setOrderId)!;
    expect(hook.Provider).toBe("paymob");
    expect(buf.includes(Buffer.from("card-data-should-not-leak"))).toBe(false);
    const evil = sheets.Orders!.find((o) => o["Order ID"] === setOrderId)!;
    expect(String(evil["Customer name"]).startsWith("'=HYPERLINK")).toBe(true);
    expect(evil["Payment transaction ID"]).toBe("txn-123");
  });

  it("Export Filtered matches order.view for the same filters, and applies the search text", async () => {
    const caller = appRouter.createCaller({ db, clientSession: adminSession, emailService: undefined,
      ipAddress: "127.0.0.1", userAgent: "vitest" } as never);
    const dateFrom = new Date(Date.now() - 3_600_000).toISOString();
    const dateTo = new Date(Date.now() + 3_600_000).toISOString();

    for (const status of ["delivered", "cancelled"] as const) {
      const viewIds: string[] = [];
      for (let offset = 0; ; offset += 100) {
        const res = (await caller.order.view({ limit: 100, offset, status, dateFrom, dateTo })) as {
          success: boolean; result: { items: Array<{ id: string }>; total: number };
        };
        viewIds.push(...res.result.items.map((o) => o.id));
        if (res.result.items.length < 100) break;
      }
      const { buf } = await exportBuffer({ scope: "filtered", status, dateFrom, dateTo }, 2);
      const exported = (await readWorkbook(buf)).sheets.Orders!.map((o) => String(o["Order ID"]));
      expect(new Set(exported)).toEqual(new Set(viewIds));
      expect(exported).toContain(byStatus[status]);
    }

    // Trailing space: matches the "<TAG>Customer <status>" names but not the shared "<TAG>customer@" email.
    const { buf: searched } = await exportBuffer({ scope: "filtered", search: `${TAG}customer ` }, 2);
    const names = (await readWorkbook(searched)).sheets.Orders!.map((o) => String(o["Customer name"]));
    expect(names.sort()).toEqual(
      ["cancelled", "delivered", "processing", "shipped"].map((s) => `${TAG}Customer ${s}`).sort(),
    );
    // Order-number search, "#" optional; item-name search.
    const pendingNumber = (await readWorkbook((await exportBuffer({ scope: "all" })).buf)).sheets.Orders!.find(
      (o) => o["Order ID"] === byStatus.pending,
    )!["Order number"];
    const byNumber = await exportBuffer({ scope: "filtered", search: `#${pendingNumber}` });
    expect((await readWorkbook(byNumber.buf)).sheets.Orders!.map((o) => o["Order ID"])).toContain(byStatus.pending);
    const byItem = await exportBuffer({ scope: "filtered", search: "حلق ذهبي", status: "pending" });
    expect((await readWorkbook(byItem.buf)).sheets.Orders!.map((o) => o["Order ID"])).toContain(byStatus.pending);
    // "scope: all" ignores filters even if sent.
    const all = await exportBuffer({ scope: "all", status: "cancelled", search: "nothing-matches-this" });
    expect(all.summary.orders).toBeGreaterThanOrEqual(orderIds.length);
  });

  it("HTTP route: admin only, JSON only, returns an xlsx, and writes nothing", async () => {
    const Fastify = (await import("fastify")).default;
    const { ordersExportApiPlugin } = await import("../api");
    const app = Fastify();
    app.decorateRequest("clientSession", undefined);
    app.decorateRequest("db", { getter: () => db });
    app.addHook("onRequest", async (req) => {
      const role = req.headers["x-test-role"];
      (req as { clientSession?: unknown }).clientSession = role ? { ...adminSession, role } : undefined;
    });
    await app.register(ordersExportApiPlugin, { prefix: "/api/admin/orders" });

    const post = (role: string | undefined, payload: unknown, contentType = "application/json") =>
      app.inject({
        method: "POST",
        url: "/api/admin/orders/export",
        headers: { "content-type": contentType, ...(role ? { "x-test-role": role } : {}) },
        payload: typeof payload === "string" ? payload : JSON.stringify(payload),
      });

    const before = await fingerprint();
    expect((await post(undefined, { scope: "all" })).statusCode).toBe(403);
    expect((await post("user", { scope: "all" })).statusCode).toBe(403);
    expect((await post("admin", "scope=all", "text/plain")).statusCode).toBe(415);
    expect((await post("admin", { scope: "everything" })).statusCode).toBe(400);
    expect((await post("admin", { scope: "filtered", dateFrom: "not-a-date" })).statusCode).toBe(400);

    const ok = await post("admin", { scope: "all" });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(String(ok.headers["content-disposition"])).toMatch(/^attachment; filename="perce-orders-all-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx"$/);
    expect(ok.headers["cache-control"]).toBe("no-store");
    const { sheets } = await readWorkbook(ok.rawPayload);
    expect(Number(ok.headers["x-export-order-count"])).toBe(sheets.Orders!.length);

    const superadmin = await post("superadmin", { scope: "filtered", status: "cancelled" });
    expect(superadmin.statusCode).toBe(200);

    expect(await fingerprint()).toEqual(before);
    await app.close();
  });
});
