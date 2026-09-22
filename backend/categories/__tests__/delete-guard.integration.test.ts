import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";
import type { ClientSession } from "#root/backend/auth/shared/entities";

/**
 * Category delete guards, against a real Postgres.
 *
 * A product is filed into a category two ways — the legacy
 * `product.category_id` FK and the `product_category` junction the admin UI
 * writes — and the guards used to see only the FK, while the storefront query
 * that lists the category's products matched either. A category could
 * therefore report itself empty, pass the guard, be soft-deleted, and still
 * have a full storefront page behind it; its products then vanished from the
 * admin product list, which resolves categories through that same FK.
 *
 * `backend/categories/category-products.ts` is now the single definition of
 * membership, shared by the public count and by both guards. These tests pin
 * the two halves of that:
 *
 *   - a category is "not empty" if a live product is attached by EITHER path;
 *   - the number the public count shows and the rule the guard enforces are
 *     derived from the same predicate.
 *
 * On hidden products the two policies differ ON PURPOSE — see
 * `attachedToCategory`. A hidden product is live and still points at its
 * category, so it blocks deletion (the pre-existing rule, preserved); it is
 * not on the storefront, so it does not appear in the shopper-facing count.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("category delete guards (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let deleteMainCategory: typeof import("#root/backend/categories/main-category-crud/service").deleteMainCategory;
  let deleteCategory: typeof import("#root/backend/categories/delete-category/service").deleteCategory;
  let viewCategories: typeof import("#root/backend/categories/view-categories/service").viewCategories;
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "delguard-it-";
  const ADMIN_EMAIL = `${TAG}admin@example.com`;

  let vendorId: string;
  let fileId: string;
  /** The category under test. Unique `type` per test so the SUBCATEGORY guard
   *  in deleteMainCategory (same type, different id) never fires instead. */
  let targetId: string;
  /** Somewhere else for a product's FK to point when we test junction-only. */
  let elsewhereId: string;

  const session: ClientSession = {
    id: `${TAG}session`,
    token: "t",
    email: ADMIN_EMAIL,
    name: "Admin",
    phone: "",
    expiresAt: new Date(Date.now() + 3_600_000),
    role: "admin",
  };

  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      import("#root/shared/database/drizzle/db").DatabaseClientService
    >,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  /**
   * Runs a delete and reports whether it was refused, with the message the
   * administrator would see.
   *
   * `Effect.either` rather than a try/catch: the guards fail on the Effect
   * ERROR channel with a ServerError, and `Effect.runPromise` rejects with a
   * FiberFailure wrapper whose `clientMessage` is not reachable — a catch
   * block sees only "Unknown error", which would make these assertions pass
   * for the wrong reason.
   */
  const attemptDelete = async (
    which: "main" | "sub",
    id: string,
  ): Promise<{ refused: boolean; message: string }> => {
    const effect =
      which === "main"
        ? deleteMainCategory({ id }, session)
        : deleteCategory({ id }, session);

    const outcome = await Effect.runPromise(
      Effect.either(effect.pipe(provideDatabase({ db: db as never }))),
    );

    if (outcome._tag === "Right") return { refused: false, message: "" };

    const err = outcome.left as { clientMessage?: string; message?: string };
    return {
      refused: true,
      message: err?.clientMessage ?? err?.message ?? String(err),
    };
  };

  const isDeleted = async (id: string) =>
    (
      await db
        .select({ deleted: schema.category.deleted })
        .from(schema.category)
        .where(eq(schema.category.id, id))
    )[0]?.deleted ?? null;

  /** What the public category list reports for a category. */
  const shownCount = async (id: string) => {
    const cats = await run(viewCategories());
    return Number(cats.find((c) => c.id === id)?.productCount ?? -1);
  };

  let seq = 0;
  const addProduct = async (opts: {
    /** Category the direct FK points at. */
    fk: string;
    /** Categories to attach through the junction table. */
    junction?: string[];
    deleted?: boolean;
    hidden?: boolean;
  }) => {
    const n = seq++;
    const [p] = await db
      .insert(schema.product)
      .values({
        name: `${TAG}product-${n}`,
        slug: `${TAG}product-${n}`,
        description: "d",
        imageId: fileId,
        categoryId: opts.fk,
        price: "100.00",
        vendorId,
        stock: 5,
        deleted: opts.deleted ?? false,
        hidden: opts.hidden ?? false,
      })
      .returning({ id: schema.product.id });
    if (opts.junction?.length) {
      await db.insert(schema.productCategory).values(
        opts.junction.map((categoryId) => ({
          productId: p!.id,
          categoryId,
          isPrimary: false,
        })),
      );
    }
    return p!.id;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    ({ deleteMainCategory } = await import(
      "#root/backend/categories/main-category-crud/service"
    ));
    ({ deleteCategory } = await import(
      "#root/backend/categories/delete-category/service"
    ));
    ({ viewCategories } = await import(
      "#root/backend/categories/view-categories/service"
    ));
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    vendorId = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db
      .insert(schema.vendor)
      .values({ id: vendorId, name: `${TAG}store`, status: "active" })
      .onConflictDoNothing();

    const [f] = await db
      .insert(schema.file)
      .values({ diskname: `${TAG}img.webp` })
      .returning();
    fileId = f!.id;

    // The guards write a categoryLog row keyed on the acting user's email.
    await db
      .insert(schema.user)
      .values({
        id: `${TAG}user`,
        name: "Admin",
        email: ADMIN_EMAIL,
        role: "admin",
      })
      .onConflictDoNothing();
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
    const catIds = (
      await db
        .select({ id: schema.category.id })
        .from(schema.category)
        .where(like(schema.category.slug, `${TAG}%`))
    ).map((r) => r.id);
    if (catIds.length > 0) {
      await db
        .delete(schema.categoryLog)
        .where(inArray(schema.categoryLog.categoryId, catIds));
      await db
        .delete(schema.category)
        .where(inArray(schema.category.id, catIds));
    }
  };

  beforeEach(async () => {
    await cleanup();
    seq++;
    // Distinct `type` values: deleteMainCategory refuses a category that has
    // siblings of the same type, and that guard runs before the product one.
    const [target] = await db
      .insert(schema.category)
      .values({
        name: `${TAG}Target`,
        slug: `${TAG}target-${seq}`,
        type: `${TAG}type-a-${seq}`,
      })
      .returning();
    targetId = target!.id;

    const [elsewhere] = await db
      .insert(schema.category)
      .values({
        name: `${TAG}Elsewhere`,
        slug: `${TAG}elsewhere-${seq}`,
        type: `${TAG}type-b-${seq}`,
      })
      .returning();
    elsewhereId = elsewhere!.id;
  });

  afterAll(async () => {
    await cleanup();
    await db.delete(schema.user).where(eq(schema.user.email, ADMIN_EMAIL));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  // ─── No products ──────────────────────────────────────────────────────────

  describe("a category with no products", () => {
    it("is deletable through the main-category path", async () => {
      const result = await attemptDelete("main", targetId);
      expect(result.refused).toBe(false);
      expect(await isDeleted(targetId)).toBe(true);
    });

    it("is deletable through the subcategory path", async () => {
      const result = await attemptDelete("sub", targetId);
      expect(result.refused).toBe(false);
      expect(await isDeleted(targetId)).toBe(true);
    });

    it("reports a count of zero", async () => {
      expect(await shownCount(targetId)).toBe(0);
    });
  });

  // ─── FK-only assignment ───────────────────────────────────────────────────

  describe("a product attached by the legacy FK only", () => {
    beforeEach(async () => {
      await addProduct({ fk: targetId });
    });

    it("blocks the main-category delete", async () => {
      const result = await attemptDelete("main", targetId);
      expect(result.refused).toBe(true);
      expect(result.message).toMatch(/1 product/);
      expect(await isDeleted(targetId)).toBe(false);
    });

    it("blocks the subcategory delete", async () => {
      const result = await attemptDelete("sub", targetId);
      expect(result.refused).toBe(true);
      expect(await isDeleted(targetId)).toBe(false);
    });

    it("is counted by the public category list", async () => {
      expect(await shownCount(targetId)).toBe(1);
    });
  });

  // ─── Junction-only assignment ─────────────────────────────────────────────

  describe("a product attached by the junction table only", () => {
    beforeEach(async () => {
      // `product.category_id` is NOT NULL, so "junction only" means the FK
      // points at a DIFFERENT category. This is the case both guards missed.
      await addProduct({ fk: elsewhereId, junction: [targetId] });
    });

    it("blocks the main-category delete", async () => {
      const result = await attemptDelete("main", targetId);
      expect(result.refused).toBe(true);
      expect(result.message).toMatch(/1 product/);
      expect(await isDeleted(targetId)).toBe(false);
    });

    it("blocks the subcategory delete", async () => {
      const result = await attemptDelete("sub", targetId);
      expect(result.refused).toBe(true);
      expect(await isDeleted(targetId)).toBe(false);
    });

    it("is counted by the public category list", async () => {
      expect(await shownCount(targetId)).toBe(1);
    });

    it("does not block deleting the unrelated category it is NOT in", async () => {
      // Guarding on the right category, not on any attachment anywhere.
      const [other] = await db
        .insert(schema.category)
        .values({
          name: `${TAG}Other`,
          slug: `${TAG}other-x`,
          type: `${TAG}type-c-x`,
        })
        .returning();
      const result = await attemptDelete("main", other!.id);
      expect(result.refused).toBe(false);
    });
  });

  // ─── Both mechanisms for the same product ─────────────────────────────────

  describe("a product attached by BOTH the FK and the junction", () => {
    beforeEach(async () => {
      await addProduct({ fk: targetId, junction: [targetId] });
    });

    it("blocks the delete", async () => {
      const result = await attemptDelete("main", targetId);
      expect(result.refused).toBe(true);
      expect(await isDeleted(targetId)).toBe(false);
    });

    it("counts that product ONCE, not once per attachment", async () => {
      const result = await attemptDelete("main", targetId);
      // "It has 1 products" — the singular/plural wording is the existing
      // message's; what matters is the number is 1 and not 2.
      expect(result.message).toMatch(/\b1 product/);
      expect(result.message).not.toMatch(/\b2 product/);
    });

    it("is counted once by the public category list too", async () => {
      expect(await shownCount(targetId)).toBe(1);
    });
  });

  // ─── Soft-deleted products ────────────────────────────────────────────────

  describe("a soft-deleted product", () => {
    it("does not block the main-category delete", async () => {
      await addProduct({ fk: targetId, deleted: true });
      const result = await attemptDelete("main", targetId);
      expect(result.refused).toBe(false);
      expect(await isDeleted(targetId)).toBe(true);
    });

    it("does not block the subcategory delete", async () => {
      await addProduct({ fk: targetId, deleted: true });
      const result = await attemptDelete("sub", targetId);
      expect(result.refused).toBe(false);
    });

    it("does not block when it is attached by the junction either", async () => {
      await addProduct({
        fk: elsewhereId,
        junction: [targetId],
        deleted: true,
      });
      const result = await attemptDelete("main", targetId);
      expect(result.refused).toBe(false);
    });

    it("is not counted by the public category list", async () => {
      await addProduct({ fk: targetId, deleted: true });
      expect(await shownCount(targetId)).toBe(0);
    });
  });

  // ─── Hidden products ──────────────────────────────────────────────────────

  describe("a hidden product", () => {
    // DELIBERATE ASYMMETRY, and the pre-existing rule: `hidden` only means
    // "not shown in the public shop". The row is live and still points at its
    // category, so deleting the category would orphan it.
    it("BLOCKS the main-category delete", async () => {
      await addProduct({ fk: targetId, hidden: true });
      const result = await attemptDelete("main", targetId);
      expect(result.refused).toBe(true);
      expect(await isDeleted(targetId)).toBe(false);
    });

    it("BLOCKS the subcategory delete", async () => {
      await addProduct({ fk: targetId, hidden: true });
      const result = await attemptDelete("sub", targetId);
      expect(result.refused).toBe(true);
      expect(await isDeleted(targetId)).toBe(false);
    });

    it("blocks when attached through the junction as well", async () => {
      await addProduct({ fk: elsewhereId, junction: [targetId], hidden: true });
      const result = await attemptDelete("main", targetId);
      expect(result.refused).toBe(true);
    });

    it("is NOT counted by the shopper-facing category list", async () => {
      await addProduct({ fk: targetId, hidden: true });
      // The storefront badge must not promise a product nobody can reach…
      expect(await shownCount(targetId)).toBe(0);
      // …but the category is still not deletable. The two policies differ on
      // `hidden` on purpose; if this ever becomes deletable-at-0, a hidden
      // product has been silently orphaned.
      expect((await attemptDelete("main", targetId)).refused).toBe(true);
    });
  });

  // ─── The two must not drift ───────────────────────────────────────────────

  describe("displayed count and enforced rule agree on assignment paths", () => {
    // Describe the attachment by NAME, not by id: the ids are rebuilt inside
    // the loop, so capturing them in the table would compare stale values.
    const attachments = ["fk-only", "junction-only", "both"] as const;

    it.each(attachments)(
      "%s makes the count non-zero AND blocks both deletes",
      async (kind) => {
        await addProduct({
          fk: kind === "junction-only" ? elsewhereId : targetId,
          junction: kind === "fk-only" ? undefined : [targetId],
        });

        expect(await shownCount(targetId)).toBe(1);
        expect((await attemptDelete("main", targetId)).refused).toBe(true);
        expect((await attemptDelete("sub", targetId)).refused).toBe(true);
        expect(await isDeleted(targetId)).toBe(false);
      },
    );
  });
});
