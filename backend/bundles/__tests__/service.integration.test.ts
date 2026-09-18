import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Runs against a real, disposable Postgres and is skipped when
 * TEST_DATABASE_URL is unset — same convention as the other
 * *.integration.test.ts files (see docs/MARKETING_SUITE_PLAN.md).
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("bundle campaign service (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let service: typeof import("#root/backend/bundles/service");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "bundle-it-";
  let vendorId: string;
  let categoryId: string;
  let fileId: string;
  let productIds: string[] = [];
  let deletedProductId: string;

  const run = <A, E>(
    effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  const runFail = async <A, E>(
    effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
  ): Promise<string> => {
    const exit = await Effect.runPromiseExit(effect.pipe(provideDatabase({ db: db as never })));
    if (exit._tag === "Success") throw new Error("expected failure");
    const failure = exit.cause;
    const err = (failure as { error?: { clientMessage?: string } }).error;
    return err?.clientMessage ?? String(failure);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    service = await import("#root/backend/bundles/service");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    const [vendor] = await db
      .insert(schema.vendor)
      .values({ name: `${TAG}vendor`, status: "active" })
      .returning();
    vendorId = vendor!.id;

    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = file!.id;

    const [category] = await db
      .insert(schema.category)
      .values({ name: `${TAG}cat`, slug: `${TAG}cat`, type: "general" })
      .returning();
    categoryId = category!.id;

    const rows = await db
      .insert(schema.product)
      .values(
        Array.from({ length: 7 }, (_, i) => ({
          name: `${TAG}product-${i}`,
          description: "it",
          imageId: fileId,
          categoryId,
          price: "100.00",
          vendorId,
          stock: 10,
          deleted: i === 6,
        })),
      )
      .returning({ id: schema.product.id, deleted: schema.product.deleted });
    productIds = rows.filter((r) => !r.deleted).map((r) => r.id);
    deletedProductId = rows.find((r) => r.deleted)!.id;
  });

  // Only ever touch rows this file created (tagged internalName / slug), so a
  // shared test database is never wiped of anything else.
  const deleteOwnCampaigns = () =>
    db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));

  beforeEach(async () => {
    await deleteOwnCampaigns();
  });

  afterAll(async () => {
    await deleteOwnCampaigns();
    await db.delete(schema.product).where(inArray(schema.product.id, [...productIds, deletedProductId]));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
    await db.delete(schema.vendor).where(eq(schema.vendor.id, vendorId));
  });

  const base = () => ({
    internalName: `${TAG}stack`,
    title: "Build Your Stack",
    slug: `${TAG}build-your-stack`,
    requiredQuantity: 6,
    fixedBundlePrice: 480,
    eligibleProductIds: productIds,
  });

  it("creates a campaign with its pool, derives the slug and reads it back with product details", async () => {
    const { slug: _omitted, ...withoutSlug } = base();
    const created = await run(service.createBundleCampaign(service.createBundleCampaignSchema.parse(withoutSlug)));
    expect(created.slug).toBe("build-your-stack");
    expect(created.state).toBe("inactive");
    expect(created.fixedBundlePrice).toBe(480);
    expect(created.eligibleProductCount).toBe(6);
    expect(created.eligibleProducts.map((p) => p.productId)).toEqual(productIds);
    expect(created.eligibleProducts[0]).toMatchObject({ price: 100, deleted: false });

    const fetched = await run(service.getBundleCampaign(created.id));
    expect(fetched.id).toBe(created.id);
  });

  it("rejects a duplicate slug", async () => {
    await run(service.createBundleCampaign(service.createBundleCampaignSchema.parse(base())));
    const message = await runFail(
      service.createBundleCampaign(service.createBundleCampaignSchema.parse({ ...base(), internalName: `${TAG}second` })),
    );
    expect(message).toMatch(/already used/);
  });

  it("rejects eligible products that are deleted or do not exist", async () => {
    const deleted = await runFail(
      service.createBundleCampaign(
        service.createBundleCampaignSchema.parse({ ...base(), eligibleProductIds: [...productIds, deletedProductId] }),
      ),
    );
    expect(deleted).toMatch(/no longer exist/);

    const missing = await runFail(
      service.createBundleCampaign(
        service.createBundleCampaignSchema.parse({
          ...base(),
          eligibleProductIds: ["00000000-0000-4000-8000-0000000000ff"],
        }),
      ),
    );
    expect(missing).toMatch(/no longer exist/);
  });

  it("saves a draft with an empty pool but refuses to activate it until the pool can complete a bundle", async () => {
    const draft = await run(
      service.createBundleCampaign(service.createBundleCampaignSchema.parse({ ...base(), eligibleProductIds: [] })),
    );
    expect(draft.eligibleProductCount).toBe(0);

    const refused = await runFail(service.setBundleCampaignActive(draft.id, true));
    expect(refused).toMatch(/at least one eligible product/);

    const tooFew = await runFail(
      service.updateBundleCampaign({ id: draft.id, isActive: true, eligibleProductIds: productIds.slice(0, 5) }),
    );
    expect(tooFew).toMatch(/at least 6 eligible products/);

    const activated = await run(
      service.updateBundleCampaign({ id: draft.id, isActive: true, eligibleProductIds: productIds }),
    );
    expect(activated.state).toBe("active");
  });

  it("re-checks the schedule against the merged row on update", async () => {
    const created = await run(
      service.createBundleCampaign(
        service.createBundleCampaignSchema.parse({ ...base(), startsAt: "2026-10-01T00:00:00Z" }),
      ),
    );
    const message = await runFail(
      service.updateBundleCampaign({ id: created.id, endsAt: new Date("2026-09-01T00:00:00Z") }),
    );
    expect(message).toMatch(/after the start/);
  });

  it("replaces the pool in order and drops maxPerProduct when duplicates are turned off", async () => {
    const created = await run(
      service.createBundleCampaign(
        service.createBundleCampaignSchema.parse({ ...base(), allowDuplicates: true, maxPerProduct: 2 }),
      ),
    );
    expect(created.maxPerProduct).toBe(2);

    const reordered = [...productIds].reverse().slice(0, 3);
    const updated = await run(
      service.updateBundleCampaign({ id: created.id, allowDuplicates: false, eligibleProductIds: reordered }),
    );
    expect(updated.maxPerProduct).toBeNull();
    expect(updated.eligibleProducts.map((p) => p.productId)).toEqual(reordered);
    expect(updated.eligibleProducts.map((p) => p.sortOrder)).toEqual([0, 1, 2]);
  });

  it("only lists live campaigns publicly and hides deleted/hidden products from the shopper pool", async () => {
    const live = await run(
      service.createBundleCampaign(
        service.createBundleCampaignSchema.parse({ ...base(), slug: `${TAG}live`, isActive: true }),
      ),
    );
    await run(
      service.createBundleCampaign(
        service.createBundleCampaignSchema.parse({
          ...base(),
          slug: `${TAG}scheduled`,
          isActive: true,
          startsAt: "2099-01-01T00:00:00Z",
        }),
      ),
    );
    await run(service.createBundleCampaign(service.createBundleCampaignSchema.parse({ ...base(), slug: `${TAG}draft` })));

    // Hide one product after the fact — the admin view still lists it (flagged), the public view doesn't.
    await db.update(schema.product).set({ hidden: true }).where(eq(schema.product.id, productIds[0]!));
    try {
      const publicList = await run(service.listLiveBundleCampaigns());
      expect(publicList.map((c) => c.slug)).toEqual([`${TAG}live`]);
      expect(publicList[0]!.eligibleProductCount).toBe(5);

      const adminView = await run(service.getBundleCampaign(live.id));
      expect(adminView.eligibleProductCount).toBe(6);
      expect(adminView.eligibleProducts.find((p) => p.productId === productIds[0])?.hidden).toBe(true);

      const bySlug = await run(service.getLiveBundleCampaignBySlug(`${TAG}live`));
      expect(bySlug.id).toBe(live.id);
      expect(await runFail(service.getLiveBundleCampaignBySlug(`${TAG}draft`))).toMatch(/not found/);

      const all = (await run(service.listAllBundleCampaigns())).filter((c) => c.internalName.startsWith(TAG));
      expect(all.map((c) => c.state).sort()).toEqual(["active", "inactive", "scheduled"]);
    } finally {
      await db.update(schema.product).set({ hidden: false }).where(eq(schema.product.id, productIds[0]!));
    }
  });

  it("deletes a campaign and cascades its pool rows", async () => {
    const created = await run(service.createBundleCampaign(service.createBundleCampaignSchema.parse(base())));
    await run(service.deleteBundleCampaign(created.id));
    const pool = await db
      .select()
      .from(schema.bundleCampaignProduct)
      .where(eq(schema.bundleCampaignProduct.bundleCampaignId, created.id));
    expect(pool).toHaveLength(0);
    expect(await runFail(service.getBundleCampaign(created.id))).toMatch(/not found/);
  });
});
