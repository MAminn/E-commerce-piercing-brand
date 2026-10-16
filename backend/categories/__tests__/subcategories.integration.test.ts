import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ClientSession } from "#root/backend/auth/shared/entities";

/**
 * Subcategory management against a real Postgres: CRUD, ordering,
 * visibility, bulk product assignment and safe deletion.
 *
 * The property every test leans on is the membership invariant from
 * backend/categories/hierarchy.ts — a product in a subcategory is always in
 * its main category too, so no reorganisation can make a product drop out of
 * "All <category>" or out of a main-category promo/bundle.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("subcategories (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let svc: {
    create: typeof import("#root/backend/categories/create-category/create-category").createCategory;
    edit: typeof import("#root/backend/categories/edit-category/service").editCategory;
    del: typeof import("#root/backend/categories/delete-category/service").deleteCategory;
    renameMain: typeof import("#root/backend/categories/main-category-crud/service").renameMainCategory;
    deleteMain: typeof import("#root/backend/categories/main-category-crud/service").deleteMainCategory;
    tree: typeof import("#root/backend/categories/category-admin/service").viewCategoryAdminTree;
    reorder: typeof import("#root/backend/categories/category-admin/service").reorderCategories;
    visibility: typeof import("#root/backend/categories/category-admin/service").setCategoryVisibility;
    list: typeof import("#root/backend/categories/subcategory-products/service").listCategoryProducts;
    assign: typeof import("#root/backend/categories/subcategory-products/service").assignProductsToSubcategory;
    remove: typeof import("#root/backend/categories/subcategory-products/service").removeProductsFromSubcategory;
    move: typeof import("#root/backend/categories/subcategory-products/service").moveProductsBetweenSubcategories;
    viewCategories: typeof import("#root/backend/categories/view-categories/service").viewCategories;
    search: typeof import("#root/backend/products/search-products/service").searchProducts;
    normalize: typeof import("#root/backend/categories/hierarchy").normalizeProductCategoryIds;
  };
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "subcat-it-";
  const ADMIN_EMAIL = `${TAG}admin@example.com`;
  const session: ClientSession = {
    id: `${TAG}session`,
    token: "t",
    email: ADMIN_EMAIL,
    name: "Admin",
    phone: "",
    expiresAt: new Date(Date.now() + 3_600_000),
    role: "admin",
  };
  const customer: ClientSession = { ...session, role: "user" };

  let vendorId: string;
  let fileId: string;
  let earId: string;
  let noseId: string;

  type Env = import("#root/shared/database/drizzle/db").DatabaseClientService;
  const run = <A, E>(effect: Effect.Effect<A, E, Env>) =>
    Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  /** Runs an effect and returns the admin-facing error message, or null on success. */
  const refusal = async <A, E>(effect: Effect.Effect<A, E, Env>) => {
    const outcome = await Effect.runPromise(
      Effect.either(effect.pipe(provideDatabase({ db: db as never }))),
    );
    if (outcome._tag === "Right") return null;
    const err = outcome.left as { clientMessage?: string; message?: string };
    return err?.clientMessage ?? err?.message ?? String(err);
  };

  let seq = 0;
  const addProduct = async (primary: string, junction: string[] = [], hidden = false) => {
    const n = seq++;
    const [p] = await db
      .insert(schema.product)
      .values({
        name: `${TAG}product-${String(n).padStart(3, "0")}`,
        slug: `${TAG}product-${n}`,
        description: "d",
        imageId: fileId,
        categoryId: primary,
        price: "150.00",
        vendorId,
        stock: 3,
        hidden,
      })
      .returning({ id: schema.product.id });
    if (junction.length) {
      await db
        .insert(schema.productCategory)
        .values(junction.map((categoryId) => ({ productId: p!.id, categoryId })));
    }
    return p!.id;
  };

  /** Every category id a product belongs to, by either path. */
  const membership = async (productId: string) => {
    const [p] = await db
      .select({ categoryId: schema.product.categoryId })
      .from(schema.product)
      .where(eq(schema.product.id, productId));
    const junction = await db
      .select({ categoryId: schema.productCategory.categoryId })
      .from(schema.productCategory)
      .where(eq(schema.productCategory.productId, productId));
    return {
      primary: p!.categoryId,
      all: new Set([p!.categoryId, ...junction.map((j) => j.categoryId)]),
      junctionRows: junction.length,
    };
  };

  const createSub = (parentId: string, name: string, extra: Record<string, unknown> = {}) =>
    run(svc.create({ parentId, name: `${TAG}${name}`, ...extra }, session));

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    const main = await import("#root/backend/categories/main-category-crud/service");
    const admin = await import("#root/backend/categories/category-admin/service");
    const products = await import("#root/backend/categories/subcategory-products/service");
    svc = {
      create: (await import("#root/backend/categories/create-category/create-category")).createCategory,
      edit: (await import("#root/backend/categories/edit-category/service")).editCategory,
      del: (await import("#root/backend/categories/delete-category/service")).deleteCategory,
      renameMain: main.renameMainCategory,
      deleteMain: main.deleteMainCategory,
      tree: admin.viewCategoryAdminTree,
      reorder: admin.reorderCategories,
      visibility: admin.setCategoryVisibility,
      list: products.listCategoryProducts,
      assign: products.assignProductsToSubcategory,
      remove: products.removeProductsFromSubcategory,
      move: products.moveProductsBetweenSubcategories,
      viewCategories: (await import("#root/backend/categories/view-categories/service")).viewCategories,
      search: (await import("#root/backend/products/search-products/service")).searchProducts,
      normalize: (await import("#root/backend/categories/hierarchy")).normalizeProductCategoryIds,
    };
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    vendorId = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db
      .insert(schema.vendor)
      .values({ id: vendorId, name: `${TAG}store`, status: "active" })
      .onConflictDoNothing();
    const [f] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = f!.id;
    await db
      .insert(schema.user)
      .values({ id: `${TAG}user`, name: "Admin", email: ADMIN_EMAIL, role: "admin" })
      .onConflictDoNothing();
  });

  const cleanup = async () => {
    const productIds = (
      await db
        .select({ id: schema.product.id })
        .from(schema.product)
        .where(like(schema.product.name, `${TAG}%`))
    ).map((r) => r.id);
    if (productIds.length) {
      await db.delete(schema.productCategory).where(inArray(schema.productCategory.productId, productIds));
      await db.delete(schema.product).where(inArray(schema.product.id, productIds));
    }
    const catIds = (
      await db
        .select({ id: schema.category.id })
        .from(schema.category)
        .where(like(schema.category.slug, `${TAG}%`))
    ).map((r) => r.id);
    if (catIds.length) {
      await db.delete(schema.categoryLog).where(inArray(schema.categoryLog.categoryId, catIds));
      await db.update(schema.category).set({ parentId: null }).where(inArray(schema.category.id, catIds));
      await db.delete(schema.category).where(inArray(schema.category.id, catIds));
    }
  };

  beforeEach(async () => {
    await cleanup();
    const [ear] = await db
      .insert(schema.category)
      .values({ name: `${TAG}Ear Piercings`, slug: `${TAG}ear-piercings`, type: `${TAG}ear` })
      .returning();
    const [nose] = await db
      .insert(schema.category)
      .values({ name: `${TAG}Nose Piercings`, slug: `${TAG}nose-piercings`, type: `${TAG}nose` })
      .returning();
    earId = ear!.id;
    noseId = nose!.id;
  });

  afterAll(async () => {
    await cleanup();
    await db.delete(schema.user).where(eq(schema.user.email, ADMIN_EMAIL));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  // ─── Create / edit ────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates a subcategory under the chosen main category with safe defaults", async () => {
      const helix = await createSub(earId, "Helix");
      expect(helix.parentId).toBe(earId);
      expect(helix.type).toBe(`${TAG}ear`);
      expect(helix.slug).toBe(`${TAG}helix`);
      expect(helix.hidden).toBe(false);
      // A new subcategory must not appear on the homepage until featured.
      expect(helix.showOnLanding).toBe(false);
      expect(helix.imageId).toBeNull();
    });

    it("refuses a duplicate name under the same parent, case/plural-insensitively", async () => {
      await createSub(earId, "Helix");
      const msg = await refusal(svc.create({ parentId: earId, name: `${TAG}helix ` }, session));
      expect(msg).toMatch(/already exists/);
      const rows = await db
        .select()
        .from(schema.category)
        .where(eq(schema.category.parentId, earId));
      expect(rows).toHaveLength(1);
    });

    it("allows the same name under a different parent and keeps slugs unique", async () => {
      const earHoops = await createSub(earId, "Hoops");
      const noseHoops = await createSub(noseId, "Hoops");
      expect(earHoops.slug).toBe(`${TAG}hoops`);
      // Second one is scoped by its parent's slug, not "-2".
      expect(noseHoops.slug).toBe(`${TAG}nose-piercings-${TAG}hoops`);
    });

    it("rejects a custom link that is already taken", async () => {
      await createSub(earId, "Helix");
      const msg = await refusal(
        svc.create({ parentId: earId, name: `${TAG}Tragus`, slug: `${TAG}helix` }, session),
      );
      expect(msg).toMatch(/already used/);
    });

    it("cannot nest a subcategory under a subcategory", async () => {
      const helix = await createSub(earId, "Helix");
      const msg = await refusal(svc.create({ parentId: helix.id, name: `${TAG}Upper` }, session));
      expect(msg).toMatch(/subcategory/);
    });

    it("still accepts the legacy `type` input from older clients", async () => {
      const created = await run(svc.create({ type: `${TAG}ear`, name: `${TAG}Lobe` }, session));
      expect(created.parentId).toBe(earId);
    });

    it("refuses non-admins", async () => {
      expect(await refusal(svc.create({ parentId: earId, name: `${TAG}X` }, customer))).toMatch(/Admin/);
    });
  });

  describe("edit", () => {
    it("renaming keeps the link (slug) so existing URLs do not break", async () => {
      const helix = await createSub(earId, "Helix");
      const renamed = await run(svc.edit({ id: helix.id, name: `${TAG}Helix & Upper Ear` }, session));
      expect(renamed.name).toBe(`${TAG}Helix & Upper Ear`);
      expect(renamed.slug).toBe(helix.slug);
    });

    it("renaming a main category keeps its slug, type and subcategories", async () => {
      const helix = await createSub(earId, "Helix");
      await run(svc.renameMain({ id: earId, name: `${TAG}Ears` }, session));
      const [ear] = await db.select().from(schema.category).where(eq(schema.category.id, earId));
      expect(ear!.slug).toBe(`${TAG}ear-piercings`);
      expect(ear!.type).toBe(`${TAG}ear`);
      const [sub] = await db.select().from(schema.category).where(eq(schema.category.id, helix.id));
      expect(sub!.parentId).toBe(earId);
    });

    it("omitting the image keeps it; null removes it", async () => {
      const [img] = await db.insert(schema.file).values({ diskname: `${TAG}sub.webp` }).returning();
      const helix = await createSub(earId, "Helix", { imageId: img!.id });
      const kept = await run(svc.edit({ id: helix.id, name: helix.name }, session));
      expect(kept.imageId).toBe(img!.id);
      const cleared = await run(svc.edit({ id: helix.id, name: helix.name, imageId: null }, session));
      expect(cleared.imageId).toBeNull();
      await db.delete(schema.file).where(eq(schema.file.id, img!.id));
    });

    it("an explicit slug change is applied and validated", async () => {
      const helix = await createSub(earId, "Helix");
      await createSub(earId, "Tragus");
      const changed = await run(svc.edit({ id: helix.id, name: helix.name, slug: `${TAG}Helix Ear` }, session));
      expect(changed.slug).toBe(`${TAG}helix-ear`);
      expect(
        await refusal(svc.edit({ id: helix.id, name: helix.name, slug: `${TAG}tragus` }, session)),
      ).toMatch(/already used/);
    });
  });

  // ─── Order & visibility ───────────────────────────────────────────────────

  describe("order and visibility", () => {
    it("new subcategories go last; reorder persists and drives the public order", async () => {
      const a = await createSub(earId, "Lobe");
      const b = await createSub(earId, "Helix");
      const c = await createSub(earId, "Tragus");
      expect([a.sortOrder, b.sortOrder, c.sortOrder]).toEqual([1, 2, 3]);

      await run(svc.reorder({ parentId: earId, orderedIds: [c.id, a.id, b.id] }, session));
      const publicOrder = (await run(svc.viewCategories()))
        .filter((r) => r.parentId === earId)
        .map((r) => r.id);
      expect(publicOrder).toEqual([c.id, a.id, b.id]);
    });

    it("refuses a stale reorder list instead of half-applying it", async () => {
      const a = await createSub(earId, "Lobe");
      await createSub(earId, "Helix");
      expect(await refusal(svc.reorder({ parentId: earId, orderedIds: [a.id] }, session))).toMatch(
        /changed/,
      );
    });

    it("hiding a subcategory keeps its products assigned and in the main listing", async () => {
      const helix = await createSub(earId, "Helix");
      const p = await addProduct(earId);
      await run(svc.assign({ subcategoryId: helix.id, productIds: [p] }, session));
      await run(svc.visibility({ id: helix.id, hidden: true }, session));

      const m = await membership(p);
      expect(m.all.has(helix.id)).toBe(true);
      const all = await run(
        svc.search({ categoryIds: [earId, helix.id], includeOutOfStock: true, limit: 50, offset: 0 }),
      );
      expect(all.items.map((i) => i.id)).toContain(p);
      const row = (await run(svc.viewCategories())).find((r) => r.id === helix.id);
      expect(row?.hidden).toBe(true);
    });
  });

  // ─── Bulk assignment ──────────────────────────────────────────────────────

  describe("bulk assignment", () => {
    it("assigns many products at once, idempotently, without touching product data", async () => {
      const helix = await createSub(earId, "Helix");
      const ids = await Promise.all(Array.from({ length: 10 }, () => addProduct(earId)));
      const before = await db
        .select()
        .from(schema.product)
        .where(inArray(schema.product.id, ids));

      const first = await run(svc.assign({ subcategoryId: helix.id, productIds: ids }, session));
      expect(first.added).toBe(10);
      // A double-click / retried request adds nothing and creates no duplicates.
      const second = await run(svc.assign({ subcategoryId: helix.id, productIds: ids }, session));
      expect(second).toMatchObject({ added: 0, alreadyIn: 10 });
      const rows = await db
        .select()
        .from(schema.productCategory)
        .where(eq(schema.productCategory.categoryId, helix.id));
      expect(rows).toHaveLength(10);

      const after = await db.select().from(schema.product).where(inArray(schema.product.id, ids));
      const strip = (r: (typeof before)[number]) => ({ ...r, updatedAt: null });
      expect(after.map(strip).sort((x, y) => x.id.localeCompare(y.id))).toEqual(
        before.map(strip).sort((x, y) => x.id.localeCompare(y.id)),
      );

      const tree = await run(svc.tree(session));
      const ear = tree.find((t) => t.id === earId)!;
      expect(ear.children.find((c) => c.id === helix.id)?.productCount).toBe(10);
      expect(ear.productCount).toBe(10);
      expect(ear.unclassifiedCount).toBe(0);
    });

    it("pulling in a product from another category also files it in this main category", async () => {
      const helix = await createSub(earId, "Helix");
      const p = await addProduct(noseId);
      await run(svc.assign({ subcategoryId: helix.id, productIds: [p] }, session));
      const m = await membership(p);
      expect(m.primary).toBe(noseId);
      expect([...m.all].sort()).toEqual([earId, helix.id, noseId].sort());
    });

    it("moves products between sibling subcategories; they never leave the main category", async () => {
      const helix = await createSub(earId, "Helix");
      const tragus = await createSub(earId, "Tragus");
      const ids = await Promise.all([1, 2, 3, 4].map(() => addProduct(earId)));
      await run(svc.assign({ subcategoryId: helix.id, productIds: ids }, session));

      const moved = await run(
        svc.move({ fromSubcategoryId: helix.id, toSubcategoryId: tragus.id, productIds: ids.slice(0, 3) }, session),
      );
      expect(moved.moved).toBe(3);
      for (const id of ids.slice(0, 3)) {
        const m = await membership(id);
        expect(m.all.has(tragus.id)).toBe(true);
        expect(m.all.has(helix.id)).toBe(false);
        expect(m.all.has(earId)).toBe(true);
      }
      expect((await membership(ids[3]!)).all.has(helix.id)).toBe(true);
    });

    it("refuses moving across main categories", async () => {
      const helix = await createSub(earId, "Helix");
      const hoops = await createSub(noseId, "Hoops");
      const p = await addProduct(earId, [helix.id]);
      expect(
        await refusal(svc.move({ fromSubcategoryId: helix.id, toSubcategoryId: hoops.id, productIds: [p] }, session)),
      ).toMatch(/same category/);
    });

    it("removing keeps the product in the main category, even when the subcategory was its primary", async () => {
      const helix = await createSub(earId, "Helix");
      // Primary FK points at the subcategory and there is no main-category row.
      const p = await addProduct(helix.id);
      const res = await run(svc.remove({ subcategoryId: helix.id, productIds: [p] }, session));
      expect(res.removed).toBe(1);
      const m = await membership(p);
      expect(m.primary).toBe(earId);
      expect(m.all.has(helix.id)).toBe(false);
      expect(m.all.has(earId)).toBe(true);
    });

    it("lists products by view, with search and pagination", async () => {
      const helix = await createSub(earId, "Helix");
      const tragus = await createSub(earId, "Tragus");
      const inHelix = await addProduct(earId);
      const loose = await Promise.all([1, 2, 3].map(() => addProduct(earId)));
      const elsewhere = await addProduct(noseId);
      await run(svc.assign({ subcategoryId: helix.id, productIds: [inHelix] }, session));

      const base = { mainCategoryId: earId, page: 1, pageSize: 25 } as const;
      const ids = async (view: "in_subcategory" | "unclassified" | "in_category" | "all", extra = {}) =>
        (await run(svc.list({ ...base, view, subcategoryId: helix.id, ...extra }, session))).items.map(
          (i) => i.id,
        );

      expect(await ids("in_subcategory")).toEqual([inHelix]);
      expect((await ids("unclassified")).sort()).toEqual([...loose].sort());
      expect((await ids("in_category")).sort()).toEqual([inHelix, ...loose].sort());
      expect(await ids("all")).toContain(elsewhere);

      const page1 = await run(svc.list({ ...base, view: "in_category", pageSize: 5, page: 1 }, session));
      expect(page1.total).toBe(4);
      const firstRow = (await run(svc.list({ ...base, view: "in_subcategory", subcategoryId: helix.id }, session)))
        .items[0]!;
      expect(firstRow.subcategoryIds).toEqual([helix.id]);
      expect(tragus.id).toBeTruthy();

      const searched = await run(
        svc.list({ ...base, view: "all", search: `${TAG}product-` }, session),
      );
      expect(searched.total).toBeGreaterThanOrEqual(5);
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────────────

  describe("safe delete", () => {
    it("an empty subcategory deletes straight away", async () => {
      const helix = await createSub(earId, "Helix");
      await run(svc.del({ id: helix.id }, session));
      const [row] = await db.select().from(schema.category).where(eq(schema.category.id, helix.id));
      expect(row!.deleted).toBe(true);
    });

    it("refuses when products are attached and no handling was chosen", async () => {
      const helix = await createSub(earId, "Helix");
      await addProduct(earId, [helix.id]);
      expect(await refusal(svc.del({ id: helix.id }, session))).toMatch(/Choose where they should go/);
    });

    it("keeping products in the main category deletes only the subcategory", async () => {
      const helix = await createSub(earId, "Helix");
      const p = await addProduct(helix.id);
      const res = await run(svc.del({ id: helix.id, moveProductsTo: "parent" }, session));
      expect(res.productsMoved).toBe(1);
      const m = await membership(p);
      expect(m.primary).toBe(earId);
      expect(m.all.has(helix.id)).toBe(false);
      const [prod] = await db.select().from(schema.product).where(eq(schema.product.id, p));
      expect(prod!.deleted).toBe(false);
    });

    it("can move products to a sibling while deleting", async () => {
      const helix = await createSub(earId, "Helix");
      const tragus = await createSub(earId, "Tragus");
      const p = await addProduct(earId, [helix.id]);
      await run(svc.del({ id: helix.id, moveProductsTo: tragus.id }, session));
      const m = await membership(p);
      expect(m.all.has(tragus.id)).toBe(true);
      expect(m.all.has(earId)).toBe(true);
    });

    it("refuses deleting a category a promo code points at", async () => {
      const helix = await createSub(earId, "Helix");
      const [promo] = await db
        .insert(schema.promoCode)
        .values({
          code: `${TAG.toUpperCase()}${Date.now()}`,
          discountType: "percentage",
          discountValue: "10",
          startDate: new Date(),
          endDate: new Date(Date.now() + 86_400_000),
        })
        .returning({ id: schema.promoCode.id });
      await db.insert(schema.promoCodeCategories).values({ promoCodeId: promo!.id, categoryId: helix.id });
      expect(await refusal(svc.del({ id: helix.id }, session))).toMatch(/promo code/);
      await db.delete(schema.promoCodeCategories).where(eq(schema.promoCodeCategories.promoCodeId, promo!.id));
      await db.delete(schema.promoCode).where(eq(schema.promoCode.id, promo!.id));
    });

    it("a main category with subcategories cannot be deleted", async () => {
      await createSub(earId, "Helix");
      expect(await refusal(svc.deleteMain({ id: earId }, session))).toMatch(/subcategories/);
    });
  });

  // ─── Product form & legacy data ───────────────────────────────────────────

  describe("product form and legacy data", () => {
    it("choosing a subcategory in the product form also files the main category", async () => {
      const helix = await createSub(earId, "Helix");
      const ids = await svc.normalize(db as never, helix.id, [helix.id, helix.id]);
      expect(ids).toEqual([helix.id, earId]);
    });

    it("flags a legacy subcategory that repeats its parent's name as generic", async () => {
      const [generic] = await db
        .insert(schema.category)
        .values({ name: `${TAG}Ear piercing`, slug: `${TAG}ear-piercings-legacy`, type: `${TAG}ear`, parentId: earId })
        .returning();
      const helix = await createSub(earId, "Helix");
      const a = await addProduct(generic!.id);
      const b = await addProduct(earId, [helix.id]);

      const ear = (await run(svc.tree(session))).find((t) => t.id === earId)!;
      expect(ear.children.find((c) => c.id === generic!.id)?.generic).toBe(true);
      expect(ear.unclassifiedCount).toBe(1);
      const unclassified = await run(
        svc.list({ mainCategoryId: earId, view: "unclassified", page: 1, pageSize: 25 }, session),
      );
      expect(unclassified.items.map((i) => i.id)).toEqual([a]);
      expect(b).toBeTruthy();
    });

    it("migration 0063 backfill reproduces the old implicit hierarchy", async () => {
      // Legacy shape: three rows sharing a type, no parent_id. The oldest is
      // what the old dashboard showed as the main category.
      const t = `${TAG}legacy-${Date.now()}`;
      const mk = (name: string, offsetMs: number, deleted = false) =>
        db
          .insert(schema.category)
          .values({
            name: `${TAG}${name}`,
            slug: `${TAG}${name.toLowerCase()}`,
            type: t,
            deleted,
            createdAt: new Date(Date.UTC(2026, 0, 1) + offsetMs),
          })
          .returning()
          .then((r) => r[0]!);
      const oldDeleted = await mk("Gone", 0, true);
      const main = await mk("Belly", 1000);
      const sub = await mk("BellyRings", 2000);

      const sqlText = readFileSync(
        path.resolve(__dirname, "../../../shared/database/migrations/0063_category_hierarchy.sql"),
        "utf-8",
      );
      const backfill = sqlText.split("--> statement-breakpoint").pop()!;
      await db.execute(sql.raw(backfill));
      // Idempotent: a second run changes nothing.
      await db.execute(sql.raw(backfill));

      const rows = await db
        .select({ id: schema.category.id, parentId: schema.category.parentId })
        .from(schema.category)
        .where(and(eq(schema.category.type, t)));
      const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
      expect(parentOf.get(main.id)).toBeNull();
      expect(parentOf.get(sub.id)).toBe(main.id);
      expect(parentOf.get(oldDeleted.id)).toBe(main.id);
    });
  });
});
