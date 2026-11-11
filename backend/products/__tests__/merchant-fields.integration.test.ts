import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like, sql } from "drizzle-orm";
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

  // ─── Internal code: a product keeps its own code through the admin API ───
  //
  // These go through the real `product.create` / `product.edit` tRPC
  // procedures with the payload the dashboard form actually sends (images,
  // variants, categories, every merchant field on every save), not a trimmed
  // service call — so they pin what an admin sees, including the
  // `{ success: false, error }` envelope the form toasts.
  describe("internal code through the admin API", () => {
    const CODE = "FB2_001_R1";
    type Result = { success: boolean; error?: string };
    let caller: {
      create: (input: unknown) => Promise<Result & { result?: { id: string } }>;
      edit: (input: unknown) => Promise<Result>;
      delete: (input: { id: string }) => Promise<Result>;
    };

    beforeAll(async () => {
      const { productRouter } = await import("#root/backend/products/trpc");
      const c = productRouter.createCaller({
        db,
        clientSession: { role: "admin" },
      } as never);
      caller = {
        create: (input) => c.create(input as never) as never,
        edit: (input) => c.edit(input as never) as never,
        delete: (input) => c.delete(input as never) as never,
      };
    });

    /** Mirrors the edit payload built in pages/dashboard/products/components.tsx. */
    const formEdit = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      name: `${TAG}Titanium Labret`,
      description: "a small piece of titanium",
      price: 450,
      discountPrice: undefined,
      stock: 10,
      imageId: fileId,
      productImages: [
        { id: fileId, url: `/uploads/${TAG}img.webp`, diskname: `${TAG}img.webp`, isPrimary: true },
      ],
      categoryId,
      categoryIds: [categoryId],
      variants: [],
      sortOrder: 0,
      hidden: false,
      bestLayeredWithIds: [],
      upsellMode: "global",
      internalCode: "",
      costPrice: null,
      catalogueNo: null,
      ...overrides,
    });

    const createWith = async (internalCode: string, name = `${TAG}Titanium Labret`) => {
      const res = await caller.create(baseProduct({ name, internalCode }));
      expect(res.success).toBe(true);
      return res.result!.id;
    };

    const fullRow = async (id: string) =>
      (await db.select().from(schema.product).where(eq(schema.product.id, id)))[0]!;

    const holdersOf = async (code: string) =>
      (
        await db
          .select({ id: schema.product.id })
          .from(schema.product)
          .where(eq(schema.product.internalCode, code))
      ).map((r) => r.id);

    it("1. create with a new unique code succeeds", async () => {
      const id = await createWith(CODE);
      expect((await readRow(id))?.internalCode).toBe(CODE);
    });

    it("2. a second create with the same code fails and stores nothing", async () => {
      const a = await createWith(CODE);
      const res = await caller.create(
        baseProduct({ name: `${TAG}Second`, internalCode: CODE }),
      );
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/FB2_001_R1/);
      expect(res.error).toMatch(/already used/i);
      expect(await holdersOf(CODE)).toEqual([a]);
    });

    it("3. editing a product and keeping its code saves", async () => {
      const a = await createWith(CODE);
      const res = await caller.edit(formEdit(a, { internalCode: CODE }));
      expect(res).toMatchObject({ success: true });
      expect((await readRow(a))?.internalCode).toBe(CODE);
    });

    it("4. clearing and retyping the same code (any case or spacing) saves", async () => {
      const a = await createWith(CODE);
      // What the form sends if the admin retypes before the blur normalizes.
      const res = await caller.edit(formEdit(a, { internalCode: " fb2_001_r1 " }));
      expect(res).toMatchObject({ success: true });
      expect((await readRow(a))?.internalCode).toBe(CODE);
    });

    it("5. changing an unrelated field while keeping the code saves only that change", async () => {
      const a = await createWith(CODE);
      const before = await fullRow(a);
      const res = await caller.edit(formEdit(a, { internalCode: CODE, stock: 4 }));
      expect(res).toMatchObject({ success: true });
      const after = await fullRow(a);
      expect(after.stock).toBe(4);
      expect(after.internalCode).toBe(CODE);
      expect(after.id).toBe(before.id);
      expect(after.price).toBe(before.price);
      expect(after.catalogueNo).toBe(before.catalogueNo);
    });

    it("5b. moving the code away and back across saves succeeds", async () => {
      const a = await createWith(CODE);
      expect(await caller.edit(formEdit(a, { internalCode: "TEMP_X" }))).toMatchObject({ success: true });
      expect(await caller.edit(formEdit(a, { internalCode: CODE }))).toMatchObject({ success: true });
      expect((await readRow(a))?.internalCode).toBe(CODE);
    });

    it("6. editing another product to take that code fails and changes nothing", async () => {
      const a = await createWith(CODE);
      const b = await createWith("FB2_002", `${TAG}Other`);
      const bBefore = await fullRow(b);

      const res = await caller.edit(
        formEdit(b, { name: `${TAG}Other renamed`, stock: 1, internalCode: CODE }),
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/FB2_001_R1/);
      expect(res.error).toMatch(/already used/i);
      // The rejected save is all-or-nothing: B's other fields are untouched too.
      const bAfter = await fullRow(b);
      expect(bAfter.internalCode).toBe("FB2_002");
      expect(bAfter.name).toBe(bBefore.name);
      expect(bAfter.stock).toBe(bBefore.stock);
      expect(await holdersOf(CODE)).toEqual([a]);
    });

    it("7. blank codes stay NULL and never conflict with each other", async () => {
      const a = (await caller.create(baseProduct({ internalCode: "" }))).result!.id;
      const b = (await caller.create(baseProduct({ name: `${TAG}Second`, internalCode: "  " }))).result!.id;
      expect(await caller.edit(formEdit(a, { internalCode: "" }))).toMatchObject({ success: true });
      expect(await caller.edit(formEdit(b, { internalCode: "" }))).toMatchObject({ success: true });
      expect((await readRow(a))?.internalCode).toBeNull();
      expect((await readRow(b))?.internalCode).toBeNull();
    });

    it("8. the API rejects a real duplicate sent without the form's normalization", async () => {
      const a = await createWith(CODE);
      const b = await createWith("FB2_002", `${TAG}Other`);
      // A hand-rolled call: lowercase, padded, minimal payload.
      const res = await caller.edit({
        id: b,
        name: `${TAG}Other`,
        description: "x",
        imageId: fileId,
        categoryId,
        categoryIds: [categoryId],
        price: 450,
        stock: 10,
        internalCode: "  fb2_001_r1",
      });
      expect(res.success).toBe(false);
      expect(await holdersOf(CODE)).toEqual([a]);
    });

    it("keeps the database-level guarantee when the service is bypassed entirely", async () => {
      await createWith(CODE);
      const b = await createWith("FB2_002", `${TAG}Other`);
      await expect(
        db.update(schema.product).set({ internalCode: CODE }).where(eq(schema.product.id, b)),
      ).rejects.toThrow();
    });

    it("maps an index violation that races past the pre-check to the clean message", async () => {
      const { rethrowInternalCodeConflict } = await import("#root/backend/products/internal-code");
      await createWith(CODE);
      const b = await createWith("FB2_002", `${TAG}Other`);

      // A real driver error, exactly as the edit transaction's catch sees it.
      const raw = await db
        .update(schema.product)
        .set({ internalCode: CODE })
        .where(eq(schema.product.id, b))
        .then(() => null, (e: unknown) => e);
      expect(raw).not.toBeNull();

      let mapped: unknown;
      try {
        rethrowInternalCodeConflict(raw, CODE);
      } catch (e) {
        mapped = e;
      }
      expect(mapped).toMatchObject({ _tag: "DuplicateInternalCode" });
      expect((mapped as { clientMessage: string }).clientMessage).toMatch(/already used/i);

      // A different unique violation (a slug clash) is NOT relabelled.
      const aSlug = (await fullRow(b)).slug;
      const other = await createWith("FB2_003", `${TAG}Third`);
      const slugClash = await db
        .update(schema.product)
        .set({ slug: aSlug })
        .where(eq(schema.product.id, other))
        .then(() => null, (e: unknown) => e);
      expect(slugClash).not.toBeNull();
      let rethrown: unknown;
      try {
        rethrowInternalCodeConflict(slugClash, "FB2_003");
      } catch (e) {
        rethrown = e;
      }
      expect(rethrown).toBe(slugClash);
    });

    // ─── Deleted products keep their code but do not reserve it ────────────
    //
    // Policy (migration 0068): codes are unique among LIVE products. A
    // soft-deleted product keeps its historical code for order/ERP history,
    // a live product may reuse it, and putting the deleted one back live is
    // refused while someone else holds the code.
    describe("deleted products", () => {
      const del = (id: string) => caller.delete({ id });
      /**
       * There is no restore flow in the storefront (delete is one-way). This
       * is the raw write any future restore — or a manual SQL fix — performs,
       * so it is what the database has to police.
       */
      const restore = (id: string) =>
        db
          .update(schema.product)
          .set({ deleted: false })
          .where(eq(schema.product.id, id))
          .then(() => null, (e: unknown) => e);

      it("1–3. a live owner blocks other products and keeps its own code", async () => {
        const a = await createWith(CODE);
        const b = await createWith("CODE_B", `${TAG}Other`);
        expect((await caller.edit(formEdit(b, { internalCode: CODE }))).success).toBe(false);
        expect(await caller.edit(formEdit(a, { internalCode: CODE }))).toMatchObject({ success: true });
        expect(await holdersOf(CODE)).toEqual([a]);
      });

      it("4–6. a deleted product keeps its code, and a live product can then take it", async () => {
        const a = await createWith(CODE);
        const b = await createWith("CODE_B", `${TAG}Other`);

        expect(await del(a)).toMatchObject({ success: true });
        expect(await fullRow(a)).toMatchObject({ deleted: true, internalCode: CODE });

        expect(await caller.edit(formEdit(b, { internalCode: CODE }))).toMatchObject({ success: true });
        expect((await fullRow(b)).internalCode).toBe(CODE);
        // The deleted row's historical code is untouched by B taking it.
        expect(await fullRow(a)).toMatchObject({ deleted: true, internalCode: CODE });
        expect((await holdersOf(CODE)).sort()).toEqual([a, b].sort());
      });

      it("a new product can be created with a code only deleted products hold", async () => {
        const a = await createWith(CODE);
        await del(a);
        const c = await createWith(CODE, `${TAG}Recreated`);
        expect((await fullRow(c)).internalCode).toBe(CODE);
        expect((await fullRow(a)).internalCode).toBe(CODE);
      });

      it("a collision names the live owner, never a deleted one", async () => {
        const a = await createWith(CODE, `${TAG}Old deleted copy`);
        await del(a);
        await createWith(CODE, `${TAG}Live owner`);
        const res = await caller.create(baseProduct({ name: `${TAG}Third`, internalCode: CODE }));
        expect(res.success).toBe(false);
        expect(res.error).toBe(`Internal code "${CODE}" is already used by "${TAG}Live owner".`);
      });

      it("7. restoring A while B owns the code is refused with the clean message", async () => {
        const a = await createWith(CODE);
        await del(a);
        const b = await createWith(CODE, `${TAG}Other`);

        const err = await restore(a);
        expect(err).not.toBeNull();
        const { rethrowInternalCodeConflict } = await import("#root/backend/products/internal-code");
        let mapped: unknown;
        try {
          rethrowInternalCodeConflict(err, CODE);
        } catch (e) {
          mapped = e;
        }
        expect(mapped).toMatchObject({ _tag: "DuplicateInternalCode" });
        expect((mapped as { clientMessage: string }).clientMessage).toMatch(/already used by another product/);

        // Nothing moved: A is still deleted, both still hold their codes.
        expect(await fullRow(a)).toMatchObject({ deleted: true, internalCode: CODE });
        expect(await fullRow(b)).toMatchObject({ deleted: false, internalCode: CODE });
      });

      it("8. once B is deleted too, A can be restored with its code", async () => {
        const a = await createWith(CODE);
        await del(a);
        const b = await createWith(CODE, `${TAG}Other`);
        await del(b);
        expect(await restore(a)).toBeNull();
        expect(await fullRow(a)).toMatchObject({ deleted: false, internalCode: CODE });
        expect(await fullRow(b)).toMatchObject({ deleted: true, internalCode: CODE });
      });

      it("9. simultaneous saves of one code on two live products: one wins, one gets the clean message", async () => {
        for (let round = 0; round < 5; round++) {
          const code = `RACE_${round}`;
          const a = await createWith(`RACE_A_${round}`, `${TAG}Race A ${round}`);
          const b = await createWith(`RACE_B_${round}`, `${TAG}Race B ${round}`);
          const results = await Promise.all([
            caller.edit(formEdit(a, { name: `${TAG}Race A ${round}`, internalCode: code })),
            caller.edit(formEdit(b, { name: `${TAG}Race B ${round}`, internalCode: code })),
          ]);
          expect(results.filter((r) => r.success)).toHaveLength(1);
          const loser = results.find((r) => !r.success);
          expect(loser?.error).toMatch(new RegExp(`"${code}" is already used by`));
          expect(await holdersOf(code)).toHaveLength(1);
        }
      });

      it("10. blank codes are unaffected by deletion and restore", async () => {
        const a = (await caller.create(baseProduct({ internalCode: "" }))).result!.id;
        await del(a);
        const b = (await caller.create(baseProduct({ name: `${TAG}Second`, internalCode: "" }))).result!.id;
        expect(await restore(a)).toBeNull();
        expect((await readRow(a))?.internalCode).toBeNull();
        expect((await readRow(b))?.internalCode).toBeNull();
      });

      it("12. the database enforces uniqueness on live rows only, via the partial index", async () => {
        const { rows } = await db.execute<{ indexname: string; indexdef: string }>(sql`
          select indexname, indexdef from pg_indexes
          where tablename = 'product' and indexdef ilike '%(internal_code)%'
        `);
        expect(rows.map((r) => r.indexname)).toEqual(["product_internal_code_active_idx"]);
        expect(rows[0]!.indexdef).toMatch(/^CREATE UNIQUE INDEX/);
        expect(rows[0]!.indexdef).toMatch(/WHERE \(\(deleted = false\) AND \(internal_code IS NOT NULL\)\)/);
      });
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

  // ─── Catalogue number (customer-facing) ───────────────────────────────────

  describe("catalogue number", () => {
    const either = <A, E>(effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>) =>
      Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })).pipe(Effect.either));
    const catalogueNo = async (id: string) =>
      (await db.select({ no: schema.product.catalogueNo }).from(schema.product).where(eq(schema.product.id, id)))[0]?.no;
    const editPayload = (id: string, overrides: Record<string, unknown>) =>
      ({
        id,
        name: `${TAG}Titanium Labret`,
        description: "still titanium",
        imageId: fileId,
        categoryId,
        categoryIds: [categoryId],
        price: 450,
        stock: 10,
        hidden: false,
        ...overrides,
      }) as never;

    it("is stored when given and NULL when not — never generated", async () => {
      const numbered = await run(createProduct(baseProduct({ catalogueNo: 901 }), adminSession));
      const blank = await run(createProduct(baseProduct({ name: `${TAG}Unnumbered` }), adminSession));
      expect(await catalogueNo(numbered.id)).toBe(901);
      expect(await catalogueNo(blank.id)).toBeNull();
    });

    it("rejects a number another product already has, naming it", async () => {
      await run(createProduct(baseProduct({ name: `${TAG}First 902`, catalogueNo: 902 }), adminSession));
      const result = await either(createProduct(baseProduct({ name: `${TAG}Clash 902`, catalogueNo: 902 }), adminSession));
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        const msg = (result.left as { clientMessage?: string }).clientMessage ?? "";
        expect(msg).toContain("902");
        expect(msg).toContain("First 902");
      }
    });

    it("keeps its own number on re-save, can be changed, and can be cleared", async () => {
      const created = await run(createProduct(baseProduct({ catalogueNo: 903 }), adminSession));
      await run(editProduct(editPayload(created.id, { catalogueNo: 903 }), adminSession));
      expect(await catalogueNo(created.id)).toBe(903);
      // An edit that does not send the field leaves it alone.
      await run(editProduct(editPayload(created.id, {}), adminSession));
      expect(await catalogueNo(created.id)).toBe(903);
      await run(editProduct(editPayload(created.id, { catalogueNo: 904 }), adminSession));
      expect(await catalogueNo(created.id)).toBe(904);
      await run(editProduct(editPayload(created.id, { catalogueNo: null }), adminSession));
      expect(await catalogueNo(created.id)).toBeNull();
    });

    it("reaches the storefront: product detail and search carry it", async () => {
      const created = await run(createProduct(baseProduct({ name: `${TAG}Numbered Piece`, catalogueNo: 905 }), adminSession));
      const detail = await run(getProductById({ productId: created.id }));
      expect((detail as { catalogueNo?: number | null }).catalogueNo).toBe(905);
      const results = await run(searchProducts({ limit: 50, offset: 0, includeOutOfStock: true, search: "Numbered Piece" } as never));
      const hit = results.items.find((p) => p.id === created.id);
      expect(hit?.catalogueNo).toBe(905);
    });
  });

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
