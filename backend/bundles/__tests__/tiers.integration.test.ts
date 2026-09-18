import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Phase 5 tiered pricing, end to end against a real Postgres.
 *
 * Skipped when TEST_DATABASE_URL is unset — same convention as the other
 * *.integration.test.ts files.
 *
 * The property these tests exist to protect: the SERVER decides which tier a
 * selection buys, from the selection's own unit count, re-read from the live
 * campaign on every validation. Nothing the browser sends — a price, a tier
 * id, a remembered total — is trusted.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("bundle pricing tiers (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let service: typeof import("#root/backend/bundles/service");
  let selection: typeof import("#root/backend/bundles/selection");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "bundle-tier-it-";
  let vendorId: string;
  let categoryId: string;
  let fileId: string;
  /** Eight products at 100 each. */
  let productIds: string[] = [];

  const run = <A, E>(
    effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
  ) => Effect.runPromise(effect.pipe(provideDatabase({ db: db as never })));

  const runFail = async <A, E>(
    effect: Effect.Effect<A, E, import("#root/shared/database/drizzle/db").DatabaseClientService>,
  ): Promise<string> => {
    const exit = await Effect.runPromiseExit(effect.pipe(provideDatabase({ db: db as never })));
    if (exit._tag === "Success") throw new Error("expected failure");
    const err = (exit.cause as { error?: { clientMessage?: string } }).error;
    return err?.clientMessage ?? String(exit.cause);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    schema = await import("#root/shared/database/drizzle/schema");
    db = drizzle(TEST_DB_URL!, { schema });
    service = await import("#root/backend/bundles/service");
    selection = await import("#root/backend/bundles/selection");
    ({ provideDatabase } = await import("#root/shared/trpc/server"));

    const [vendor] = await db.insert(schema.vendor).values({ name: `${TAG}vendor`, status: "active" }).returning();
    vendorId = vendor!.id;
    const [f] = await db.insert(schema.file).values({ diskname: `${TAG}img.webp` }).returning();
    fileId = f!.id;
    const [category] = await db
      .insert(schema.category)
      .values({ name: `${TAG}cat`, slug: `${TAG}cat`, type: "general" })
      .returning();
    categoryId = category!.id;

    const rows = await db
      .insert(schema.product)
      .values(
        Array.from({ length: 8 }, (_, i) => ({
          name: `${TAG}product-${i}`,
          description: "it",
          imageId: fileId,
          categoryId,
          price: "100.00",
          vendorId,
          stock: 10,
        })),
      )
      .returning({ id: schema.product.id });
    productIds = rows.map((r) => r.id);
  });

  const deleteOwnCampaigns = () =>
    db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));

  beforeEach(async () => {
    await deleteOwnCampaigns();
    await db.update(schema.product).set({ stock: 10 }).where(inArray(schema.product.id, productIds));
  });

  afterAll(async () => {
    await deleteOwnCampaigns();
    await db.delete(schema.product).where(inArray(schema.product.id, productIds));
    await db.delete(schema.category).where(eq(schema.category.id, categoryId));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
    await db.delete(schema.vendor).where(eq(schema.vendor.id, vendorId));
  });

  const LADDER = [
    { quantity: 3, price: 270 },
    { quantity: 4, price: 340 },
    { quantity: 6, price: 480 },
  ];

  const create = (input: Record<string, unknown>) =>
    run(service.createBundleCampaign(service.createBundleCampaignSchema.parse(input)));

  const tieredCampaign = (overrides: Record<string, unknown> = {}) =>
    create({
      internalName: `${TAG}stack`,
      title: "Build Your Ear Stack",
      slug: `${TAG}ear-stack`,
      tiers: LADDER,
      eligibleProductIds: productIds.slice(0, 6),
      isActive: true,
      ...overrides,
    });

  const pick = (n: number) => productIds.slice(0, n).map((productId) => ({ productId, quantity: 1 }));

  // ── Persistence ────────────────────────────────────────────────────────────

  describe("tier storage", () => {
    it("stores the ladder ascending and returns it on the DTO", async () => {
      const c = await tieredCampaign();
      expect(c.tiers.map((t) => [t.quantity, t.price])).toEqual([
        [3, 270],
        [4, 340],
        [6, 480],
      ]);
      const rows = await db
        .select()
        .from(schema.bundleCampaignTier)
        .where(eq(schema.bundleCampaignTier.bundleCampaignId, c.id))
        .orderBy(schema.bundleCampaignTier.sortOrder);
      expect(rows.map((r) => r.quantity)).toEqual([3, 4, 6]);
      expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
    });

    it("sorts an out-of-order ladder on save", async () => {
      const c = await tieredCampaign({
        tiers: [
          { quantity: 6, price: 480 },
          { quantity: 3, price: 270 },
        ],
      });
      expect(c.tiers.map((t) => t.quantity)).toEqual([3, 6]);
    });

    it("mirrors the LOWEST tier onto the legacy columns so they cannot drift", async () => {
      const c = await tieredCampaign();
      expect(c.requiredQuantity).toBe(3);
      expect(c.fixedBundlePrice).toBe(270);
      const [row] = await db.select().from(schema.bundleCampaign).where(eq(schema.bundleCampaign.id, c.id));
      expect(row?.requiredQuantity).toBe(3);
      expect(Number(row?.fixedBundlePrice)).toBe(270);
    });

    it("replaces the whole ladder on update, leaving no orphan rows", async () => {
      const c = await tieredCampaign();
      const updated = await run(
        service.updateBundleCampaign({ id: c.id, tiers: [{ quantity: 5, price: 400 }] }),
      );
      expect(updated.tiers.map((t) => t.quantity)).toEqual([5]);
      const rows = await db
        .select()
        .from(schema.bundleCampaignTier)
        .where(eq(schema.bundleCampaignTier.bundleCampaignId, c.id));
      expect(rows).toHaveLength(1);
      // The legacy mirrors follow.
      expect(updated.requiredQuantity).toBe(5);
      expect(updated.fixedBundlePrice).toBe(400);
    });

    it("keeps the stored ladder when an update does not mention tiers", async () => {
      const c = await tieredCampaign();
      const updated = await run(service.updateBundleCampaign({ id: c.id, title: "Renamed" }));
      expect(updated.tiers.map((t) => t.quantity)).toEqual([3, 4, 6]);
    });

    it("refuses duplicate quantities", async () => {
      const parsed = service.createBundleCampaignSchema.safeParse({
        internalName: `${TAG}dupe`,
        title: "D",
        slug: `${TAG}dupe`,
        tiers: [
          { quantity: 3, price: 270 },
          { quantity: 3, price: 280 },
        ],
        eligibleProductIds: productIds.slice(0, 6),
      });
      expect(parsed.success).toBe(false);
      if (parsed.success) return;
      expect(parsed.error.issues.map((i) => i.message).join(" ")).toMatch(/same quantity/i);
    });

    it("refuses to activate a Build Your Stack campaign with no tiers", async () => {
      const message = await runFail(
        service.createBundleCampaign(
          service.createBundleCampaignSchema.parse({
            internalName: `${TAG}notiers`,
            title: "N",
            slug: `${TAG}notiers`,
            tiers: [],
            fixedBundlePrice: 480,
            requiredQuantity: 6,
            eligibleProductIds: productIds.slice(0, 2),
            isActive: true,
          }),
        ),
      );
      // Two products cannot complete a 6-piece stack.
      expect(message).toMatch(/smallest tier/i);
    });
  });

  // ── Legacy compatibility ───────────────────────────────────────────────────

  describe("legacy single-price campaigns", () => {
    const legacy = () =>
      create({
        internalName: `${TAG}legacy`,
        title: "Legacy Stack",
        slug: `${TAG}legacy`,
        requiredQuantity: 6,
        fixedBundlePrice: 480,
        eligibleProductIds: productIds.slice(0, 6),
        isActive: true,
      });

    it("synthesises exactly one tier from the legacy pair", async () => {
      const c = await legacy();
      expect(c.tiers.map((t) => [t.quantity, t.price])).toEqual([[6, 480]]);
      expect(c.requiredQuantity).toBe(6);
      expect(c.fixedBundlePrice).toBe(480);
    });

    it("prices and validates a 6-piece stack exactly as before", async () => {
      const c = await legacy();
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(6),
      });
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.bundle.bundleTotal).toBe(480);
      expect(check.bundle.tierQuantity).toBe(6);
    });

    it("lets a legacy caller move the price with a bare fixedBundlePrice patch", async () => {
      // Pre-Phase-5 clients patch the single price without knowing about
      // tiers. On a one-tier campaign that is unambiguous, so it moves the
      // tier rather than silently doing nothing.
      const c = await legacy();
      const updated = await run(service.updateBundleCampaign({ id: c.id, fixedBundlePrice: 450 }));
      expect(updated.tiers.map((t) => [t.quantity, t.price])).toEqual([[6, 450]]);
      expect(updated.fixedBundlePrice).toBe(450);

      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(6),
      });
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.bundle.bundleTotal).toBe(450);
    });

    it("lets a legacy caller move the quantity too", async () => {
      const c = await legacy();
      const updated = await run(service.updateBundleCampaign({ id: c.id, requiredQuantity: 4 }));
      expect(updated.tiers.map((t) => [t.quantity, t.price])).toEqual([[4, 480]]);
    });

    it("refuses a bare price patch on a MULTI-tier campaign rather than guessing", async () => {
      const c = await tieredCampaign({ slug: `${TAG}ambiguous`, internalName: `${TAG}ambiguous` });
      const message = await runFail(service.updateBundleCampaign({ id: c.id, fixedBundlePrice: 450 }));
      expect(message).toMatch(/several pricing tiers/i);
      // Nothing changed.
      const after = await run(service.getBundleCampaign(c.id));
      expect(after.tiers.map((t) => t.price)).toEqual([270, 340, 480]);
    });

    it("still refuses an incomplete stack", async () => {
      const c = await legacy();
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(5),
      });
      expect(check.ok).toBe(false);
    });
  });

  // ── Server authority ───────────────────────────────────────────────────────

  describe("server-authoritative tier resolution", () => {
    it("resolves each tier from the SELECTION's unit count", async () => {
      const c = await tieredCampaign();
      for (const [count, price] of [
        [3, 270],
        [4, 340],
        [6, 480],
      ] as const) {
        const check = await selection.loadAndValidateBundleSelection(db as never, {
          campaignId: c.id,
          requested: pick(count),
        });
        expect(check.ok).toBe(true);
        if (!check.ok) continue;
        expect(check.bundle.tierQuantity).toBe(count);
        expect(check.bundle.bundleTotal).toBe(price);
      }
    });

    it("rejects a count that sits between tiers instead of charging the tier below", async () => {
      const c = await tieredCampaign();
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(5),
      });
      expect(check.ok).toBe(false);
      if (check.ok) return;
      expect(check.code).toBe("no_matching_tier");
      expect(check.bundle).toBeNull();
    });

    it("rejects a stale price the client remembered", async () => {
      const c = await tieredCampaign();
      await run(
        service.updateBundleCampaign({
          id: c.id,
          tiers: [
            { quantity: 3, price: 270 },
            { quantity: 4, price: 340 },
            { quantity: 6, price: 520 },
          ],
        }),
      );
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(6),
        // What the shopper was shown before the merchant repriced.
        expectedBundleTotal: 480,
      });
      expect(check.ok).toBe(false);
      if (check.ok) return;
      expect(check.code).toBe("price_changed");
    });

    it("charges the CURRENT tier price when no stale total is claimed", async () => {
      const c = await tieredCampaign();
      await run(
        service.updateBundleCampaign({
          id: c.id,
          tiers: [
            { quantity: 3, price: 270 },
            { quantity: 6, price: 520 },
          ],
        }),
      );
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(6),
      });
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.bundle.bundleTotal).toBe(520);
    });

    it("rejects a selection whose tier the merchant has deleted — no fallback rung", async () => {
      const c = await tieredCampaign();
      await run(
        service.updateBundleCampaign({
          id: c.id,
          tiers: [
            { quantity: 3, price: 270 },
            { quantity: 4, price: 340 },
          ],
        }),
      );
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(6),
      });
      expect(check.ok).toBe(false);
      if (check.ok) return;
      // 6 is now above the largest rung — never repriced onto the 4-tier.
      expect(["no_matching_tier", "too_many_units"]).toContain(check.code);
    });

    it("derives the tier id itself; a client cannot nominate one", async () => {
      const c = await tieredCampaign();
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(4),
      });
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      const [realTier] = await db
        .select()
        .from(schema.bundleCampaignTier)
        .where(
          and(
            eq(schema.bundleCampaignTier.bundleCampaignId, c.id),
            eq(schema.bundleCampaignTier.quantity, 4),
          ),
        );
      // The id comes from the row the server matched, not from any input:
      // `loadAndValidateBundleSelection` has no parameter to supply one.
      expect(check.bundle.tierId).toBe(realTier!.id);
    });

    it("rejects a product outside the eligible pool regardless of the count", async () => {
      const c = await tieredCampaign();
      const outsider = productIds[7]!;
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: [...pick(2), { productId: outsider, quantity: 1 }],
      });
      expect(check.ok).toBe(false);
      if (check.ok) return;
      expect(check.code).toBe("product_not_eligible");
    });
  });

  // ── Availability ───────────────────────────────────────────────────────────

  describe("per-tier and campaign availability", () => {
    it("marks only the reachable rungs available and keeps the campaign available", async () => {
      // Four eligible products, duplicates off: 3 and 4 complete, 6 does not.
      const c = await tieredCampaign({ eligibleProductIds: productIds.slice(0, 4) });
      expect(c.tiers.map((t) => [t.quantity, t.availability])).toEqual([
        [3, "available"],
        [4, "available"],
        [6, "sold_out"],
      ]);
      expect(c.availability).toBe("available");
    });

    it("is sold out only when no rung can be completed", async () => {
      const c = await tieredCampaign();
      await db
        .update(schema.product)
        .set({ stock: 0 })
        .where(inArray(schema.product.id, productIds.slice(0, 6)));
      const after = await run(service.getBundleCampaign(c.id));
      expect(after.availability).toBe("sold_out");
      expect(after.state).toBe("active");
      expect(after.tiers.every((t) => t.availability === "sold_out")).toBe(true);
    });

    it("opens every rung when duplicates lift capacity", async () => {
      const c = await tieredCampaign({
        eligibleProductIds: [productIds[0]!],
        allowDuplicates: true,
      });
      expect(c.tiers.every((t) => t.availability === "available")).toBe(true);
    });

    it("closes rungs that max-per-product puts out of reach", async () => {
      const c = await tieredCampaign({
        eligibleProductIds: [productIds[0]!, productIds[1]!],
        allowDuplicates: true,
        maxPerProduct: 2,
      });
      // Capacity 4 → 3 and 4 reachable, 6 not.
      expect(c.tiers.map((t) => t.availability)).toEqual(["available", "available", "sold_out"]);
    });

    it("gives each tier its own value range", async () => {
      const c = await tieredCampaign();
      expect(c.tiers.find((t) => t.quantity === 3)?.valueRange).toEqual({ min: 300, max: 300 });
      expect(c.tiers.find((t) => t.quantity === 6)?.valueRange).toEqual({ min: 600, max: 600 });
    });

    it("reports no value range for a rung the pool cannot fill", async () => {
      const c = await tieredCampaign({ eligibleProductIds: productIds.slice(0, 4) });
      expect(c.tiers.find((t) => t.quantity === 6)?.valueRange).toBeNull();
    });
  });

  // ── Dynamic eligibility interaction ────────────────────────────────────────

  describe("tiers operate on the Phase 4 effective pool", () => {
    it("fills tier capacity from dynamically matched products", async () => {
      const c = await tieredCampaign({
        eligibilityMode: "dynamic",
        eligibilityCategoryIds: [categoryId],
        eligibilityMinPrice: 100,
        eligibilityMaxPrice: 100,
        eligibleProductIds: [],
      });
      // All eight products match the rule, so every rung is reachable.
      expect(c.eligibleProductCount).toBe(8);
      expect(c.tiers.every((t) => t.availability === "available")).toBe(true);
    });

    it("validates a stack built entirely from dynamic matches", async () => {
      const c = await tieredCampaign({
        eligibilityMode: "dynamic",
        eligibilityCategoryIds: [categoryId],
        eligibilityMinPrice: 100,
        eligibilityMaxPrice: 100,
        eligibleProductIds: [],
      });
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(4),
      });
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.bundle.bundleTotal).toBe(340);
    });

    it("works in hybrid mode too", async () => {
      const c = await tieredCampaign({
        eligibilityMode: "hybrid",
        eligibleProductIds: [productIds[0]!],
        eligibilityCategoryIds: [categoryId],
        eligibilityMinPrice: 100,
        eligibilityMaxPrice: 100,
      });
      expect(c.eligibleProductCount).toBe(8);
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(3),
      });
      expect(check.ok).toBe(true);
    });
  });

  // ── Curated regression ─────────────────────────────────────────────────────

  describe("curated stacks are untouched by tiered pricing", () => {
    const curated = () =>
      create({
        internalName: `${TAG}curated`,
        title: "Golden Ear Stack",
        slug: `${TAG}curated`,
        type: "curated_stack",
        fixedBundlePrice: 550,
        composition: [
          { productId: productIds[0]!, quantity: 1 },
          { productId: productIds[1]!, quantity: 1 },
          { productId: productIds[2]!, quantity: 2 },
        ],
        isActive: true,
      });

    it("stores NO tier rows", async () => {
      const c = await curated();
      const rows = await db
        .select()
        .from(schema.bundleCampaignTier)
        .where(eq(schema.bundleCampaignTier.bundleCampaignId, c.id));
      expect(rows).toHaveLength(0);
    });

    it("ignores tiers sent by a caller", async () => {
      const c = await create({
        internalName: `${TAG}curated2`,
        title: "C2",
        slug: `${TAG}curated2`,
        type: "curated_stack",
        fixedBundlePrice: 550,
        tiers: LADDER,
        composition: [{ productId: productIds[0]!, quantity: 4 }],
        isActive: true,
      });
      const rows = await db
        .select()
        .from(schema.bundleCampaignTier)
        .where(eq(schema.bundleCampaignTier.bundleCampaignId, c.id));
      expect(rows).toHaveLength(0);
      expect(c.fixedBundlePrice).toBe(550);
    });

    it("exposes exactly one synthetic tier describing its composition", async () => {
      const c = await curated();
      expect(c.tiers).toHaveLength(1);
      expect(c.tiers[0]).toMatchObject({ id: null, quantity: 4, price: 550 });
    });

    it("keeps its composition, price and composition-based availability", async () => {
      const c = await curated();
      expect(c.requiredQuantity).toBe(4);
      expect(c.unitCount).toBe(4);
      expect(c.availability).toBe("available");

      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: [{ productId: productIds[7]!, quantity: 9 }],
      });
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.bundle.bundleTotal).toBe(550);
      expect(check.bundle.items.map((i) => i.quantity)).toEqual([1, 1, 2]);
      expect(check.bundle.tierId).toBeNull();
    });

    it("goes sold out from its composition, not from any tier capacity", async () => {
      const c = await curated();
      await db.update(schema.product).set({ stock: 1 }).where(eq(schema.product.id, productIds[2]!));
      const after = await run(service.getBundleCampaign(c.id));
      expect(after.availability).toBe("sold_out");
    });
  });

  // ── CMS preview ────────────────────────────────────────────────────────────

  describe("previewBundleEligibility reports per-tier economics", () => {
    it("returns each rung's price, availability and value range", async () => {
      const preview = await run(
        service.previewBundleEligibility(
          service.previewBundleEligibilitySchema.parse({
            eligibilityMode: "manual",
            manualProductIds: productIds.slice(0, 4),
            tiers: LADDER,
            requiredQuantity: 3,
          }),
        ),
      );
      expect(preview.tiers.map((t) => [t.quantity, t.availability])).toEqual([
        [3, "available"],
        [4, "available"],
        [6, "sold_out"],
      ]);
      expect(preview.canCompleteStack).toBe(true);
      expect(preview.configError).toBeNull();
      expect(preview.tiers.find((t) => t.quantity === 3)?.valueRange).toEqual({ min: 300, max: 300 });
    });

    it("flags a pool too small for even the smallest rung", async () => {
      const preview = await run(
        service.previewBundleEligibility(
          service.previewBundleEligibilitySchema.parse({
            eligibilityMode: "manual",
            manualProductIds: productIds.slice(0, 2),
            tiers: LADDER,
            requiredQuantity: 3,
          }),
        ),
      );
      expect(preview.canCompleteStack).toBe(false);
      expect(preview.configError).toMatch(/smallest tier/i);
    });
  });
});
