import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, like } from "drizzle-orm";
import { orderSearchCondition } from "../filters";
import { readWorkbook } from "../../export-orders/__tests__/read-workbook";

/**
 * Orders dashboard search by customer name, against a real Postgres.
 *
 * The search runs in the database (order.view `search`), so it must find
 * matching orders on EVERY page, not only the page that is loaded:
 *
 *   • first name, last name, full name, partial text
 *   • English (case-insensitive) and Arabic names
 *   • leading/trailing spaces ignored; repeated inner spaces count as one
 *   • combined with the status, date and payment-issue filters
 *   • `total` / `totalSales` / pagination describe the matching orders only,
 *     pages never overlap or skip, newest first
 *   • "Export filtered orders" with the same search returns the same orders
 *   • a signed-in customer's search never reaches other people's orders
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
type Status = (typeof STATUSES)[number];

/**
 * Eight name shapes, repeated. Invented names so nothing else in a shared
 * test database matches the searches below.
 */
const NAME_SHAPES = [
  "Zumorroda Elqalyoubi",
  "زمردة القليوبي",
  "  ZUMORRODA   ELQALYOUBI ", // stored with stray spaces and in capitals
  "Hany Fathy", // noise: matches none of the searches
  "zumorroda Fathy", // same first name, different last name
  "Hala Elqalyoubi", // same last name, different first name
  "زمردة  القليوبي", // Arabic with a double space
  "سارة القليوبي", // same Arabic last name, different first name
];
const ORDER_COUNT = 96; // 12 of each shape
const PAGE_SIZE = 20; // the dashboard's page size

type Seeded = {
  id: string;
  name: string;
  status: Status;
  createdAt: Date;
  total: number;
  paymentIssue: boolean;
};

/** What a correct search must return, computed independently of the SQL. */
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

