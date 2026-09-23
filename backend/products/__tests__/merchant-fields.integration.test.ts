import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Internal product code and product cost, against a real Postgres.
 *
 * Two separate properties are pinned here:
 *
 *   1. Capture — an admin can store a code and a cost, the code is
 *      normalized and unique, and a blank cost is stored as NULL rather than
 *      as 0. NULL and 0 have to stay distinguishable or the margin reporting
 *      we build later is silently wrong for every product nobody filled in.
 *
 *   2. Confinement — neither value reaches a storefront client. The two
 *      public read paths (`viewProducts` and `getProductById`) select the
 *      WHOLE product row rather than naming columns, so a new column on
 *      `product` is public by default. These tests are what stops that.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("product merchant-only fields (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let createProduct: typeof import("#root/backend/products/create-product/service").createProduct;
  let editProduct: typeof import("#root/backend/products/edit-product/service").editProduct;
  let viewProducts: typeof import("#root/backend/products/view-products/service").viewProducts;
  let getProductById: typeof import("#root/backend/products/get-product-by-id/service").getProductById;
  let searchProducts: typeof import("#root/backend/products/search-products/service").searchProducts;
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "merch-it-";
  let vendorId: string;
  let fileId: string;
  let categoryId: string;

  const adminSession = { role: "admin" } as never;

  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      import("#root/shared/database/drizzle/db").DatabaseClientService
    >,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  /** Minimum viable create payload; callers override what they care about. */
  const baseProduct = (overrides: Record<string, unknown> = {}) => ({
    name: `${TAG}Titanium Labret`,
    description: "a small piece of titanium",
    imageId: fileId,
    categoryId,
    categoryIds: [categoryId],
    price: 450,
    stock: 10,
    hidden: false,
    ...overrides,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    ({ createProduct } = await import(
      "#root/backend/products/create-product/service"
    ));
    ({ editProduct } = await import(
      "#root/backend/products/edit-product/service"
    ));
    ({ viewProducts } = await import(
      "#root/backend/products/view-products/service"
    ));
    ({ getProductById } = await import(
      "#root/backend/products/get-product-by-id/service"
    ));
    ({ searchProducts } = await import(
      "#root/backend/products/search-products/service"
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
        .delete(schema.productImage)
        .where(inArray(schema.productImage.productId, ids));
      await db
        .delete(schema.productVariant)
        .where(inArray(schema.productVariant.productId, ids));
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
    const [cat] = await db
      .insert(schema.category)
      .values({
        name: `${TAG}Ear Piercings`,
        slug: `${TAG}ear`,
        type: "general",
      })
      .returning();
    categoryId = cat!.id;
  });

  afterAll(async () => {
    await cleanup();
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  /** Reads the raw columns, bypassing every serialization layer. */
  const readRow = async (id: string) =>
    (
      await db
        .select({
          internalCode: schema.product.internalCode,
          costPrice: schema.product.costPrice,
          price: schema.product.price,
        })
        .from(schema.product)
        .where(eq(schema.product.id, id))
    )[0];

  // ─── Capture: internal code ───────────────────────────────────────────────

  describe("internal code", () => {
    it("an admin can save one", async () => {
      const created = await run(
        createProduct(baseProduct({ internalCode: "FB001" }), adminSession),
      );
      expect((await readRow(created.id))?.internalCode).toBe("FB001");
    });

    it("trims and upper-cases what the admin typed", async () => {
      const created = await run(
        createProduct(baseProduct({ internalCode: "  fb002  " }), adminSession),
      );
      expect((await readRow(created.id))?.internalCode).toBe("FB002");
    });

    it("stores NULL, not an empty string, when left blank", async () => {
      // An empty string would occupy the unique index and stop the NEXT
      // product from being saved blank.
      const a = await run(createProduct(baseProduct({}), adminSession));
      const b = await run(
        createProduct(
          baseProduct({ name: `${TAG}Second`, internalCode: "   " }),
          adminSession,
        ),
      );
      expect((await readRow(a.id))?.internalCode).toBeNull();
      expect((await readRow(b.id))?.internalCode).toBeNull();
    });

    it("rejects a duplicate non-empty code with a clear admin message", async () => {
      await run(
        createProduct(baseProduct({ internalCode: "ER001" }), adminSession),
      );

      const result = await Effect.runPromise(
        createProduct(
          baseProduct({ name: `${TAG}Clash`, internalCode: "ER001" }),
          adminSession,
        )
          .pipe(provideDatabase({ db: db as never }))
          .pipe(Effect.either),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        const err = result.left as { clientMessage?: string };
        expect(err.clientMessage).toMatch(/ER001/);
        expect(err.clientMessage).toMatch(/already used/i);
      }
    });

    it("rejects a duplicate that differs only in case or whitespace", async () => {
      await run(
        createProduct(baseProduct({ internalCode: "FB010" }), adminSession),
      );

      const result = await Effect.runPromise(
        createProduct(
          baseProduct({ name: `${TAG}Clash`, internalCode: " fb010 " }),
          adminSession,
        )
          .pipe(provideDatabase({ db: db as never }))
          .pipe(Effect.either),
      );

      expect(result._tag).toBe("Left");
    });

    it("lets a product keep its own code when re-saved", async () => {
      const created = await run(
        createProduct(baseProduct({ internalCode: "FB020" }), adminSession),
      );

      await run(
        editProduct(
          {
            id: created.id,
            name: `${TAG}Renamed`,
            description: "still titanium",
            imageId: fileId,
            categoryId,
            categoryIds: [categoryId],
            price: 460,
            stock: 9,
            hidden: false,
            internalCode: "FB020",
          } as never,
          adminSession,
        ),
      );

      expect((await readRow(created.id))?.internalCode).toBe("FB020");
    });

    it("can be cleared back to NULL from the edit form", async () => {
      const created = await run(
        createProduct(baseProduct({ internalCode: "FB030" }), adminSession),
      );

      await run(
        editProduct(
          {
            id: created.id,
            name: `${TAG}Titanium Labret`,
            description: "still titanium",
            imageId: fileId,
            categoryId,
            categoryIds: [categoryId],
            price: 450,
            stock: 10,
            hidden: false,
            internalCode: "",
          } as never,
          adminSession,
        ),
      );

      expect((await readRow(created.id))?.internalCode).toBeNull();
    });

    it("is left alone by a client that does not send the field", async () => {
      const created = await run(
        createProduct(baseProduct({ internalCode: "FB040" }), adminSession),
      );

      await run(
        editProduct(
          {
            id: created.id,
            name: `${TAG}Titanium Labret`,
            description: "still titanium",
            imageId: fileId,
            categoryId,
            categoryIds: [categoryId],
            price: 450,
            stock: 10,
            hidden: false,
          } as never,
          adminSession,
        ),
      );

      expect((await readRow(created.id))?.internalCode).toBe("FB040");
    });
  });

  // ─── Capture: cost ────────────────────────────────────────────────────────

  describe("product cost", () => {
    it("an admin can save one", async () => {
      const created = await run(
        createProduct(baseProduct({ costPrice: 120 }), adminSession),
      );
      expect((await readRow(created.id))?.costPrice).toBe("120.00");
    });

    it("preserves the decimal places the admin typed", async () => {
      const created = await run(
        createProduct(baseProduct({ costPrice: 1234.56 }), adminSession),
      );
      const row = await readRow(created.id);
      expect(row?.costPrice).toBe("1234.56");
      expect(Number(row?.costPrice)).toBeCloseTo(1234.56, 2);
    });

    it("rejects a negative cost", async () => {
      const { createProductSchema } = await import(
        "#root/backend/products/create-product/service"
      );
      const parsed = createProductSchema.safeParse(
        baseProduct({ costPrice: -5 }),
      );
      expect(parsed.success).toBe(false);
    });

    it("stays NULL when blank — it is NOT defaulted to 0", async () => {
      // 0 means "this genuinely costs nothing". Defaulting a blank field to 0
      // would make every unfilled product look like pure margin later.
      const created = await run(createProduct(baseProduct({}), adminSession));
      const row = await readRow(created.id);
      expect(row?.costPrice).toBeNull();
      expect(row?.costPrice).not.toBe("0.00");
    });

    it("keeps an explicit zero cost distinct from a blank one", async () => {
      const zero = await run(
        createProduct(
          baseProduct({ name: `${TAG}Free gift`, costPrice: 0 }),
          adminSession,
        ),
      );
      const blank = await run(
        createProduct(baseProduct({ name: `${TAG}Unknown` }), adminSession),
      );
      expect((await readRow(zero.id))?.costPrice).toBe("0.00");
      expect((await readRow(blank.id))?.costPrice).toBeNull();
    });

    it("can be cleared back to NULL from the edit form", async () => {
      const created = await run(
        createProduct(baseProduct({ costPrice: 99.99 }), adminSession),
      );

      await run(
        editProduct(
          {
            id: created.id,
            name: `${TAG}Titanium Labret`,
            description: "still titanium",
            imageId: fileId,
            categoryId,
            categoryIds: [categoryId],
            price: 450,
            stock: 10,
            hidden: false,
            costPrice: null,
          } as never,
          adminSession,
        ),
      );

      expect((await readRow(created.id))?.costPrice).toBeNull();
    });
  });

  // ─── Existing rows ────────────────────────────────────────────────────────

  describe("products predating the migration", () => {
    it("read, list and edit normally with both fields NULL", async () => {
      // Inserted straight into the table with neither column set — exactly
      // what every existing product looks like after the additive migration.
      const [legacy] = await db
        .insert(schema.product)
        .values({
          name: `${TAG}Legacy Hoop`,
          slug: `${TAG}legacy-hoop`,
          description: "created before the migration",
          imageId: fileId,
          categoryId,
          price: "300.00",
          vendorId,
          stock: 4,
        })
        .returning();

      const row = await readRow(legacy!.id);
      expect(row?.internalCode).toBeNull();
      expect(row?.costPrice).toBeNull();

      // Still listed...
      const listed = await run(
        viewProducts({ limit: 50, includeHidden: true }, {
          includeMerchantFields: true,
        }),
      );
      expect(
        listed.products.some((p) => p.product.id === legacy!.id),
      ).toBe(true);

      // ...still readable on the storefront...
      const fetched = await run(
        getProductById({ productId: `${TAG}legacy-hoop` }),
      );
      expect(fetched.id).toBe(legacy!.id);

      // ...and still editable, with the price untouched.
      await run(
        editProduct(
          {
            id: legacy!.id,
            name: `${TAG}Legacy Hoop`,
            description: "edited after the migration",
            imageId: fileId,
            categoryId,
            categoryIds: [categoryId],
            price: 300,
            stock: 4,
            hidden: false,
          } as never,
          adminSession,
        ),
      );

      const after = await readRow(legacy!.id);
      expect(after?.internalCode).toBeNull();
      expect(after?.costPrice).toBeNull();
      expect(after?.price).toBe("300.00");
    });
  });

  // ─── Admin visibility ─────────────────────────────────────────────────────

  describe("admin access", () => {
    it("gets both fields back from the product list", async () => {
      const created = await run(
        createProduct(
          baseProduct({ internalCode: "FB050", costPrice: 150.25 }),
          adminSession,
        ),
      );

      const listed = await run(
        viewProducts({ limit: 50, includeHidden: true }, {
          includeMerchantFields: true,
        }),
      );
      const row = listed.products.find((p) => p.product.id === created.id);

      expect(row?.product.internalCode).toBe("FB050");
      expect(row?.product.costPrice).toBe("150.25");
    });

    it("can find a product by its internal code", async () => {
      const created = await run(
        createProduct(baseProduct({ internalCode: "FB060" }), adminSession),
      );

      const found = await run(
        viewProducts({ search: "FB060", limit: 50, includeHidden: true }, {
          includeMerchantFields: true,
        }),
      );

      expect(found.products.map((p) => p.product.id)).toContain(created.id);
      expect(found.totalCount).toBeGreaterThan(0);
    });

    it("can find it by a lowercase search for the same code", async () => {
      const created = await run(
        createProduct(baseProduct({ internalCode: "FB070" }), adminSession),
      );

      const found = await run(
        viewProducts({ search: "fb070", limit: 50, includeHidden: true }, {
          includeMerchantFields: true,
        }),
      );

      expect(found.products.map((p) => p.product.id)).toContain(created.id);
    });
  });

  // ─── Confinement: nothing merchant-only reaches a storefront client ───────

  describe("public storefront payloads", () => {
    const SECRETS = ["FB100", "777.77"];

    /** Asserts a payload carries neither the keys nor the values. */
    const expectNoLeak = (payload: unknown) => {
      const json = JSON.stringify(payload);
      expect(json).not.toContain("internalCode");
      expect(json).not.toContain("internal_code");
      expect(json).not.toContain("costPrice");
      expect(json).not.toContain("cost_price");
      for (const secret of SECRETS) {
        expect(json).not.toContain(secret);
      }
    };

    let productId: string;

    beforeEach(async () => {
      const created = await run(
        createProduct(
          baseProduct({
            name: `${TAG}Public Piece`,
            internalCode: "FB100",
            costPrice: 777.77,
          }),
          adminSession,
        ),
      );
      productId = created.id;
    });

    it("the product detail payload exposes neither field", async () => {
      // This is what backs the storefront product page and its SSR payload.
      const detail = await run(getProductById({ productId }));
      expect(detail.id).toBe(productId);
      expect(detail.name).toContain("Public Piece");
      expect(detail).not.toHaveProperty("internalCode");
      expect(detail).not.toHaveProperty("costPrice");
      expectNoLeak(detail);
    });

    it("the public product list exposes neither field", async () => {
      // No options argument at all — the default a public caller gets.
      const listed = await run(viewProducts({ limit: 50, includeHidden: false }));
      const row = listed.products.find((p) => p.product.id === productId);
      expect(row).toBeDefined();
      expect(row?.product).not.toHaveProperty("internalCode");
      expect(row?.product).not.toHaveProperty("costPrice");
      expectNoLeak(listed);
    });

    it("an explicit non-admin call exposes neither field", async () => {
      const listed = await run(
        viewProducts({ limit: 50, includeHidden: false }, { includeMerchantFields: false }),
      );
      expectNoLeak(listed);
    });

    it("the search/category payload exposes neither field", async () => {
      const results = await run(
        searchProducts({
          limit: 50,
          offset: 0,
          includeOutOfStock: true,
        } as never),
      );
      expectNoLeak(results);
    });

    it("a category-filtered public listing exposes neither field", async () => {
      const listed = await run(viewProducts({ categoryId, limit: 50, includeHidden: false }));
      expect(listed.products.length).toBeGreaterThan(0);
      expectNoLeak(listed);
    });

    it("a public search cannot probe for an internal code", async () => {
      // The code column is matched only when merchant fields are readable.
      // Otherwise a storefront client could confirm a code exists one guess
      // at a time without ever seeing one.
      const found = await run(viewProducts({ search: "FB100", limit: 50, includeHidden: false }));
      expect(found.products.map((p) => p.product.id)).not.toContain(productId);
      expect(found.totalCount).toBe(0);
    });

    it("leaves the selling price untouched by the cost", async () => {
      // Data capture only: cost must not feed any customer-facing figure.
      const detail = await run(getProductById({ productId }));
      expect(detail.price).toBe(450);
      expect(detail.discountPrice).toBeNull();

      const listed = await run(viewProducts({ limit: 50, includeHidden: false }));
      const row = listed.products.find((p) => p.product.id === productId);
      expect(row?.product.price).toBe("450.00");
    });
  });
});
