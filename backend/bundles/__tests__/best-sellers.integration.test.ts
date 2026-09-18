import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Phase 6 storefront Best Selling Bundles, against a real Postgres.
 *
 * The property under test: the ranking is decided by ACTUAL bundle sales, but
 * eligibility is decided by the unchanged Phase 3–5 liveness rules. A campaign
 * that sold brilliantly and has since been drafted, expired, scheduled forward
 * or deleted must never reach the storefront — however good its numbers are —
 * because the card it would render links somewhere a shopper cannot go.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("best selling bundles (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let service: typeof import("#root/backend/bundles/service");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "bundle-bestseller-it-";
  let vendorId: string;
  let categoryId: string;
  let fileId: string;
  let productIds: string[] = [];

  const run = <A, E>(
    effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    service = await import("#root/backend/bundles/service");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    const storeOwner = (await import("#root/shared/config/store")).getStoreOwnerId();
    await db
      .insert(schema.vendor)
      .values({ id: storeOwner, name: `${TAG}store`, status: "active" })
      .onConflictDoNothing();
    vendorId = storeOwner;

    const [f] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = f!.id;
    const [cat] = await db
      .insert(schema.category)
      .values({ name: `${TAG}cat`, slug: `${TAG}cat`, type: "general" })
      .returning();
    categoryId = cat!.id;

    const rows = await db
      .insert(schema.product)
      .values(
        Array.from({ length: 6 }, (_, i) => ({
          name: `${TAG}product-${i}`,
          description: "it",
          imageId: fileId,
          categoryId,
          price: "100.00",
          vendorId,
          stock: 500,
        })),
      )
      .returning({ id: schema.product.id });
    productIds = rows.map((r) => r.id);
  });

  const cleanup = async () => {
    await db.delete(schema.order).where(like(schema.order.customerEmail, `${TAG}%`));
    await db
      .delete(schema.bundleCampaign)
      .where(like(schema.bundleCampaign.internalName, `${TAG}%`));
  };

  beforeEach(async () => {
    await cleanup();
    await db.update(schema.product).set({ stock: 500 }).where(inArray(schema.product.id, productIds));
  });

  afterAll(async () => {
    await cleanup();
    await db.delete(schema.product).where(inArray(schema.product.id, productIds));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  let seq = 0;

  const createCampaign = (name: string, overrides: Record<string, unknown> = {}) =>
    run(
      service.createBundleCampaign(
        service.createBundleCampaignSchema.parse({
          internalName: `${TAG}${name}`,
          title: `Stack ${name}`,
          slug: `${TAG}${name}`,
          tiers: [{ quantity: 3, price: 270 }],
          eligibleProductIds: productIds.slice(0, 3),
          isActive: true,
          ...overrides,
        }),
      ),
    );

  /** `count` purchased instances of `campaignId`, each charged `price`, placed `daysAgo` days back. */
  async function seedSales(
    campaignId: string | null,
    slug: string,
    count: number,
    price: number,
    daysAgo = 1,
    status: "delivered" | "cancelled" = "delivered",
  ) {
    const when = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    seq += 1;
    const [orderRow] = await db
      .insert(schema.order)
      .values({
        customerName: "Best Seller Tester",
        customerEmail: `${TAG}${seq}@example.test`,
        customerPhone: "+201000000000",
        shippingAddress: "1 Test St",
        shippingCity: "Cairo",
        shippingState: "Cairo",
        shippingPostalCode: "11511",
        shippingCountry: "Egypt",
        subtotal: (price * count).toFixed(2),
        shipping: "0.00",
        tax: "0.00",
        total: (price * count).toFixed(2),
        status,
        createdAt: when,
      })
      .returning({ id: schema.order.id });

    for (let i = 0; i < count; i++) {
      seq += 1;
      await db.insert(schema.orderBundle).values({
        orderId: orderRow!.id,
        instanceId: `inst-${seq}`,
        campaignId,
        campaignSlug: slug,
        campaignTitle: slug,
        campaignType: "build_your_stack",
        requiredQuantity: 3,
        regularTotal: "300.00",
        bundleTotal: price.toFixed(2),
        offerStacking: "exclusive",
        createdAt: when,
      });
    }
  }

  const listBestSelling = (limit = 10, periodDays = 30) =>
    run(
      service.listLiveBundleCampaigns(
        service.listLiveBundleCampaignsSchema.parse({ sort: "best_selling", limit, periodDays }),
      ),
    );

  const listFeatured = (limit = 10) =>
    run(service.listLiveBundleCampaigns(service.listLiveBundleCampaignsSchema.parse({ limit })));

  const slugs = (rows: { slug: string }[]) => rows.map((r) => r.slug);

  // ── Ranking ────────────────────────────────────────────────────────────────

  describe("ranking", () => {
    it("Scenario E: orders live campaigns by bundle instances sold, descending", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const b = await createCampaign("b", { sortOrder: 1 });
      const c = await createCampaign("c", { sortOrder: 2 });
      await seedSales(a.id, a.slug, 3, 270);
      await seedSales(b.id, b.slug, 8, 270);
      await seedSales(c.id, c.slug, 5, 270);

      // CMS order is A, B, C — sales order must be B, C, A.
      expect(slugs(await listFeatured())).toEqual([a.slug, b.slug, c.slug]);
      expect(slugs(await listBestSelling())).toEqual([b.slug, c.slug, a.slug]);
    });

    it("breaks an instance tie on bundle revenue", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const b = await createCampaign("b", { sortOrder: 1 });
      await seedSales(a.id, a.slug, 4, 200);
      await seedSales(b.id, b.slug, 4, 500);

      expect(slugs(await listBestSelling())).toEqual([b.slug, a.slug]);
    });

    it("is deterministic across repeated calls when campaigns tie completely", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const b = await createCampaign("b", { sortOrder: 1 });
      await seedSales(a.id, a.slug, 4, 270);
      await seedSales(b.id, b.slug, 4, 270);

      const first = slugs(await listBestSelling());
      for (let i = 0; i < 3; i++) {
        expect(slugs(await listBestSelling())).toEqual(first);
      }
    });

    it("counts only sales inside the window", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const b = await createCampaign("b", { sortOrder: 1 });
      // B sold far more, but 60 days ago — outside a 30-day window.
      await seedSales(a.id, a.slug, 2, 270, 5);
      await seedSales(b.id, b.slug, 40, 270, 60);

      expect(slugs(await listBestSelling(10, 30))).toEqual([a.slug, b.slug]);
      // Widen the window and B's older sales come back into view.
      expect(slugs(await listBestSelling(10, 90))).toEqual([b.slug, a.slug]);
    });

    it("ignores cancelled orders, matching the admin figures", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const b = await createCampaign("b", { sortOrder: 1 });
      await seedSales(a.id, a.slug, 2, 270);
      await seedSales(b.id, b.slug, 50, 270, 1, "cancelled");

      expect(slugs(await listBestSelling())).toEqual([a.slug, b.slug]);
    });

    it("backfills unsold live campaigns in CMS order rather than returning an empty rail", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const b = await createCampaign("b", { sortOrder: 1 });

      expect(slugs(await listBestSelling())).toEqual([a.slug, b.slug]);
    });

    it("respects the limit after ranking", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const b = await createCampaign("b", { sortOrder: 1 });
      const c = await createCampaign("c", { sortOrder: 2 });
      await seedSales(a.id, a.slug, 1, 270);
      await seedSales(b.id, b.slug, 9, 270);
      await seedSales(c.id, c.slug, 5, 270);

      expect(slugs(await listBestSelling(2))).toEqual([b.slug, c.slug]);
    });
  });

  // ── Eligibility ────────────────────────────────────────────────────────────

  describe("only live campaigns may be merchandised", () => {
    it("excludes a drafted campaign however well it sold", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const drafted = await createCampaign("drafted", { sortOrder: 1 });
      await seedSales(a.id, a.slug, 1, 270);
      await seedSales(drafted.id, drafted.slug, 99, 270);

      await run(service.setBundleCampaignActive(drafted.id, false));

      expect(slugs(await listBestSelling())).toEqual([a.slug]);
    });

    it("excludes an expired campaign", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const expired = await createCampaign("expired", {
        sortOrder: 1,
        startsAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: yesterday.toISOString(),
      });
      await seedSales(a.id, a.slug, 1, 270);
      await seedSales(expired.id, expired.slug, 99, 270);

      expect(slugs(await listBestSelling())).toEqual([a.slug]);
    });

    it("excludes a campaign scheduled to start in the future", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const future = await createCampaign("future", {
        sortOrder: 1,
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await seedSales(a.id, a.slug, 1, 270);
      await seedSales(future.id, future.slug, 99, 270);

      expect(slugs(await listBestSelling())).toEqual([a.slug]);
    });

    it("Scenario D: a deleted campaign's historic sales never produce a dead storefront card", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const doomed = await createCampaign("doomed", { sortOrder: 1 });
      await seedSales(a.id, a.slug, 1, 270);
      await seedSales(doomed.id, doomed.slug, 99, 270);

      await run(service.deleteBundleCampaign(doomed.id));

      const rows = await listBestSelling();
      expect(slugs(rows)).toEqual([a.slug]);
      expect(slugs(rows)).not.toContain(`${TAG}doomed`);
    });

    it("Scenario F: a live but sold-out best seller stays visible, flagged sold out", async () => {
      const soldOut = await createCampaign("soldout", { sortOrder: 0 });
      const other = await createCampaign("other", { sortOrder: 1 });
      await seedSales(soldOut.id, soldOut.slug, 20, 270);
      await seedSales(other.id, other.slug, 2, 270);

      // Empty the pool: the campaign is still live, just not buyable.
      await db
        .update(schema.product)
        .set({ stock: 0 })
        .where(inArray(schema.product.id, productIds.slice(0, 3)));

      const rows = await listBestSelling();
      expect(slugs(rows)[0]).toBe(soldOut.slug);
      expect(rows[0]!.availability).toBe("sold_out");
      // Availability does not alter the sales ranking.
      expect(slugs(rows)).toEqual([soldOut.slug, other.slug]);
    });
  });

  // ── Manual mode is untouched ───────────────────────────────────────────────

  describe("manual merchandising is unchanged", () => {
    it("keeps explicit ids in the merchant's order, ignoring sales", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const b = await createCampaign("b", { sortOrder: 1 });
      await seedSales(b.id, b.slug, 99, 270);

      const rows = await run(
        service.listLiveBundleCampaigns(
          service.listLiveBundleCampaignsSchema.parse({ ids: [a.id, b.id] }),
        ),
      );
      expect(slugs(rows)).toEqual([a.slug, b.slug]);
    });

    it("defaults to CMS sort order when no sort is requested", async () => {
      const a = await createCampaign("a", { sortOrder: 0 });
      const b = await createCampaign("b", { sortOrder: 1 });
      await seedSales(b.id, b.slug, 99, 270);

      expect(slugs(await listFeatured())).toEqual([a.slug, b.slug]);
    });
  });
});