describeIfDb("Orders dashboard search by customer name (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let exportSvc: typeof import("../../export-orders/service");
  let appRouter: typeof import("#root/shared/trpc/router").appRouter;

  const TAG = "ordsearch-it-";
  const seeded: Seeded[] = [];
  const now = Date.now();

  const session = (role: "admin" | "user", id: string) => ({
    id,
    token: "hashed",
    email: `${id}@example.test`,
    name: id,
    phone: "",
    expiresAt: new Date(now + 3_600_000),
    role,
    emailVerified: true,
    profilePicture: null,
  });
  const admin = session("admin", `${TAG}admin`);
  const shopper = session("user", `${TAG}shopper`);

  type ViewInput = {
    search?: string;
    status?: Status;
    dateFrom?: string;
    dateTo?: string;
    paymentIssueOnly?: boolean;
  };
  type ViewResult = {
    success: boolean;
    result: { items: Array<{ id: string; customerName: string }>; total: number; totalSales?: number };
  };

  const view = async (who: typeof admin, input: ViewInput & { limit: number; offset: number }) => {
    const caller = appRouter.createCaller({ db, clientSession: who, emailService: undefined,
      ipAddress: "127.0.0.1", userAgent: "vitest" } as never);
    const res = (await caller.order.view(input)) as ViewResult;
    expect(res.success).toBe(true);
    return res.result;
  };

  /**
   * Walks the dashboard's pages exactly as the admin would (page 1, 2, …)
   * and checks that every page reports the same total, that the page count
   * is ceil(total / page size), and that no order appears twice.
   */
  const allPages = async (input: ViewInput, who = admin, pageSize = PAGE_SIZE) => {
    const ids: string[] = [];
    const pageLengths: number[] = [];
    let total = -1;
    let totalSales = -1;
    for (let offset = 0; ; offset += pageSize) {
      const page = await view(who, { ...input, limit: pageSize, offset });
      if (total === -1) {
        total = page.total;
        totalSales = page.totalSales ?? 0;
      }
      expect(page.total).toBe(total);
      if (page.items.length === 0) break;
      pageLengths.push(page.items.length);
      ids.push(...page.items.map((o) => o.id));
      if (offset + pageSize >= total) break;
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(total);
    expect(pageLengths.length).toBe(Math.ceil(total / pageSize));
    return { ids, total, totalSales, pages: pageLengths.length };
  };

  /** Seeded orders matching `query` (+ filters), newest first — the dashboard's order. */
  const expected = (query: string, f: (o: Seeded) => boolean = () => true) =>
    seeded
      .filter((o) => norm(o.name).includes(norm(query)) && f(o))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const ids = (orders: Seeded[]) => orders.map((o) => o.id);
  const money = (orders: Seeded[]) => Math.round(orders.reduce((s, o) => s + o.total, 0) * 100) / 100;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    exportSvc = await import("../../export-orders/service");
    ({ appRouter } = await import("#root/shared/trpc/router"));

    await db.insert(schema.user).values([
      { id: admin.id, email: admin.email, name: "QA Admin", role: "admin" },
      { id: shopper.id, email: shopper.email, name: "QA Shopper", role: "user" },
    ]);

    const rows = Array.from({ length: ORDER_COUNT }, (_, i) => {
      const name = NAME_SHAPES[i % NAME_SHAPES.length]!;
      const status = STATUSES[i % STATUSES.length]!;
      // One order a minute, newest first, so matching orders are spread over every dashboard page.
      const createdAt = new Date(now - i * 60_000);
      const paymentIssue = i % 3 === 0;
      const total = 100 + i;
      return {
        customerName: name,
        customerEmail: `${TAG}${i}@example.test`,
        customerPhone: "+201000000000",
        shippingAddress: "12 Street",
        shippingCity: "Nasr City",
        shippingState: "Cairo",
        shippingPostalCode: "",
        shippingCountry: "EG",
        subtotal: String(total),
        shipping: "0",
        tax: "0",
        total: String(total),
        status,
        createdAt,
        updatedAt: createdAt,
        // The two orders of the signed-in shopper: one name match, one noise.
        userId: i === 0 || i === 3 ? shopper.id : null,
        ...(paymentIssue
          ? { paymentMethod: "paymob" as const, paymentStatus: "pending" as const, bostaSyncStatus: "sent" }
          : { paymentMethod: "cod" as const }),
      };
    });
    const inserted = await db.insert(schema.order).values(rows).returning({ id: schema.order.id });
    inserted.forEach((r, i) => {
      seeded.push({
        id: r.id,
        name: rows[i]!.customerName,
        status: rows[i]!.status,
        createdAt: rows[i]!.createdAt,
        total: Number(rows[i]!.total),
        paymentIssue: i % 3 === 0,
      });
    });
  });

  afterAll(async () => {
    if (!db) return;
    if (seeded.length) await db.delete(schema.order).where(inArray(schema.order.id, seeded.map((o) => o.id)));
    await db.delete(schema.user).where(like(schema.user.id, `${TAG}%`));
  });

  it("full English name: every match across all pages, newest first, with matching total and sales", async () => {
    const want = expected("Zumorroda Elqalyoubi");
    expect(want).toHaveLength(24); // more than one dashboard page
    const got = await allPages({ search: "Zumorroda Elqalyoubi" });
    expect(got.pages).toBe(2);
    expect(got.ids).toEqual(ids(want));
    expect(got.total).toBe(24);
    expect(got.totalSales).toBe(money(want));
    // The second page is not the "current page" — its orders are found too.
    const page2 = await view(admin, { search: "Zumorroda Elqalyoubi", limit: PAGE_SIZE, offset: PAGE_SIZE });
    expect(page2.items.map((o) => o.id)).toEqual(ids(want).slice(PAGE_SIZE));
  });

  it("first name only, last name only, and partial text", async () => {
    for (const [query, count] of [
      ["Zumorroda", 36],
      ["Elqalyoubi", 36],
      ["orrod", 36],
      ["qalyou", 36],
      ["roda elq", 24], // partial across the first/last boundary
      ["Hala", 12],
    ] as const) {
      const want = expected(query);
      expect(want).toHaveLength(count);
      const got = await allPages({ search: query });
      expect(got.ids, query).toEqual(ids(want));
    }
  });

  it("English names are case-insensitive", async () => {
    const want = ids(expected("zumorroda elqalyoubi"));
    for (const query of ["zumorroda elqalyoubi", "ZUMORRODA ELQALYOUBI", "zUmOrRoDa ElQaLyOuBi"]) {
      expect((await allPages({ search: query })).ids, query).toEqual(want);
    }
  });

  it("Arabic names: full, first, last and partial, across pages", async () => {
    for (const [query, count] of [
      ["زمردة القليوبي", 24],
      ["زمردة", 24],
      ["القليوبي", 36],
      ["قليوب", 36],
      ["سارة", 12],
    ] as const) {
      const want = expected(query);
      expect(want).toHaveLength(count);
      const got = await allPages({ search: query }, admin, 10);
      expect(got.ids, query).toEqual(ids(want));
      expect(got.pages).toBe(Math.ceil(count / 10));
    }
  });

  it("ignores leading and trailing spaces, and repeated spaces inside a name", async () => {
    const want = ids(expected("Zumorroda Elqalyoubi"));
    for (const query of ["   Zumorroda Elqalyoubi  ", "\tZumorroda Elqalyoubi\n", "Zumorroda    Elqalyoubi"]) {
      expect((await allPages({ search: query })).ids, JSON.stringify(query)).toEqual(want);
    }
    expect((await allPages({ search: "  زمردة القليوبي " })).ids).toEqual(ids(expected("زمردة القليوبي")));
    // An all-space search is no search at all.
    expect(orderSearchCondition("   ")).toBeUndefined();
    expect(orderSearchCondition("")).toBeUndefined();
  });

  it("combines with the status, date and payment-issue filters", async () => {
    const dateFrom = new Date(now - 40.5 * 60_000).toISOString(); // the 41 newest seeded orders
    const dateTo = new Date(now + 60_000).toISOString();
    const inWindow = (o: Seeded) => o.createdAt.getTime() >= Date.parse(dateFrom) && o.createdAt.getTime() < Date.parse(dateTo);

    const cases: Array<[ViewInput, (o: Seeded) => boolean]> = [
      [{ search: "Elqalyoubi", status: "delivered" }, (o) => o.status === "delivered"],
      [{ search: "Elqalyoubi", dateFrom, dateTo }, inWindow],
      [{ search: "Elqalyoubi", paymentIssueOnly: true }, (o) => o.paymentIssue],
      [{ search: "القليوبي", status: "pending", paymentIssueOnly: true }, (o) => o.status === "pending" && o.paymentIssue],
      [
        { search: " zumorroda ", status: "shipped", dateFrom, dateTo, paymentIssueOnly: true },
        (o) => o.status === "shipped" && inWindow(o) && o.paymentIssue,
      ],
    ];
    for (const [input, filter] of cases) {
      const want = expected(input.search!, filter);
      expect(want.length, JSON.stringify(input)).toBeGreaterThan(0);
      const got = await allPages(input, admin, 3); // small pages: the filtered results still span several
      expect(got.ids, JSON.stringify(input)).toEqual(ids(want));
      expect(got.totalSales).toBe(money(want));
    }
  });

  it("Export filtered orders returns exactly the searched orders, from every page", async () => {
    for (const input of [
      { search: "  zumorroda ELQALYOUBI " },
      { search: "القليوبي", paymentIssueOnly: true },
      { search: "Elqalyoubi", status: "delivered" as const },
    ]) {
      const view = await allPages(input);
      const { workbook, summary } = await exportSvc.buildOrdersWorkbook(
        db as never,
        { scope: "filtered", ...input },
        { generatedBy: "QA", batchSize: 7 },
      );
      let buf: Buffer;
      try {
        buf = await workbook.toBuffer();
      } finally {
        await workbook.dispose();
      }
      const exported = (await readWorkbook(buf)).sheets.Orders!.map((o) => String(o["Order ID"]));
      // Same orders. (The export lists by order number, the dashboard by placement time — the
      // same sequence in real data, but this seed backdates orders, so compare as sets.)
      expect(exported).toHaveLength(view.ids.length);
      expect(new Set(exported), JSON.stringify(input)).toEqual(new Set(view.ids));
      expect(summary.orders).toBe(view.total);
      expect(summary.total).toBe(view.totalSales);
    }
  });

  it("a signed-in customer's search only covers their own orders", async () => {
    const got = await allPages({ search: "Zumorroda" }, shopper);
    expect(got.ids).toEqual([seeded[0]!.id]);
    expect((await allPages({ search: "Hany" }, shopper)).ids).toEqual([seeded[3]!.id]);
    expect((await allPages({ search: "Hala" }, shopper)).ids).toEqual([]);
  });
});
