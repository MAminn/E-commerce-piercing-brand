import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like, sql } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Catalogue counts, against a real Postgres.
 *
 * Production reported three different sizes for one catalogue: /search said
 * 119 results for "crystal", the Ear Piercings category said 97 products, and
 * the admin dashboard said 60 products in total. The property these tests pin
 * is the one that makes all three agree:
 *
 *   every count and every pagination total is a count of DISTINCT products,
 *   over the same membership rules as the list it sits above.
 *
 * Two failure modes are covered:
 *
 *   1. Inflation — a product filed into several categories, or carrying
 *      several junction rows for the SAME category, being counted once per
 *      row because the count was taken over a join. Each test seeds exactly
 *      that shape and asserts the count still equals the number of products.
 *
 *   2. Omission — the dashboard's `innerJoin(category)` plus
 *      `category.deleted = false`, which made every product whose category
 *      had been soft-deleted vanish from the admin list and from its total
 *      while the storefront went on listing and counting it. That is the
 *      shape that produced "60 in the dashboard, 119 on the storefront".
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("catalogue counts (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let searchProducts: typeof import("#root/backend/products/search-products/service").searchProducts;
  let viewProducts: typeof import("#root/backend/products/view-products/service").viewProducts;
  let viewCategories: typeof import("#root/backend/categories/view-categories/service").viewCategories;
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "counts-it-";
  const MATCH = "Crystalcounts";
  const PRODUCT_COUNT = 5;

  let vendorId: string;
  let fileId: string;
  let earCategoryId: string;
  let noseCategoryId: string;
  let productIds: string[] = [];

  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      import("#root/shared/database/drizzle/db").DatabaseClientService
    >,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    ({ searchProducts } = await import(
      "#root/backend/products/search-products/service"
    ));
    ({ viewProducts } = await import(
      "#root/backend/products/view-products/service"
    ));
    ({ viewCategories } = await import(
      "#root/backend/categories/view-categories/service"
    ));
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    const storeOwner = (
      await import("#root/shared/config/store")
    ).getStoreOwnerId();
    await db
      .insert(schema.vendor)
      .values({ id: storeOwner, name: `${TAG}store`, status: "active" })
      .onConflictDoNothing();
    vendorId = storeOwner;

    const [f] = await db
      .insert(schema.file)
      .values({ diskname: `${TAG}img.webp` })
      .returning();
    fileId = f!.id;
  });

  const cleanup = async () => {
    const ids = (
      await db
        .select({ id: schema.product.id })
        .from(schema.product)
        .where(like(schema.product.name, `${TAG}%`))
    ).map((r) => r.id);
    if (ids.length > 0) {
      await db
        .delete(schema.productCategory)
        .where(inArray(schema.productCategory.productId, ids));
      await db.delete(schema.product).where(inArray(schema.product.id, ids));
    }
    await db
      .delete(schema.category)
      .where(like(schema.category.slug, `${TAG}%`));
  };

  beforeEach(async () => {
    await cleanup();

    const [ear] = await db
      .insert(schema.category)
      .values({
        name: `${TAG}Ear Piercings`,
        slug: `${TAG}ear`,
        type: "general",
      })
      .returning();
    earCategoryId = ear!.id;

    const [nose] = await db
      .insert(schema.category)
      .values({ name: `${TAG}Nose`, slug: `${TAG}nose`, type: "general" })
      .returning();
    noseCategoryId = nose!.id;

    const rows = await db
      .insert(schema.product)
      .values(
        Array.from({ length: PRODUCT_COUNT }, (_, i) => ({
          name: `${TAG}${MATCH} stud ${i}`,
          slug: `${TAG}${MATCH.toLowerCase()}-stud-${i}`,
          description: "a piece",
          imageId: fileId,
          categoryId: earCategoryId,
          price: "100.00",
          vendorId,
          stock: 10,
        })),
      )
      .returning({ id: schema.product.id });
    productIds = rows.map((r) => r.id);

    // The production shape: every product is filed into BOTH categories
    // through the junction table, on top of its direct `category_id` FK. A
    // count taken over a join to `product_category` would report double.
    await db.insert(schema.productCategory).values(
      productIds.flatMap((productId) => [
        { productId, categoryId: earCategoryId, isPrimary: true },
        { productId, categoryId: noseCategoryId, isPrimary: false },
      ]),
    );
  });

  afterAll(async () => {
    await cleanup();
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  // ─── Storefront search ────────────────────────────────────────────────────

  describe("searchProducts — text search", () => {
    it("counts each matching product once, not once per category", async () => {
      const res = await run(
        searchProducts({
          search: MATCH,
          limit: 100,
          offset: 0,
          includeOutOfStock: true,
        }),
      );
      expect(res.total).toBe(PRODUCT_COUNT);
      expect(res.items).toHaveLength(PRODUCT_COUNT);
      expect(new Set(res.items.map((i) => i.id)).size).toBe(PRODUCT_COUNT);
    });

    it("keeps the paginated total equal to the number of distinct products", async () => {
      const pageSize = 2;
      const seen = new Set<string>();
      let total = 0;

      for (let page = 0; page * pageSize < PRODUCT_COUNT + pageSize; page++) {
        const res = await run(
          searchProducts({
            search: MATCH,
            limit: pageSize,
            offset: page * pageSize,
            includeOutOfStock: true,
            sortBy: "newest",
          }),
        );
        total = res.total;
        for (const item of res.items) seen.add(item.id);
      }

      // Walking every page must surface exactly `total` distinct products —
      // the check that catches a total inflated past what pagination can
      // actually reach (an empty last page, "119 results" over 60 products).
      expect(total).toBe(PRODUCT_COUNT);
      expect(seen.size).toBe(total);
    });

    it("is not inflated by duplicate junction rows for the same category", async () => {
      // `product_category_unique` prevents this going forward; older rows
      // predate it, and the count must not depend on that index existing.
      await db.execute(sql`drop index if exists product_category_unique`);
      try {
        await db.insert(schema.productCategory).values(
          productIds.map((productId) => ({
            productId,
            categoryId: earCategoryId,
            isPrimary: false,
          })),
        );

        const res = await run(
          searchProducts({
            search: MATCH,
            limit: 100,
            offset: 0,
            includeOutOfStock: true,
          }),
        );
        expect(res.total).toBe(PRODUCT_COUNT);

        const byCategory = await run(
          searchProducts({
            categoryIds: [earCategoryId],
            limit: 100,
            offset: 0,
            includeOutOfStock: true,
          }),
        );
        expect(byCategory.total).toBe(PRODUCT_COUNT);
        expect(byCategory.items).toHaveLength(PRODUCT_COUNT);
      } finally {
        // Put the index back, or every later test file inherits a database
        // without it. Any duplicate row — this test's, or one left behind by
        // a previous crashed run — has to go first, keeping one row per
        // (product, category) pair exactly as a real backfill would.
        await db.execute(sql`
          delete from product_category a
          using product_category b
          where a.product_id = b.product_id
            and a.category_id = b.category_id
            and a.id > b.id
        `);
        await db.execute(
          sql`create unique index if not exists product_category_unique on product_category (product_id, category_id)`,
        );
      }
    });
  });

  // ─── Storefront category browsing ─────────────────────────────────────────

  describe("searchProducts — category filter", () => {
    it("counts a product once however many categories it is filed into", async () => {
      const ear = await run(
        searchProducts({
          categoryIds: [earCategoryId],
          limit: 100,
          offset: 0,
          includeOutOfStock: true,
        }),
      );
      expect(ear.total).toBe(PRODUCT_COUNT);
      expect(ear.items).toHaveLength(PRODUCT_COUNT);

      // Same products, reached through the junction table only.
      const nose = await run(
        searchProducts({
          categoryIds: [noseCategoryId],
          limit: 100,
          offset: 0,
          includeOutOfStock: true,
        }),
      );
      expect(nose.total).toBe(PRODUCT_COUNT);
    });

    it("does not add the two categories together when both are requested", async () => {
      const both = await run(
        searchProducts({
          categoryIds: [earCategoryId, noseCategoryId],
          limit: 100,
          offset: 0,
          includeOutOfStock: true,
        }),
      );
      expect(both.total).toBe(PRODUCT_COUNT);
      expect(both.items).toHaveLength(PRODUCT_COUNT);
    });
  });

  // ─── Category badge counts ────────────────────────────────────────────────

  describe("viewCategories productCount", () => {
    const countFor = async (id: string) => {
      const cats = await run(viewCategories());
      return Number(cats.find((c) => c.id === id)?.productCount ?? -1);
    };

    it("counts products reached through the junction table", async () => {
      // The Nose category holds these products ONLY via `product_category`.
      // The old FK-only count reported 0 for it.
      expect(await countFor(noseCategoryId)).toBe(PRODUCT_COUNT);
    });

    it("counts a product once when it is both FK-linked and junction-linked", async () => {
      expect(await countFor(earCategoryId)).toBe(PRODUCT_COUNT);
    });

    it("excludes soft-deleted products, as the category page does", async () => {
      await db
        .update(schema.product)
        .set({ deleted: true })
        .where(eq(schema.product.id, productIds[0]!));
      expect(await countFor(earCategoryId)).toBe(PRODUCT_COUNT - 1);
    });

    it("excludes hidden products, as the category page does", async () => {
      await db
        .update(schema.product)
        .set({ hidden: true })
        .where(eq(schema.product.id, productIds[0]!));
      expect(await countFor(earCategoryId)).toBe(PRODUCT_COUNT - 1);

      const listed = await run(
        searchProducts({
          categoryIds: [earCategoryId],
          limit: 100,
          offset: 0,
          includeOutOfStock: true,
        }),
      );
      // The badge and the list it labels must agree.
      expect(listed.total).toBe(PRODUCT_COUNT - 1);
    });
  });

  // ─── Admin list ───────────────────────────────────────────────────────────

  describe("viewProducts", () => {
    const adminCount = async (search: string) =>
      run(
        viewProducts({ limit: 100, offset: 0, search, includeHidden: true }),
      );

    it("counts each product once despite its multiple category rows", async () => {
      const res = await adminCount(`${TAG}${MATCH}`);
      expect(res.totalCount).toBe(PRODUCT_COUNT);
      expect(res.products).toHaveLength(PRODUCT_COUNT);
    });

    it("still lists and counts a product whose category was soft-deleted", async () => {
      // THE dashboard/storefront divergence. The inner join plus
      // `category.deleted = false` dropped every one of these rows.
      await db
        .update(schema.category)
        .set({ deleted: true })
        .where(eq(schema.category.id, earCategoryId));

      const admin = await adminCount(`${TAG}${MATCH}`);
      expect(admin.totalCount).toBe(PRODUCT_COUNT);
      expect(admin.products).toHaveLength(PRODUCT_COUNT);

      const storefront = await run(
        searchProducts({
          search: MATCH,
          limit: 100,
          offset: 0,
          includeOutOfStock: true,
        }),
      );
      // The two sides now report the same catalogue.
      expect(admin.totalCount).toBe(storefront.total);
    });

    it("matches products filed into a category by the FK only", async () => {
      // Junction row removed; the direct FK still points at Ear Piercings.
      await db
        .delete(schema.productCategory)
        .where(eq(schema.productCategory.categoryId, earCategoryId));

      const res = await run(
        viewProducts({
          limit: 100,
          offset: 0,
          categoryId: earCategoryId,
          includeHidden: true,
        }),
      );
      expect(res.totalCount).toBe(PRODUCT_COUNT);
      expect(res.products).toHaveLength(PRODUCT_COUNT);
    });

    it("counts a category filter once per product, not once per junction row", async () => {
      const res = await run(
        viewProducts({
          limit: 100,
          offset: 0,
          categoryId: earCategoryId,
          includeHidden: true,
        }),
      );
      expect(res.totalCount).toBe(PRODUCT_COUNT);
      expect(new Set(res.products.map((p) => p.product.id)).size).toBe(
        PRODUCT_COUNT,
      );
    });

    it("keeps its pagination total reachable page by page", async () => {
      const pageSize = 2;
      const seen = new Set<string>();
      let total = 0;
      for (let page = 0; page * pageSize < PRODUCT_COUNT + pageSize; page++) {
        const res = await run(
          viewProducts({
            limit: pageSize,
            offset: page * pageSize,
            search: `${TAG}${MATCH}`,
            includeHidden: true,
            sortBy: "name",
          }),
        );
        total = res.totalCount;
        for (const row of res.products) seen.add(row.product.id);
      }
      expect(total).toBe(PRODUCT_COUNT);
      expect(seen.size).toBe(total);
    });
  });
});
