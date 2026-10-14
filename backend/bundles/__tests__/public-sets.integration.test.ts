import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * The public reads behind the homepage Pick Your Set block, the /offers page
 * and the builder's filters, against a real Postgres:
 *
 *   • listLive({ type }) returns only that campaign type (Pick Your Set block
 *     and Offers ask for build_your_stack only);
 *   • the public builder read carries each pool product's live categories
 *     (primary + additional, deleted categories excluded) for filter chips;
 *   • promoCode.listPublic never exposes a private (not "show on offers
 *     page") or inactive code — the Offers page has no sign-in gate, so this
 *     flag is what keeps private codes private.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("public Pick Your Set reads (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let service: typeof import("#root/backend/bundles/service");
  let listPublicPromoCodes: typeof import("#root/backend/promo-codes/list-public/service").listPublicPromoCodes;
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "pubsets-it-";
  let vendorId: string;
  let fileId: string;
  let catEar: string;
  let catFake: string;
  let catGone: string;
  let p1: string;
  let p2: string;
  let p3: string;

  const run = <A, E>(effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>) =>
    Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  const ours = <T extends { slug: string }>(rows: T[]) => rows.filter((r) => r.slug.startsWith(TAG));

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    service = await import("#root/backend/bundles/service");
    ({ listPublicPromoCodes } = await import("#root/backend/promo-codes/list-public/service"));
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    const [vendor] = await db.insert(schema.vendor).values({ name: `${TAG}vendor`, status: "active" }).returning();
    vendorId = vendor!.id;
    const [file] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = file!.id;
    const cats = await db
      .insert(schema.category)
      .values([
        { name: `${TAG}Ear`, slug: `${TAG}ear`, type: "general" },
        { name: `${TAG}Fake Piercings`, slug: `${TAG}fake`, type: "general" },
        { name: `${TAG}Gone`, slug: `${TAG}gone`, type: "general", deleted: true },
      ])
      .returning({ id: schema.category.id });
    [catEar, catFake, catGone] = cats.map((c) => c.id) as [string, string, string];

    const products = await db
      .insert(schema.product)
      .values(
        [
          { name: `${TAG}Cuff`, categoryId: catFake },
          { name: `${TAG}Stud`, categoryId: catEar },
          { name: `${TAG}Ring`, categoryId: catGone },
        ].map((p) => ({ ...p, description: "it", imageId: fileId, price: "100.00", vendorId, stock: 10 })),
      )
      .returning({ id: schema.product.id });
    [p1, p2, p3] = products.map((p) => p.id) as [string, string, string];
    // Additional categories: the cuff is also in Ear; the stud's extra one is deleted.
    await db.insert(schema.productCategory).values([
      { productId: p1, categoryId: catEar },
      { productId: p2, categoryId: catGone },
    ]);

    await run(
      service.createBundleCampaign(
        service.createBundleCampaignSchema.parse({
          internalName: `${TAG}pick`,
          title: "Pick Your 2",
          slug: `${TAG}pick-your-2`,
          isActive: true,
          pricingType: "percentage_discount",
          tiers: [{ quantity: 2, discountPercent: 15 }],
          freeShipping: true,
          eligibleProductIds: [p1, p2, p3],
        }),
      ),
    );
    await run(
      service.createBundleCampaign(
        service.createBundleCampaignSchema.parse({
          internalName: `${TAG}ready`,
          title: "Ready Set",
          slug: `${TAG}ready-set`,
          type: "curated_stack",
          isActive: true,
          fixedBundlePrice: 180,
          composition: [
            { productId: p1, quantity: 1 },
            { productId: p2, quantity: 1 },
          ],
        }),
      ),
    );

    await db.insert(schema.promoCode).values([
      { code: `${TAG}PICK2`, discountType: "percentage", discountValue: "15", status: "active", showOnOffersPage: true, eligibleMinQuantity: 2, eligibleMaxQuantity: 2 },
      { code: `${TAG}VIPONLY`, discountType: "percentage", discountValue: "30", status: "active", showOnOffersPage: false },
      { code: `${TAG}OLD`, discountType: "percentage", discountValue: "10", status: "inactive", showOnOffersPage: true },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.promoCode).where(like(schema.promoCode.code, `${TAG}%`));
    await db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));
    await db.delete(schema.productCategory).where(inArray(schema.productCategory.productId, [p1, p2, p3]));
    await db.delete(schema.product).where(inArray(schema.product.id, [p1, p2, p3]));
    await db.delete(schema.category).where(inArray(schema.category.id, [catEar, catFake, catGone]));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
    await db.delete(schema.vendor).where(eq(schema.vendor.id, vendorId));
  });

  it("listLive({ type }) returns only that campaign type", async () => {
    const sets = ours(await run(service.listLiveBundleCampaigns({ type: "build_your_stack" })));
    expect(sets.map((c) => c.slug)).toEqual([`${TAG}pick-your-2`]);
    expect(sets[0]).toMatchObject({ pricingType: "percentage_discount", freeShipping: true });
    expect(sets[0]!.tiers.map((t) => [t.quantity, t.discountPercent])).toEqual([[2, 15]]);

    const ready = ours(await run(service.listLiveBundleCampaigns({ type: "curated_stack" })));
    expect(ready.map((c) => c.slug)).toEqual([`${TAG}ready-set`]);

    const all = ours(await run(service.listLiveBundleCampaigns({})));
    expect(all.map((c) => c.slug).sort()).toEqual([`${TAG}pick-your-2`, `${TAG}ready-set`]);
  });

  it("the public builder read carries each pool product's live categories", async () => {
    const dto = await run(service.getLiveBundleCampaignBySlug(`${TAG}pick-your-2`));
    const byId = new Map(dto.eligibleProducts.map((p) => [p.productId, (p.categories ?? []).map((c) => c.slug).sort()]));
    expect(byId.get(p1)).toEqual([`${TAG}ear`, `${TAG}fake`]);
    // The stud's additional category is deleted: only its live primary shows.
    expect(byId.get(p2)).toEqual([`${TAG}ear`]);
    // Primary category deleted → no chip for it.
    expect(byId.get(p3)).toEqual([]);
    // Card listings never pay for the pool (or its categories).
    const [card] = ours(await run(service.listLiveBundleCampaigns({ type: "build_your_stack" })));
    expect(card!.eligibleProducts).toEqual([]);
  });

  it("a Ready Set read is unchanged (no filter data attached)", async () => {
    const dto = await run(service.getLiveBundleCampaignBySlug(`${TAG}ready-set`));
    expect(dto.eligibleProducts.every((p) => p.categories === undefined)).toBe(true);
  });

  it("listPublic exposes public codes only — private and inactive codes stay hidden", async () => {
    const codes = (await run(listPublicPromoCodes())).filter((c) => c.code.startsWith(TAG));
    expect(codes.map((c) => c.code)).toEqual([`${TAG}PICK2`]);
    expect(codes[0]).toMatchObject({ discountValue: 15, eligibleMinQuantity: 2, eligibleMaxQuantity: 2 });
    // Nothing operational leaks to the storefront.
    expect(Object.keys(codes[0]!)).not.toEqual(expect.arrayContaining(["usedCount", "usageLimit", "createdBy"]));
  });
});
