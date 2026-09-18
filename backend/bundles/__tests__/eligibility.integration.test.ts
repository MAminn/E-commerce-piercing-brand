import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { Effect } from "effect";

/**
 * Phase 4 dynamic eligibility, end to end against a real Postgres.
 *
 * Skipped when TEST_DATABASE_URL is unset — same convention as the other
 * *.integration.test.ts files (see docs/MARKETING_SUITE_PLAN.md).
 *
 * The point of these tests is SERVER AUTHORITY: the resolver, not the browser
 * and not what the cart remembered, decides eligibility, and it decides it
 * again at checkout against the catalogue as it stands at that moment.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("bundle dynamic eligibility (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let schema: typeof import("#root/shared/database/drizzle/schema");
  let service: typeof import("#root/backend/bundles/service");
  let selection: typeof import("#root/backend/bundles/selection");
  let provideDatabase: typeof import("#root/shared/trpc/server").provideDatabase;

  const TAG = "bundle-elig-it-";
  let vendorId: string;
  let earCategoryId: string;
  let noseCategoryId: string;
  let lipCategoryId: string;
  let fileId: string;
  /** Ear @ 100 EGP — the products a "Category = Ear, price 100" rule should catch. */
  let earIds: string[] = [];
  /** Nose @ 100 EGP. */
  let noseIds: string[] = [];
  /** Ear @ 500 EGP — right category, outside any price band used below. */
  let expensiveEarId: string;
  /** Ear @ 100 EGP but hidden from the shop. */
  let hiddenEarId: string;
  /** Ear @ 100 EGP but soft-deleted. */
  let deletedEarId: string;
  /** Lip @ 100 EGP — never matched by an Ear rule. */
  let lipId: string;

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

  const mkProduct = async (name: string, categoryId: string, price: string, extra: Record<string, unknown> = {}) => {
    const [row] = await db
      .insert(schema.product)
      .values({
        name: `${TAG}${name}`,
        description: "it",
        imageId: fileId,
        categoryId,
        price,
        vendorId,
        stock: 10,
        ...extra,
      })
      .returning({ id: schema.product.id });
    return row!.id;
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

    const cats = await db
      .insert(schema.category)
      .values([
        { name: `${TAG}ear`, slug: `${TAG}ear`, type: "general" },
        { name: `${TAG}nose`, slug: `${TAG}nose`, type: "general" },
        { name: `${TAG}lip`, slug: `${TAG}lip`, type: "general" },
      ])
      .returning({ id: schema.category.id });
    earCategoryId = cats[0]!.id;
    noseCategoryId = cats[1]!.id;
    lipCategoryId = cats[2]!.id;

    earIds = [];
    for (let i = 0; i < 6; i++) earIds.push(await mkProduct(`ear-${i}`, earCategoryId, "100.00"));
    noseIds = [];
    for (let i = 0; i < 2; i++) noseIds.push(await mkProduct(`nose-${i}`, noseCategoryId, "100.00"));
    expensiveEarId = await mkProduct("ear-lux", earCategoryId, "500.00");
    hiddenEarId = await mkProduct("ear-hidden", earCategoryId, "100.00", { hidden: true });
    deletedEarId = await mkProduct("ear-deleted", earCategoryId, "100.00", { deleted: true });
    lipId = await mkProduct("lip-0", lipCategoryId, "100.00");
  });

  const allProductIds = () => [...earIds, ...noseIds, expensiveEarId, hiddenEarId, deletedEarId, lipId];

  const deleteOwnCampaigns = () =>
    db.delete(schema.bundleCampaign).where(like(schema.bundleCampaign.internalName, `${TAG}%`));

  beforeEach(async () => {
    await deleteOwnCampaigns();
  });

  afterAll(async () => {
    await deleteOwnCampaigns();
    await db.delete(schema.product).where(inArray(schema.product.id, allProductIds()));
    await db
      .delete(schema.category)
      .where(inArray(schema.category.id, [earCategoryId, noseCategoryId, lipCategoryId]));
    await db.delete(schema.file).where(eq(schema.file.id, fileId));
    await db.delete(schema.vendor).where(eq(schema.vendor.id, vendorId));
  });

  const base = (overrides: Record<string, unknown> = {}) => ({
    internalName: `${TAG}stack`,
    title: "Dynamic Ear Stack",
    slug: `${TAG}dynamic-ear-stack`,
    requiredQuantity: 6,
    fixedBundlePrice: 480,
    ...overrides,
  });

  const create = (input: Record<string, unknown>) =>
    run(service.createBundleCampaign(service.createBundleCampaignSchema.parse(input)));

  const dynamicEarCampaign = (overrides: Record<string, unknown> = {}) =>
    create(
      base({
        eligibilityMode: "dynamic",
        eligibilityCategoryIds: [earCategoryId],
        eligibilityMinPrice: 100,
        eligibilityMaxPrice: 100,
        isActive: true,
        ...overrides,
      }),
    );

  // ── Mode resolution ────────────────────────────────────────────────────────

  describe("effective pool resolution", () => {
    it("manual mode returns exactly the picked products, in CMS order", async () => {
      const c = await create(base({ eligibilityMode: "manual", eligibleProductIds: earIds }));
      expect(c.eligibilityMode).toBe("manual");
      expect(c.eligibleProducts.map((p) => p.productId)).toEqual(earIds);
      expect(c.manualProductCount).toBe(6);
      expect(c.dynamicProductCount).toBe(0);
    });

    it("dynamic mode returns the rule matches and no manual rows", async () => {
      const c = await dynamicEarCampaign();
      expect(c.eligibilityMode).toBe("dynamic");
      expect(c.manualProductCount).toBe(0);
      expect(c.dynamicProductCount).toBe(6);
      expect(new Set(c.eligibleProducts.map((p) => p.productId))).toEqual(new Set(earIds));
    });

    it("does not match a product outside the rule's categories", async () => {
      const c = await dynamicEarCampaign();
      expect(c.eligibleProducts.map((p) => p.productId)).not.toContain(lipId);
      expect(c.eligibleProducts.map((p) => p.productId)).not.toContain(noseIds[0]);
    });

    it("does not match a product outside the rule's price band", async () => {
      const c = await dynamicEarCampaign();
      expect(c.eligibleProducts.map((p) => p.productId)).not.toContain(expensiveEarId);
    });

    it("ORs several categories together and ANDs the price band on top", async () => {
      const c = await create(
        base({
          eligibilityMode: "dynamic",
          eligibilityCategoryIds: [earCategoryId, noseCategoryId],
          eligibilityMinPrice: 80,
          eligibilityMaxPrice: 120,
          isActive: true,
        }),
      );
      const ids = c.eligibleProducts.map((p) => p.productId);
      expect(new Set(ids)).toEqual(new Set([...earIds, ...noseIds]));
      expect(ids).not.toContain(expensiveEarId);
      expect(ids).not.toContain(lipId);
    });

    it("never resurrects a hidden or soft-deleted product (scenario: retired stock)", async () => {
      const c = await dynamicEarCampaign();
      const ids = c.eligibleProducts.map((p) => p.productId);
      expect(ids).not.toContain(hiddenEarId);
      expect(ids).not.toContain(deletedEarId);
    });

    it("hybrid is the union, manual first, with no duplicate membership (scenario B)", async () => {
      // Manual picks one ear product (also rule-matched) and one nose product
      // (never rule-matched), so the union is provably both halves.
      const manual = [earIds[0]!, noseIds[0]!];
      const c = await create(
        base({
          eligibilityMode: "hybrid",
          eligibleProductIds: manual,
          eligibilityCategoryIds: [earCategoryId],
          eligibilityMinPrice: 100,
          eligibilityMaxPrice: 100,
          isActive: true,
        }),
      );
      const ids = c.eligibleProducts.map((p) => p.productId);
      expect(ids.slice(0, 2)).toEqual(manual);
      expect(new Set(ids)).toEqual(new Set([...manual, ...earIds]));
      expect(ids.filter((id) => id === earIds[0]!)).toHaveLength(1);
      expect(c.manualProductCount).toBe(2);
      expect(c.dynamicProductCount).toBe(5);
    });

    it("returns an empty pool when the rules match nothing", async () => {
      const c = await create(
        base({
          eligibilityMode: "dynamic",
          eligibilityCategoryIds: [earCategoryId],
          eligibilityMinPrice: 9000,
          eligibilityMaxPrice: 9999,
        }),
      );
      expect(c.eligibleProductCount).toBe(0);
    });
  });

  // ── Rules take effect without editing the campaign ─────────────────────────

  describe("rules are a standing query, not a snapshot", () => {
    it("picks up a NEW matching product with no campaign edit", async () => {
      const c = await dynamicEarCampaign();
      expect(c.eligibleProductCount).toBe(6);

      const freshId = await mkProduct("ear-fresh", earCategoryId, "100.00");
      try {
        const after = await run(service.getBundleCampaign(c.id));
        expect(after.eligibleProductCount).toBe(7);
        expect(after.eligibleProducts.map((p) => p.productId)).toContain(freshId);
        // The manual pool table was NOT written to.
        const stored = await db
          .select()
          .from(schema.bundleCampaignProduct)
          .where(eq(schema.bundleCampaignProduct.bundleCampaignId, c.id));
        expect(stored).toHaveLength(0);
      } finally {
        await db.delete(schema.product).where(eq(schema.product.id, freshId));
      }
    });

    it("drops a product that is repriced out of the band", async () => {
      const c = await dynamicEarCampaign();
      const victim = earIds[0]!;
      await db.update(schema.product).set({ price: "999.00" }).where(eq(schema.product.id, victim));
      try {
        const after = await run(service.getBundleCampaign(c.id));
        expect(after.eligibleProducts.map((p) => p.productId)).not.toContain(victim);
      } finally {
        await db.update(schema.product).set({ price: "100.00" }).where(eq(schema.product.id, victim));
      }
    });

    it("drops a product moved to another category", async () => {
      const c = await dynamicEarCampaign();
      const victim = earIds[1]!;
      await db.update(schema.product).set({ categoryId: lipCategoryId }).where(eq(schema.product.id, victim));
      try {
        const after = await run(service.getBundleCampaign(c.id));
        expect(after.eligibleProducts.map((p) => p.productId)).not.toContain(victim);
      } finally {
        await db.update(schema.product).set({ categoryId: earCategoryId }).where(eq(schema.product.id, victim));
      }
    });

    it("drops a product that is hidden after the fact", async () => {
      const c = await dynamicEarCampaign();
      const victim = earIds[2]!;
      await db.update(schema.product).set({ hidden: true }).where(eq(schema.product.id, victim));
      try {
        const after = await run(service.getBundleCampaign(c.id));
        expect(after.eligibleProducts.map((p) => p.productId)).not.toContain(victim);
      } finally {
        await db.update(schema.product).set({ hidden: false }).where(eq(schema.product.id, victim));
      }
    });
  });

  // ── Server authority at cart / checkout ────────────────────────────────────

  describe("server authority", () => {
    const pick = (ids: string[]) => ids.map((productId) => ({ productId, quantity: 1 }));

    it("accepts a stack built from the dynamic pool", async () => {
      const c = await dynamicEarCampaign();
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(earIds),
      });
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.bundle.bundleTotal).toBe(480);
      expect(check.bundle.campaignType).toBe("build_your_stack");
    });

    it("accepts a product that only started matching AFTER the campaign was made", async () => {
      const c = await dynamicEarCampaign();
      const freshId = await mkProduct("ear-late", earCategoryId, "100.00");
      try {
        const check = await selection.loadAndValidateBundleSelection(db as never, {
          campaignId: c.id,
          requested: pick([freshId, ...earIds.slice(0, 5)]),
        });
        expect(check.ok).toBe(true);
      } finally {
        await db.delete(schema.product).where(eq(schema.product.id, freshId));
      }
    });

    it("rejects a product the client inserted that the rules never matched", async () => {
      const c = await dynamicEarCampaign();
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick([lipId, ...earIds.slice(0, 5)]),
      });
      expect(check.ok).toBe(false);
      if (check.ok) return;
      expect(check.code).toBe("product_not_eligible");
    });

    it("rejects a stale cart selection once the rules narrow (the core guarantee)", async () => {
      const c = await dynamicEarCampaign();
      const stack = pick(earIds);

      // Valid at the moment it entered the cart.
      const before = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: stack,
      });
      expect(before.ok).toBe(true);

      // Merchant narrows the campaign to Nose only. Nothing about the cart changed.
      await run(
        service.updateBundleCampaign({
          id: c.id,
          isActive: false,
          eligibilityCategoryIds: [noseCategoryId],
        }),
      );
      await run(service.updateBundleCampaign({ id: c.id, isActive: true, requiredQuantity: 2 }));

      const after = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: stack,
      });
      expect(after.ok).toBe(false);
      if (after.ok) return;
      expect(after.code).toBe("product_not_eligible");
    });

    it("rejects a stale selection when the product itself is repriced out of the band", async () => {
      const c = await dynamicEarCampaign();
      const victim = earIds[0]!;
      await db.update(schema.product).set({ price: "999.00" }).where(eq(schema.product.id, victim));
      try {
        const check = await selection.loadAndValidateBundleSelection(db as never, {
          campaignId: c.id,
          requested: pick(earIds),
        });
        expect(check.ok).toBe(false);
        if (check.ok) return;
        expect(check.code).toBe("product_not_eligible");
      } finally {
        await db.update(schema.product).set({ price: "100.00" }).where(eq(schema.product.id, victim));
      }
    });

    it("rejects a hidden product even though it matches the rule on paper", async () => {
      const c = await dynamicEarCampaign();
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick([hiddenEarId, ...earIds.slice(0, 5)]),
      });
      expect(check.ok).toBe(false);
      if (check.ok) return;
      // Hidden is caught as unavailable before eligibility is even consulted.
      expect(["product_unavailable", "product_not_eligible"]).toContain(check.code);
    });

    it("re-derives the bundle price from the campaign, ignoring what the client claims", async () => {
      const c = await dynamicEarCampaign();
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        requested: pick(earIds),
        expectedBundleTotal: 1,
      });
      expect(check.ok).toBe(false);
      if (check.ok) return;
      expect(check.code).toBe("price_changed");
    });
  });

  // ── Availability & activation ──────────────────────────────────────────────

  describe("availability of a dynamic pool", () => {
    it("is available when the rules match enough purchasable products", async () => {
      const c = await dynamicEarCampaign();
      expect(c.state).toBe("active");
      expect(c.availability).toBe("available");
    });

    it("computes a value range from the dynamic pool, not the (empty) manual one", async () => {
      const c = await dynamicEarCampaign();
      expect(c.valueRange).toEqual({ min: 600, max: 600 });
    });

    it("goes sold_out — not inactive — when the matched products run out of stock", async () => {
      const c = await dynamicEarCampaign();
      await db.update(schema.product).set({ stock: 0 }).where(inArray(schema.product.id, earIds));
      try {
        const after = await run(service.getBundleCampaign(c.id));
        expect(after.state).toBe("active");
        expect(after.availability).toBe("sold_out");
      } finally {
        await db.update(schema.product).set({ stock: 10 }).where(inArray(schema.product.id, earIds));
      }
    });

    it("counts capacity per product when duplicates are off", async () => {
      // 2 matching products, 6 units required, duplicates off → not completable.
      const message = await runFail(
        service.createBundleCampaign(
          service.createBundleCampaignSchema.parse(
            base({
              eligibilityMode: "dynamic",
              eligibilityCategoryIds: [noseCategoryId],
              eligibilityMinPrice: 100,
              eligibilityMaxPrice: 100,
              isActive: true,
            }),
          ),
        ),
      );
      expect(message).toMatch(/Duplicates are off/);
    });

    it("allows a small pool once duplicates are enabled", async () => {
      const c = await create(
        base({
          eligibilityMode: "dynamic",
          eligibilityCategoryIds: [noseCategoryId],
          eligibilityMinPrice: 100,
          eligibilityMaxPrice: 100,
          allowDuplicates: true,
          isActive: true,
        }),
      );
      expect(c.state).toBe("active");
      expect(c.availability).toBe("available");
    });

    it("respects max-per-product when judging capacity", async () => {
      // 2 matching products × 2 each = 4 units < 6 required.
      const message = await runFail(
        service.createBundleCampaign(
          service.createBundleCampaignSchema.parse(
            base({
              eligibilityMode: "dynamic",
              eligibilityCategoryIds: [noseCategoryId],
              eligibilityMinPrice: 100,
              eligibilityMaxPrice: 100,
              allowDuplicates: true,
              maxPerProduct: 2,
              isActive: true,
            }),
          ),
        ),
      );
      expect(message).toMatch(/max of 2 per product/);
    });

    it("refuses to activate when the rules match nothing", async () => {
      const message = await runFail(
        service.createBundleCampaign(
          service.createBundleCampaignSchema.parse(
            base({
              eligibilityMode: "dynamic",
              eligibilityCategoryIds: [earCategoryId],
              eligibilityMinPrice: 9000,
              eligibilityMaxPrice: 9999,
              isActive: true,
            }),
          ),
        ),
      );
      expect(message).toMatch(/at least one eligible product/i);
    });

    it("refuses a dynamic mode with no rules configured", () => {
      // Caught by the input schema before the service is ever reached.
      const parsed = service.createBundleCampaignSchema.safeParse(base({ eligibilityMode: "dynamic" }));
      expect(parsed.success).toBe(false);
      if (parsed.success) return;
      expect(parsed.error.issues.map((i) => i.message).join(" ")).toMatch(/at least one rule/i);
    });

    it("activates a hybrid campaign whose manual half alone would be too small", async () => {
      const c = await create(
        base({
          eligibilityMode: "hybrid",
          eligibleProductIds: [noseIds[0]!],
          eligibilityCategoryIds: [earCategoryId],
          eligibilityMinPrice: 100,
          eligibilityMaxPrice: 100,
          isActive: true,
        }),
      );
      expect(c.state).toBe("active");
      expect(c.eligibleProductCount).toBe(7);
    });
  });

  // ── CMS preview ────────────────────────────────────────────────────────────

  describe("previewBundleEligibility", () => {
    it("reports the effective pool for an unsaved hybrid configuration", async () => {
      const preview = await run(
        service.previewBundleEligibility(
          service.previewBundleEligibilitySchema.parse({
            eligibilityMode: "hybrid",
            eligibilityCategoryIds: [earCategoryId],
            eligibilityMinPrice: 100,
            eligibilityMaxPrice: 100,
            manualProductIds: [noseIds[0]!],
            requiredQuantity: 6,
          }),
        ),
      );
      expect(preview.eligibleProductCount).toBe(7);
      expect(preview.manualProductCount).toBe(1);
      expect(preview.dynamicProductCount).toBe(6);
      expect(preview.purchasableProductCount).toBe(7);
      expect(preview.canCompleteStack).toBe(true);
      expect(preview.configError).toBeNull();
    });

    it("separates a valid-but-sold-out pool from an invalid configuration", async () => {
      await db.update(schema.product).set({ stock: 0 }).where(inArray(schema.product.id, earIds));
      try {
        const preview = await run(
          service.previewBundleEligibility(
            service.previewBundleEligibilitySchema.parse({
              eligibilityMode: "dynamic",
              eligibilityCategoryIds: [earCategoryId],
              eligibilityMinPrice: 100,
              eligibilityMaxPrice: 100,
              requiredQuantity: 6,
            }),
          ),
        );
        // Six products belong to the campaign; none can be bought today.
        expect(preview.eligibleProductCount).toBe(6);
        expect(preview.purchasableProductCount).toBe(0);
        expect(preview.canCompleteStack).toBe(false);
        // Valid configuration — this is a stock problem, not a config problem.
        expect(preview.configError).toBeNull();
      } finally {
        await db.update(schema.product).set({ stock: 10 }).where(inArray(schema.product.id, earIds));
      }
    });

    it("flags a configuration that can never complete", async () => {
      const preview = await run(
        service.previewBundleEligibility(
          service.previewBundleEligibilitySchema.parse({
            eligibilityMode: "dynamic",
            eligibilityCategoryIds: [noseCategoryId],
            eligibilityMinPrice: 100,
            eligibilityMaxPrice: 100,
            requiredQuantity: 6,
          }),
        ),
      );
      expect(preview.eligibleProductCount).toBe(2);
      expect(preview.configError).toMatch(/Duplicates are off/);
    });

    it("names manual picks the storefront cannot offer", async () => {
      const preview = await run(
        service.previewBundleEligibility(
          service.previewBundleEligibilitySchema.parse({
            eligibilityMode: "manual",
            manualProductIds: [...earIds, hiddenEarId],
            requiredQuantity: 6,
          }),
        ),
      );
      expect(preview.unusableManualProducts).toEqual([
        expect.objectContaining({ productId: hiddenEarId, reason: "hidden" }),
      ]);
    });
  });

  // ── Curated regression (scenario C) ────────────────────────────────────────

  describe("curated stacks are untouched by dynamic eligibility", () => {
    const curatedBase = () => ({
      internalName: `${TAG}curated`,
      title: "Golden Ear Stack",
      slug: `${TAG}golden-ear-stack`,
      type: "curated_stack" as const,
      fixedBundlePrice: 550,
      composition: [
        { productId: earIds[0]!, quantity: 1 },
        { productId: earIds[1]!, quantity: 1 },
        { productId: earIds[2]!, quantity: 2 },
      ],
      isActive: true,
    });

    it("forces the mode back to manual and stores no rules", async () => {
      const c = await create({
        ...curatedBase(),
        eligibilityMode: "hybrid",
        eligibilityCategoryIds: [earCategoryId],
      });
      expect(c.eligibilityMode).toBe("manual");
      expect(c.eligibilityCategoryIds).toEqual([]);
      expect(c.eligibilityMinPrice).toBeNull();
      const stored = await db
        .select()
        .from(schema.bundleCampaignEligibilityCategory)
        .where(eq(schema.bundleCampaignEligibilityCategory.bundleCampaignId, c.id));
      expect(stored).toHaveLength(0);
    });

    it("keeps the exact composition, its quantities and its unit count", async () => {
      const c = await create(curatedBase());
      expect(c.requiredQuantity).toBe(4);
      expect(c.unitCount).toBe(4);
      expect(c.eligibleProducts.map((p) => [p.productId, p.quantity])).toEqual([
        [earIds[0]!, 1],
        [earIds[1]!, 1],
        [earIds[2]!, 2],
      ]);
    });

    it("prices and validates from the stored composition, ignoring what the client sends", async () => {
      const c = await create(curatedBase());
      const check = await selection.loadAndValidateBundleSelection(db as never, {
        campaignId: c.id,
        // A client trying to substitute its own contents.
        requested: [{ productId: lipId, quantity: 4 }],
      });
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.bundle.campaignType).toBe("curated_stack");
      expect(check.bundle.bundleTotal).toBe(550);
      expect(check.bundle.items.map((i) => i.productId)).toEqual([earIds[0]!, earIds[1]!, earIds[2]!]);
      expect(check.bundle.items.map((i) => i.quantity)).toEqual([1, 1, 2]);
    });

    it("derives availability from the composition, not from any rule", async () => {
      const c = await create(curatedBase());
      expect(c.availability).toBe("available");
      await db.update(schema.product).set({ stock: 1 }).where(eq(schema.product.id, earIds[2]!));
      try {
        // The 2-unit line can no longer be filled.
        const after = await run(service.getBundleCampaign(c.id));
        expect(after.availability).toBe("sold_out");
        expect(after.state).toBe("active");
      } finally {
        await db.update(schema.product).set({ stock: 10 }).where(eq(schema.product.id, earIds[2]!));
      }
    });
  });

  // ── Merchandising placement stays independent ──────────────────────────────

  describe("category placement is not category eligibility", () => {
    it("keeps the two relations in different tables with different effects", async () => {
      const c = await create(
        base({
          eligibilityMode: "dynamic",
          eligibilityCategoryIds: [earCategoryId],
          eligibilityMinPrice: 100,
          eligibilityMaxPrice: 100,
          categoryIds: [lipCategoryId],
          isActive: true,
        }),
      );
      expect(c.categoryIds).toEqual([lipCategoryId]);
      expect(c.eligibilityCategoryIds).toEqual([earCategoryId]);
      // Promoted on the Lip page…
      const onLip = await run(service.listLiveBundleCampaigns({ categoryId: lipCategoryId }));
      expect(onLip.map((x) => x.id)).toContain(c.id);
      // …but no Lip product is buyable in it.
      expect(c.eligibleProducts.map((p) => p.productId)).not.toContain(lipId);
    });
  });
});
