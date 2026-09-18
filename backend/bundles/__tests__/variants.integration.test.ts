import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Phase 7 — variant awareness in the bundle SERVICE (DTOs, capacity, tier
 * availability, CMS preview, listing shape) against a real Postgres. Skipped
 * when TEST_DATABASE_URL is unset.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("bundle service — variants (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let service: typeof import("#root/backend/bundles/service");
  let optionLoader: typeof import("#root/backend/products/option-groups");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "bundle-variant-it-";
  let vendorId: string;
  let categoryId: string;
  let fileId: string;
  /** S simple; V "Flower Stud" Color Gold(+20)/Silver; W "Hoop" Size 6mm/8mm(+10). */
  let S: string;
  let V: string;
  let W: string;

  const run = <A, E>(effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>) =>
    Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));
  const runFail = async <A, E>(
    effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
  ): Promise<string> => {
    const exit = await Effect.runPromiseExit(effect.pipe(provideDatabase({ db: db as never })));
    if (exit._tag === "Success") throw new Error("expected failure");
    const err = (exit.cause as { error?: { clientMessage?: string } }).error;
    return err?.clientMessage ?? String(exit.cause);
  };

  const setStrikethrough = (map: Record<string, string[]>) =>
    db
      .update(schema.storeSettings)
      .set({
        variantPresets: Object.entries(map).map(([name, strikethroughValues], i) => ({
          id: `preset-${i}`,
          name,
          values: strikethroughValues.map((value) => ({ value })),
          strikethroughValues,
        })),
      })
      .where(eq(schema.storeSettings.key, "default"));

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    service = await import("#root/backend/bundles/service");
    optionLoader = await import("#root/backend/products/option-groups");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    const [vendor] = await db.insert(schema.vendor).values({ name: `${TAG}vendor`, status: "active" }).returning();
    vendorId = vendor!.id;
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = file!.id;
    const [category] = await db.insert(schema.category).values({ name: `${TAG}cat`, slug: `${TAG}cat`, type: "general" }).returning();
    categoryId = category!.id;
    const rows = await db
      .insert(schema.product)
      .values(
        ["Star Stud", "Flower Stud", "Hoop"].map((name) => ({
          name: `${TAG}${name}`,
          description: "it",
          imageId: fileId,
          categoryId,
          price: "100.00",
          vendorId,
          stock: 4,
        })),
      )
      .returning({ id: schema.product.id });
    [S, V, W] = rows.map((r) => r.id) as [string, string, string];
    await db.insert(schema.productVariant).values([
      { productId: V, name: "Color", values: [{ value: "Gold", priceModifier: 20 }, { value: "Silver" }] },
      { productId: W, name: "Size", values: [{ value: "6mm" }, { value: "8mm", priceModifier: 10 }] },
    ]);
    await db.insert(schema.storeSettings).values({ key: "default", variantPresets: [] }).onConflictDoNothing();
  });

  beforeEach(async () => {
    await db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));
    await db.update(schema.product).set({ stock: 4 }).where(inArray(schema.product.id, [S, V, W]));
    await setStrikethrough({});
  });

  afterAll(async () => {
    await db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));
    await setStrikethrough({});
    await db.delete(schema.product).where(inArray(schema.product.id, [S, V, W]));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
    await db.delete(schema.vendor).where(eq(schema.vendor.id, vendorId));
  });

  const createBys = (overrides: Record<string, unknown> = {}) =>
    run(
      service.createBundleCampaign(
        service.createBundleCampaignSchema.parse({
          internalName: `${TAG}stack`,
          title: "Build Your Stack",
          slug: `${TAG}stack`,
          isActive: true,
          allowDuplicates: true,
          maxPerProduct: 2,
          tiers: [
            { quantity: 3, price: 250 },
            { quantity: 6, price: 480 },
          ],
          eligibleProductIds: [S, V, W],
          ...overrides,
        }),
      ),
    );

  it("loads option groups batched, with store-wide strikethrough applied and product overrides honoured", async () => {
    await setStrikethrough({ color: ["Gold"] });
    const groups = await optionLoader.loadPurchasableOptionGroups(db as never, [S, V, W, V]);
    expect(groups.has(S)).toBe(false);
    expect(groups.get(V)).toEqual([
      { name: "Color", values: [{ value: "Gold", priceModifier: 20, available: false }, { value: "Silver", priceModifier: 0, available: true }] },
    ]);
    expect(groups.get(W)?.[0]?.values.map((v) => v.available)).toEqual([true, true]);
  });

  it("public detail carries option groups per pool product; card listings do not hydrate them", async () => {
    await createBys();
    const detail = await run(service.getLiveBundleCampaignBySlug(`${TAG}stack`));
    const v = detail!.eligibleProducts.find((p) => p.productId === V)!;
    expect(v.optionGroups).toEqual([
      { name: "Color", values: [{ value: "Gold", priceModifier: 20, available: true }, { value: "Silver", priceModifier: 0, available: true }] },
    ]);
    expect(v.unitPrice).toBe(100);
    expect(v.purchasable).toBe(true);
    expect(detail!.eligibleProducts.find((p) => p.productId === S)).toMatchObject({ optionGroups: [], selectedOptions: null, purchasable: true });

    const cards = await run(service.listLiveBundleCampaigns({}));
    const card = cards.find((c) => c.slug === `${TAG}stack`)!;
    expect(card.eligibleProducts).toEqual([]);
    expect(card.eligibleProductCount).toBe(3);
    expect(card.availability).toBe(detail!.availability);
  });

  it("capacity and per-tier availability count variant products by PRODUCT stock, capped per product", async () => {
    await createBys();
    // S 4, V 4, W 4 → each capped at maxPerProduct 2 → capacity 6: both tiers open.
    let dto = await run(service.getLiveBundleCampaignBySlug(`${TAG}stack`));
    expect(dto!.tiers.map((t) => t.availability)).toEqual(["available", "available"]);
    // V's options leave nothing sellable → V contributes 0 → capacity 4: only the 3-tier.
    await setStrikethrough({ Color: ["Gold", "Silver"] });
    dto = await run(service.getLiveBundleCampaignBySlug(`${TAG}stack`));
    expect(dto!.eligibleProducts.find((p) => p.productId === V)?.purchasable).toBe(false);
    expect(dto!.tiers.map((t) => t.availability)).toEqual(["available", "sold_out"]);
    expect(dto!.availability).toBe("available");
    // …and one product lifting the strikethrough restores it.
    await db
      .update(schema.productVariant)
      .set({ values: [{ value: "Gold", priceModifier: 20, enabledOverride: true }, { value: "Silver" }] })
      .where(eq(schema.productVariant.productId, V));
    dto = await run(service.getLiveBundleCampaignBySlug(`${TAG}stack`));
    expect(dto!.tiers.map((t) => t.availability)).toEqual(["available", "available"]);
    await db
      .update(schema.productVariant)
      .set({ values: [{ value: "Gold", priceModifier: 20 }, { value: "Silver" }] })
      .where(eq(schema.productVariant.productId, V));
  });

  it("the CMS preview reports the same capacity the storefront uses", async () => {
    await setStrikethrough({ Color: ["Gold", "Silver"] });
    const preview = await run(
      service.previewBundleEligibility(
        service.previewBundleEligibilitySchema.parse({
          manualProductIds: [S, V, W],
          allowDuplicates: true,
          maxPerProduct: 2,
          requiredQuantity: 3,
          tiers: [
            { quantity: 3, price: 250 },
            { quantity: 6, price: 480 },
          ],
        }),
      ),
    );
    expect(preview.availableCapacity).toBe(4);
    expect(preview.purchasableProductCount).toBe(2);
    expect(preview.tiers.map((t) => t.availability)).toEqual(["available", "sold_out"]);
    expect(preview.sample.find((p) => p.productId === V)?.purchasable).toBe(false);
  });

  it("BYS eligibility stays product-level: a pool row never stores options", async () => {
    await createBys();
    const rows = await db.select({ selectedOptions: schema.bundleCampaignProduct.selectedOptions }).from(schema.bundleCampaignProduct);
    expect(rows.every((r) => r.selectedOptions === null)).toBe(true);
  });

  it("curated: composition options persist, price with modifiers, and an invalid pairing is refused", async () => {
    const created = await run(
      service.createBundleCampaign(
        service.createBundleCampaignSchema.parse({
          internalName: `${TAG}curated`,
          title: "Golden Set",
          slug: `${TAG}golden-set`,
          type: "curated_stack",
          fixedBundlePrice: 200,
          isActive: true,
          composition: [
            { productId: V, quantity: 1, selectedOptions: { Color: "Gold" } },
            { productId: W, quantity: 2, selectedOptions: { Size: "8mm" } },
            { productId: S, quantity: 1 },
          ],
        }),
      ),
    );
    expect(created.eligibleProducts.map((p) => [p.selectedOptions, p.unitPrice])).toEqual([
      [{ Color: "Gold" }, 120],
      [{ Size: "8mm" }, 110],
      [null, 100],
    ]);
    expect(created.regularValue).toBe(120 + 220 + 100);
    expect(created.savings).toBe(240);

    expect(
      await runFail(
        service.createBundleCampaign(
          service.createBundleCampaignSchema.parse({
            internalName: `${TAG}curated-bad`,
            title: "Bad Set",
            slug: `${TAG}bad-set`,
            type: "curated_stack",
            fixedBundlePrice: 200,
            composition: [{ productId: V, quantity: 1, selectedOptions: { Size: "8mm" } }],
          }),
        ),
      ),
    ).toMatch(/Choose a Color/);

    // A struck-through fixed value is refused on save too.
    await setStrikethrough({ Color: ["Gold"] });
    expect(
      await runFail(service.updateBundleCampaign({ id: created.id, composition: [{ productId: V, quantity: 1, selectedOptions: { Color: "Gold" } }] })),
    ).toMatch(/unavailable in the store settings/);
    // …and it makes the stored stack unavailable without touching the stored line.
    const dto = await run(service.getBundleCampaign(created.id));
    expect(dto.availability).toBe("sold_out");
    expect(dto.eligibleProducts.find((p) => p.productId === V)).toMatchObject({ selectedOptions: { Color: "Gold" }, purchasable: false });
  });
});
