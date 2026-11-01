import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * `requiresOptions` on storefront search results, against a real Postgres.
 *
 * Product cards add to the bag straight from a listing only when there is
 * nothing to choose; a product with any option group (`product_variant`
 * row) is sent to its page instead. The flag must follow the shared rule
 * (shared/products/options.ts `requiresOptionSelection`) for every item of
 * a page, from one batched read.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("searchProducts — requiresOptions (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let searchProducts: typeof import("#root/backend/products/search-products/service").searchProducts;
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "reqopt-it-";
  const MATCH = "Reqoptpiece";
  let fileId: string;
  let categoryId: string;
  let plainId: string;
  let optionsId: string;

  const run = <A, E>(
    effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  const cleanup = async () => {
    const ids = (
      await db.select({ id: schema.product.id }).from(schema.product).where(like(schema.product.name, `${TAG}%`))
    ).map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(schema.productVariant).where(inArray(schema.productVariant.productId, ids));
      await db.delete(schema.product).where(inArray(schema.product.id, ids));
    }
    await db.delete(schema.category).where(like(schema.category.slug, `${TAG}%`));
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    ({ searchProducts } = await import("#root/backend/products/search-products/service"));
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db
      .insert(schema.vendor)
      .values({ id: storeOwner, name: `${TAG}store`, status: "active" })
      .onConflictDoNothing();
    await cleanup();

    const [f] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = f!.id;
    const [cat] = await db
      .insert(schema.category)
      .values({ name: `${TAG}Ear`, slug: `${TAG}ear`, type: "general" })
      .returning();
    categoryId = cat!.id;

    const base = { description: "a piece", imageId: fileId, categoryId, price: "100.00", vendorId: storeOwner, stock: 5 };
    const [plain] = await db
      .insert(schema.product)
      .values({ ...base, name: `${TAG}${MATCH} plain`, slug: `${TAG}plain` })
      .returning({ id: schema.product.id });
    const [withOptions] = await db
      .insert(schema.product)
      .values({ ...base, name: `${TAG}${MATCH} options`, slug: `${TAG}options` })
      .returning({ id: schema.product.id });
    plainId = plain!.id;
    optionsId = withOptions!.id;
    await db.insert(schema.productVariant).values({
      productId: optionsId,
      name: "Colour",
      values: [{ value: "Gold" }, { value: "Silver" }],
    });
  });

  afterAll(async () => {
    await cleanup();
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  it("flags only the product that has option groups", async () => {
    const res = await run(searchProducts({ search: MATCH, limit: 20, offset: 0, includeOutOfStock: true }));
    const byId = new Map(res.items.map((item) => [item.id, item.requiresOptions]));
    expect(byId.get(optionsId)).toBe(true);
    expect(byId.get(plainId)).toBe(false);
  });
});
