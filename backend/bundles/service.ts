import { query, type DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  bundleCampaign,
  bundleCampaignCategory,
  bundleCampaignEligibilityCategory,
  bundleCampaignProduct,
  bundleCampaignTier,
  category,
  file,
  product,
  type BundleCampaignRow,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import {
  BEST_SELLING_PERIOD_DAYS,
  rankBestSellingCampaignIds,
} from "#root/shared/bundles/analytics";
import { bestSellingPeriodSchema, loadBundleSalesRanking } from "./analytics";
import {
  type BundleAvailability,
  type BundleCampaignConfig,
  type BundleCampaignState,
  type BundleTier,
  type CuratedCompositionLine,
  bundlePoolCapacity,
  computeBundleAvailability,
  computeTierAvailability,
  curatedEvaluationConfig,
  curatedUnitCount,
  evaluateCuratedStack,
  getBundleCampaignState,
  lowestBundleTier,
  resolveCampaignTiers,
  sortTiers,
  validateBundleCampaignConfig,
  validateBundleCampaignSchedule,
  validateBundleTiers,
  valueRangeForTier,
} from "#root/shared/bundles/evaluate";
import {
  type BundleEligibilityMode,
  type BundleEligibilityRules,
  type EligibilitySource,
  hasAnyEligibilityRule,
  mergeEligiblePools,
  modeUsesDynamic,
  validateEligibilityRules,
} from "#root/shared/bundles/eligibility";
import {
  type CampaignEligibilitySpec,
  type DynamicPoolProduct,
  loadEligibilityCategories,
  resolveEligiblePools,
  toEligibilityRules,
} from "./eligibility";
import {
  type PurchasableOptionGroup,
  type SelectedOptions,
  hasPurchasableConfiguration,
  requiresOptionSelection,
  resolvePurchasableLinePrice,
  resolveSelectedOptions,
} from "#root/shared/products/options";
import { loadPurchasableOptionGroups } from "#root/backend/products/option-groups";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { Effect } from "effect";
import slugify from "slug";
import { z } from "zod";

// ─── Input schemas ────────────────────────────────────────────────────────────

/** Same shape as product slugs: lowercase words joined by single hyphens. */
export const bundleSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, numbers and single hyphens");

const uniqueIds = (ids: string[]) => new Set(ids).size === ids.length;

const eligibleProductsSchema = z
  .array(z.string().uuid())
  .max(500)
  .refine(uniqueIds, { message: "The same product is listed more than once" });

const selectedOptionsSchema = z.record(z.string().min(1).max(100), z.string().min(1).max(200));

const compositionSchema = z
  .array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().min(1).max(100),
      /**
       * Phase 7: the exact option configuration for this line. Required when
       * the product has option groups (validated against them on save);
       * omit/null for a simple product.
       */
      selectedOptions: selectedOptionsSchema.nullable().optional(),
    }),
  )
  .max(100)
  .refine((lines) => uniqueIds(lines.map((l) => l.productId)), {
    message: "The same product is listed more than once in the stack",
  });

export const createBundleCampaignSchema = z
  .object({
    internalName: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(255),
    /** Omit to derive from `title`. */
    slug: bundleSlugSchema.optional(),
    subtitle: z.string().trim().max(160).optional(),
    description: z.string().trim().max(2000).optional(),
    badgeText: z.string().trim().max(60).optional(),
    imageId: z.string().uuid().nullable().optional(),
    type: z.enum(["build_your_stack", "curated_stack"]).default("build_your_stack"),
    isActive: z.boolean().default(false),
    /** Build Your Stack only; a curated stack derives it from its composition. */
    requiredQuantity: z.number().int().min(1).max(100).optional(),
    pricingType: z.enum(["fixed_total"]).default("fixed_total"),
    /**
     * Curated stacks: THE price. Build Your Stack: a legacy mirror of the
     * lowest tier, derived by the service — supply `tiers` instead. Optional
     * so a tiered campaign need not send it.
     */
    fixedBundlePrice: z.number().positive().max(99_999_999).multipleOf(0.01).optional(),
    allowDuplicates: z.boolean().default(false),
    maxPerProduct: z.number().int().min(1).max(100).nullable().optional(),
    isRepeatable: z.boolean().default(false),
    offerStacking: z.enum(["exclusive", "stackable"]).default("exclusive"),
    sortOrder: z.number().int().min(0).default(0),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    /** Build Your Stack: ordered eligible pool. Position = display order in the builder. */
    eligibleProductIds: eligibleProductsSchema.default([]),
    /** Curated stack: the exact products and units the shopper buys. */
    composition: compositionSchema.default([]),
    /** Merchandising placement on category pages. Never affects eligibility or pricing. */
    categoryIds: z.array(z.string().uuid()).max(50).refine(uniqueIds).default([]),
    /**
     * Build Your Stack pricing tiers (Phase 5). Canonical when supplied.
     * Omit for a curated stack — its single price stays on `fixedBundlePrice`.
     * On `update`, OMITTING the field leaves the stored tiers untouched (which
     * is what the on/off switch relies on); an explicit array — including an
     * empty one — replaces the set, so a draft can be left with no tiers yet.
     */
    tiers: z
      .array(
        z.object({
          quantity: z.number().int().min(1).max(100),
          price: z.number().positive().max(99_999_999).multipleOf(0.01),
        }),
      )
      .max(20)
      .default([]),
    /** Build Your Stack only. Curated stacks are forced to `manual`. */
    eligibilityMode: z.enum(["manual", "dynamic", "hybrid"]).default("manual"),
    /**
     * Dynamic rule: the product's category must be one of these (values OR'd).
     * Distinct from `categoryIds`, which is merchandising placement only.
     */
    eligibilityCategoryIds: z.array(z.string().uuid()).max(50).refine(uniqueIds).default([]),
    /** Dynamic rule: inclusive bounds on the product's effective price (AND'd with the categories). */
    eligibilityMinPrice: z.number().nonnegative().max(99_999_999).multipleOf(0.01).nullable().optional(),
    eligibilityMaxPrice: z.number().nonnegative().max(99_999_999).multipleOf(0.01).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const scheduleError = validateBundleCampaignSchedule(data.startsAt ?? null, data.endsAt ?? null);
    if (scheduleError) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: scheduleError });
    }
    if (data.type === "curated_stack" && data.fixedBundlePrice === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fixedBundlePrice"], message: "A curated stack needs a fixed price." });
    }
    if (data.type === "build_your_stack") {
      const tierError = validateBundleTiers(
        data.tiers.map((t) => ({ id: null, quantity: t.quantity, price: t.price })),
        { requireAtLeastOne: false },
      );
      if (tierError) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tiers"], message: tierError });
      // Pricing must come from somewhere: tiers, or the legacy pair.
      if (data.tiers.length === 0 && data.fixedBundlePrice === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tiers"], message: "Add at least one pricing tier." });
      }
      if (data.tiers.length === 0 && data.requiredQuantity === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requiredQuantity"], message: "Required quantity is required" });
      }
    }
    if (data.type === "build_your_stack") {
      const ruleError = validateEligibilityRules(data.eligibilityMode, {
        categoryIds: data.eligibilityCategoryIds,
        minPrice: data.eligibilityMinPrice ?? null,
        maxPrice: data.eligibilityMaxPrice ?? null,
      });
      if (ruleError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["eligibilityMode"], message: ruleError });
      }
    }
    if (data.type === "build_your_stack" && data.maxPerProduct != null && !data.allowDuplicates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxPerProduct"],
        message: "Max per product only applies when duplicates are allowed",
      });
    }
  });

export type CreateBundleCampaignInput = z.infer<typeof createBundleCampaignSchema>;

/**
 * Partial update. Invariants that span several fields (schedule window, pool
 * completability, curated unit count) are re-checked in the service against
 * the MERGED row, so toggling `isActive` on its own can't activate an
 * incomplete campaign.
 */
export const updateBundleCampaignSchema = createBundleCampaignSchema
  .innerType()
  .partial()
  .extend({ id: z.string().uuid() });

export type UpdateBundleCampaignInput = z.infer<typeof updateBundleCampaignSchema>;

export const listLiveBundleCampaignsSchema = z.object({
  /** Only campaigns placed on this category (merchandising relation). */
  categoryId: z.string().uuid().optional(),
  /** Explicit picks (e.g. the homepage section); result keeps this order. */
  ids: z.array(z.string().uuid()).max(50).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  /** Include the full pool/composition. Cards don't need it; detail pages do. */
  includeProducts: z.boolean().optional(),
  /**
   * Merchandising order. `featured` (the default) is the CMS `sortOrder` the
   * merchant arranged by hand; `best_selling` re-orders the SAME live set by
   * actual bundle sales over `periodDays`. Ranking never widens or narrows
   * which campaigns are eligible — liveness is decided first, exactly as
   * before, so a draft/expired/deleted campaign can't be ranked into view.
   */
  sort: z.enum(["featured", "best_selling"]).optional(),
  /** Trailing sales window for `best_selling`, in days. Defaults to 30. */
  periodDays: bestSellingPeriodSchema.optional(),
});

export type ListLiveBundleCampaignsInput = z.infer<typeof listLiveBundleCampaignsSchema>;

// ─── Output DTOs ──────────────────────────────────────────────────────────────

export interface BundleCampaignProductSummary {
  productId: string;
  sortOrder: number;
  /** Units in a curated stack; always 1 for a build-your-stack pool row. */
  quantity: number;
  name: string;
  slug: string | null;
  /** Regular price as a number. */
  price: number;
  discountPrice: number | null;
  stock: number;
  imageUrl: string | null;
  /** Soft-deleted or hidden products stay in the pool but are flagged so the admin can act. */
  deleted: boolean;
  hidden: boolean;
  /**
   * Phase 4: whether this product is in the pool because the merchant picked
   * it or because a dynamic rule matched it. Lets the CMS explain the pool
   * without re-deriving anything client-side.
   */
  source: EligibilitySource;
  /**
   * Phase 7: the product's option groups with store-wide availability already
   * applied (empty for a simple product). What the builder renders selectors
   * from and what the CMS offers for a curated line. Loaded in one batched
   * query per DTO hydration — and stripped from card listings with the rest
   * of `eligibleProducts`.
   */
  optionGroups: PurchasableOptionGroup[];
  /** Curated composition lines only: the configuration the merchant fixed. Null otherwise. */
  selectedOptions: SelectedOptions | null;
  /**
   * The line's regular unit price: effective price plus, for a curated line,
   * its fixed options' modifiers. For a BYS pool row (no options chosen yet)
   * this is the effective price and the builder adds the shopper's choice.
   */
  unitPrice: number;
  /**
   * Can a shopper buy this line right now, options considered? False when
   * deleted/hidden, when the product has an option group with no available
   * value, or (curated) when the fixed configuration no longer resolves.
   * THE flag every capacity/availability calculation reads.
   */
  purchasable: boolean;
}

/**
 * A pricing tier as every consumer sees it. Never the raw DB row: `price` is a
 * number, and the two derived facts a storefront actually needs travel with
 * it so no caller re-derives them.
 */
export interface BundleTierDto {
  /** Row id. Null only for the synthetic tier of a curated stack. */
  id: string | null;
  quantity: number;
  price: number;
  /** Can the effective pool fill this quantity right now? Stock only — the tier still belongs to the campaign either way. */
  availability: BundleAvailability;
  /** Cheapest/dearest separately-bought value of a stack of THIS quantity. Null when the pool cannot fill it. */
  valueRange: { min: number; max: number } | null;
}

export interface BundleCampaignDto {
  id: string;
  internalName: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  badgeText: string | null;
  imageId: string | null;
  imageUrl: string | null;
  /** Campaign image, else the first pool product's image — what a card shows. */
  heroImageUrl: string | null;
  type: BundleCampaignRow["type"];
  isActive: boolean;
  /** Derived at read time from isActive + schedule. */
  state: BundleCampaignState;
  /** Derived at read time from the pool's current stock/visibility. Independent of `state`. */
  availability: BundleAvailability;
  requiredQuantity: number;
  /** Units a shopper gets: requiredQuantity for both types (curated keeps it equal to its composition). */
  unitCount: number;
  pricingType: BundleCampaignRow["pricingType"];
  /**
   * Pricing tiers, ascending by quantity. Build Your Stack: the campaign's
   * real prices. Curated stack: exactly one synthetic tier describing its
   * composition, so consumers never need a second code path.
   */
  tiers: BundleTierDto[];
  /**
   * LEGACY COMPATIBILITY, Build Your Stack only. Mirrors of the lowest tier,
   * rewritten by the service on every save so they can never disagree with
   * `tiers`. They describe the whole campaign ONLY when it has one tier —
   * read `tiers` for anything else. For a curated stack `fixedBundlePrice`
   * remains the authoritative price.
   */
  fixedBundlePrice: number | null;
  /** Curated only: Σ CURRENT effective prices × quantity of the composition. Null for build-your-stack. */
  regularValue: number | null;
  /** Curated only: regularValue − fixedBundlePrice (may be ≤ 0 — shown truthfully, never inflated). */
  savings: number | null;
  /** Build-your-stack only: value range of the LOWEST tier. Per-tier ranges live on `tiers`. */
  valueRange: { min: number; max: number } | null;
  allowDuplicates: boolean;
  maxPerProduct: number | null;
  isRepeatable: boolean;
  offerStacking: BundleCampaignRow["offerStacking"];
  sortOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  categoryIds: string[];
  /**
   * Size of the EFFECTIVE pool (manual + dynamic, deduplicated) — or the
   * composition's line count for a curated stack. Always populated, even on
   * card listings that omit `eligibleProducts`.
   */
  eligibleProductCount: number;
  /** Pool (build-your-stack) or composition (curated). Empty on card listings that opt out. */
  eligibleProducts: BundleCampaignProductSummary[];
  /** Phase 4. Always `manual` for a curated stack. */
  eligibilityMode: BundleEligibilityMode;
  /** Dynamic rule: eligible categories (OR). NOT the merchandising `categoryIds`. */
  eligibilityCategoryIds: string[];
  /** Dynamic rule: inclusive effective-price bounds (AND). */
  eligibilityMinPrice: number | null;
  eligibilityMaxPrice: number | null;
  /** How the effective pool breaks down — admin diagnostics, cheap to compute here. */
  manualProductCount: number;
  dynamicProductCount: number;
}

/** What the storefront receives — the admin-only label is stripped. */
export type PublicBundleCampaignDto = Omit<BundleCampaignDto, "internalName">;

type CampaignWithImage = { campaign: BundleCampaignRow; imageUrl: string | null };

function effectivePrice(p: Pick<BundleCampaignProductSummary, "price" | "discountPrice">): number {
  return p.discountPrice !== null && p.discountPrice < p.price ? p.discountPrice : p.price;
}

/** Converts a DB row + pool to the shape the pure domain rules consume. */
export function toBundleCampaignConfig(
  row: Pick<
    BundleCampaignRow,
    "type" | "requiredQuantity" | "pricingType" | "fixedBundlePrice" | "allowDuplicates" | "maxPerProduct" | "isRepeatable"
  >,
  eligibleProductIds: readonly string[],
  composition?: readonly CuratedCompositionLine[],
  /** Stored tier rows. Omit and the domain falls back to the legacy pair, which is what a pre-Phase-5 campaign needs. */
  tiers?: readonly BundleTier[],
): BundleCampaignConfig {
  return {
    type: row.type,
    requiredQuantity: row.requiredQuantity,
    pricingType: row.pricingType,
    fixedBundlePrice: row.fixedBundlePrice === null ? null : Number(row.fixedBundlePrice),
    allowDuplicates: row.type === "curated_stack" ? true : row.allowDuplicates,
    maxPerProduct: row.type === "curated_stack" ? null : row.maxPerProduct,
    isRepeatable: row.isRepeatable,
    // Curated stacks own no tier rows — curatedEvaluationConfig synthesises
    // their single tier from the composition and fixedBundlePrice.
    tiers: row.type === "curated_stack" ? [] : (tiers ?? []),
    eligibleProductIds,
    composition: row.type === "curated_stack" ? composition ?? [] : undefined,
  };
}

/** One batched query for every campaign's tiers — never one query per campaign. */
async function loadTiers(db: Db, campaignIds: string[]): Promise<Map<string, BundleTier[]>> {
  const byCampaign = new Map<string, BundleTier[]>();
  if (campaignIds.length === 0) return byCampaign;
  const rows = await db
    .select({
      id: bundleCampaignTier.id,
      campaignId: bundleCampaignTier.bundleCampaignId,
      quantity: bundleCampaignTier.quantity,
      price: bundleCampaignTier.price,
    })
    .from(bundleCampaignTier)
    .where(inArray(bundleCampaignTier.bundleCampaignId, campaignIds))
    .orderBy(asc(bundleCampaignTier.quantity));
  for (const r of rows) {
    const list = byCampaign.get(r.campaignId) ?? [];
    list.push({ id: r.id, quantity: r.quantity, price: Number(r.price) });
    byCampaign.set(r.campaignId, list);
  }
  return byCampaign;
}

/** Replaces a campaign's tiers wholesale, stored ascending by quantity. */
async function replaceTiers(
  db: Db,
  campaignId: string,
  tiers: readonly { quantity: number; price: number }[],
) {
  await db.delete(bundleCampaignTier).where(eq(bundleCampaignTier.bundleCampaignId, campaignId));
  if (tiers.length === 0) return;
  const ordered = [...tiers].sort((a, b) => a.quantity - b.quantity);
  await db.insert(bundleCampaignTier).values(
    ordered.map((tier, index) => ({
      bundleCampaignId: campaignId,
      quantity: tier.quantity,
      price: tier.price.toFixed(2),
      sortOrder: index,
    })),
  );
}

function toDto(
  row: CampaignWithImage,
  /** The EFFECTIVE pool (manual + dynamic, merged and ordered) or the curated composition. */
  products: BundleCampaignProductSummary[],
  categoryIds: string[],
  eligibilityCategoryIds: string[],
  storedTiers: BundleTier[],
  now: Date,
): BundleCampaignDto {
  const c = row.campaign;
  const composition: CuratedCompositionLine[] = products.map((p) => ({
    productId: p.productId,
    quantity: p.quantity,
    selectedOptions: p.selectedOptions,
  }));
  const config = toBundleCampaignConfig(
    c,
    products.map((p) => p.productId),
    composition,
    storedTiers,
  );
  // `purchasable` and `unitPrice` were decided once by `finalizeSummaries`
  // (options included) — nothing here re-derives them.
  const availabilityProducts = products.map((p) => ({
    productId: p.productId,
    stock: p.stock,
    purchasable: p.purchasable,
    unitPrice: p.unitPrice,
  }));

  let regularValue: number | null = null;
  let savings: number | null = null;
  let valueRange: { min: number; max: number } | null = null;
  if (c.type === "curated_stack") {
    const evaluation = evaluateCuratedStack(
      config,
      new Map(products.map((p) => [p.productId, p.unitPrice])),
    );
    regularValue = evaluation.regularTotal;
    savings = evaluation.discountAmount ?? (c.fixedBundlePrice === null ? null : evaluation.regularTotal - Number(c.fixedBundlePrice));
  }

  // Tier DTOs. For a curated stack the domain synthesises the single tier from
  // its composition, so both types expose the same `tiers` array and no
  // consumer needs a special case. Per-tier availability and value range come
  // from the shared capacity/value helpers — never recomputed per surface.
  const effectiveConfig = c.type === "curated_stack" ? curatedConfigFor(config) : config;
  const tiers: BundleTierDto[] = computeTierAvailability(effectiveConfig, availabilityProducts).map(
    ({ tier, availability }) => ({
      id: tier.id,
      quantity: tier.quantity,
      price: tier.price,
      availability,
      valueRange: valueRangeForTier(effectiveConfig, availabilityProducts, tier.quantity),
    }),
  );
  if (c.type !== "curated_stack") {
    // The campaign-level range describes the cheapest way in; per-tier ranges
    // are on `tiers`, because one range cannot describe several quantities.
    valueRange = tiers[0]?.valueRange ?? null;
  }
  const lowest = lowestBundleTier(resolveCampaignTiers(effectiveConfig));

  return {
    id: c.id,
    internalName: c.internalName,
    title: c.title,
    slug: c.slug,
    subtitle: c.subtitle,
    description: c.description,
    badgeText: c.badgeText,
    imageId: c.imageId,
    imageUrl: row.imageUrl,
    heroImageUrl: row.imageUrl ?? products.find((p) => p.imageUrl && !p.deleted && !p.hidden)?.imageUrl ?? null,
    type: c.type,
    isActive: c.isActive,
    state: getBundleCampaignState(c, now),
    availability: computeBundleAvailability(config, availabilityProducts),
    // Legacy mirrors: the lowest tier for a tiered campaign, so a consumer
    // that still reads them sees the campaign's entry point rather than a
    // stale column. `tiers` is the truth for anything multi-tier.
    requiredQuantity: c.type === "curated_stack" ? c.requiredQuantity : (lowest?.quantity ?? c.requiredQuantity),
    unitCount: c.type === "curated_stack" ? curatedUnitCount(composition) : (lowest?.quantity ?? c.requiredQuantity),
    pricingType: c.pricingType,
    tiers,
    fixedBundlePrice:
      c.type === "curated_stack"
        ? c.fixedBundlePrice === null
          ? null
          : Number(c.fixedBundlePrice)
        : (lowest?.price ?? (c.fixedBundlePrice === null ? null : Number(c.fixedBundlePrice))),
    regularValue,
    savings,
    valueRange,
    allowDuplicates: config.allowDuplicates,
    maxPerProduct: config.maxPerProduct,
    isRepeatable: c.isRepeatable,
    offerStacking: c.offerStacking,
    sortOrder: c.sortOrder,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    categoryIds,
    eligibleProductCount: products.length,
    eligibleProducts: products,
    eligibilityMode: c.type === "curated_stack" ? "manual" : c.eligibilityMode,
    eligibilityCategoryIds,
    eligibilityMinPrice: c.eligibilityMinPrice === null ? null : Number(c.eligibilityMinPrice),
    eligibilityMaxPrice: c.eligibilityMaxPrice === null ? null : Number(c.eligibilityMaxPrice),
    manualProductCount: products.filter((p) => p.source === "manual").length,
    dynamicProductCount: products.filter((p) => p.source === "dynamic").length,
  };
}

/** The config a curated stack is measured by — composition as pool, one synthetic tier. */
function curatedConfigFor(config: BundleCampaignConfig): BundleCampaignConfig {
  return curatedEvaluationConfig(config);
}

function toPublic(dto: BundleCampaignDto): PublicBundleCampaignDto {
  const { internalName: _internal, ...rest } = dto;
  return rest;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

const validationError = (message: string) =>
  new ServerError({ tag: "BundleCampaignValidation", statusCode: 400, clientMessage: message });

const notFound = () =>
  new ServerError({ tag: "NotFound", statusCode: 404, clientMessage: "Bundle campaign not found" });

// ─── Shared read helpers ──────────────────────────────────────────────────────

/** Either the request-scoped client or a transaction handle — helpers only use the query builders. */
type Db = Pick<DatabaseClient, "select" | "insert" | "update" | "delete">;

/** One query for every campaign's pool — no per-campaign round trips. */
async function loadPools(
  db: Db,
  campaignIds: string[],
): Promise<Map<string, BundleCampaignProductSummary[]>> {
  const pools = new Map<string, BundleCampaignProductSummary[]>();
  if (campaignIds.length === 0) return pools;

  const rows = await db
    .select({
      campaignId: bundleCampaignProduct.bundleCampaignId,
      productId: bundleCampaignProduct.productId,
      sortOrder: bundleCampaignProduct.sortOrder,
      quantity: bundleCampaignProduct.quantity,
      selectedOptions: bundleCampaignProduct.selectedOptions,
      name: product.name,
      slug: product.slug,
      price: product.price,
      discountPrice: product.discountPrice,
      stock: product.stock,
      deleted: product.deleted,
      hidden: product.hidden,
      imageUrl: file.diskname,
    })
    .from(bundleCampaignProduct)
    .innerJoin(product, eq(bundleCampaignProduct.productId, product.id))
    .leftJoin(file, eq(product.imageId, file.id))
    .where(inArray(bundleCampaignProduct.bundleCampaignId, campaignIds))
    .orderBy(asc(bundleCampaignProduct.sortOrder), asc(product.name));

  for (const r of rows) {
    const list = pools.get(r.campaignId) ?? [];
    list.push({
      productId: r.productId,
      sortOrder: r.sortOrder,
      quantity: r.quantity,
      name: r.name,
      slug: r.slug,
      price: Number(r.price),
      discountPrice: r.discountPrice === null ? null : Number(r.discountPrice),
      stock: r.stock,
      imageUrl: r.imageUrl,
      deleted: r.deleted,
      hidden: r.hidden,
      source: "manual",
      ...pendingOptionFields(r.selectedOptions ?? null),
    });
    pools.set(r.campaignId, list);
  }
  return pools;
}

// ─── Options on pool rows (Phase 7) ───────────────────────────────────────────

/**
 * Placeholder option fields for a summary that has not been finalised yet.
 * `finalizeSummaries` MUST run before a summary reaches a DTO or a capacity
 * calculation; until then `purchasable` is deliberately false so a forgotten
 * call can only under-report availability, never invent it.
 */
function pendingOptionFields(selectedOptions: SelectedOptions | null): Pick<
  BundleCampaignProductSummary,
  "optionGroups" | "selectedOptions" | "unitPrice" | "purchasable"
> {
  return { optionGroups: [], selectedOptions, unitPrice: 0, purchasable: false };
}

/**
 * Attaches option groups to pool summaries and decides, ONCE, each line's
 * `purchasable` flag and regular `unitPrice`:
 *
 *   • deleted/hidden → not purchasable (as before)
 *   • a group with no available value → not purchasable: nothing the shopper
 *     could pick would resolve, so the product must not add capacity
 *   • curated line with a fixed configuration → priced with its modifiers;
 *     unpurchasable if that configuration no longer resolves (value removed,
 *     struck through, or the product gained a group the line does not fix)
 *   • curated line whose product has groups but no configuration → not
 *     purchasable; the merchant must finish it. Never auto-picks a value.
 *
 * One batched option-group query for every product in every pool passed.
 */
async function finalizeSummaries(
  db: Db,
  pools: Iterable<BundleCampaignProductSummary[]>,
  isCurated: (list: BundleCampaignProductSummary[]) => boolean,
): Promise<void> {
  const lists = [...pools];
  const ids = new Set<string>();
  for (const list of lists) for (const p of list) ids.add(p.productId);
  const groupsByProduct = await loadPurchasableOptionGroups(db, [...ids]);
  for (const list of lists) {
    const curated = isCurated(list);
    for (const p of list) finalizeSummary(p, groupsByProduct.get(p.productId) ?? [], curated);
  }
}

function finalizeSummary(p: BundleCampaignProductSummary, groups: PurchasableOptionGroup[], curated: boolean): void {
  p.optionGroups = groups;
  const base = effectivePrice(p);
  const alive = !p.deleted && !p.hidden;
  if (!curated || !requiresOptionSelection(groups)) {
    // BYS pool rows and simple products carry no configuration.
    p.selectedOptions = null;
    p.unitPrice = base;
    p.purchasable = alive && hasPurchasableConfiguration(groups);
    return;
  }
  const resolved = resolveSelectedOptions(groups, p.selectedOptions);
  if (resolved.ok) {
    p.selectedOptions = resolved.selectedOptions;
    p.unitPrice = resolvePurchasableLinePrice(base, resolved.priceModifier);
    p.purchasable = alive;
  } else {
    // Keep what the merchant stored so the CMS can show what needs fixing.
    p.unitPrice = base;
    p.purchasable = false;
  }
}

/**
 * Save-time guard for a curated composition: every line whose product has
 * option groups must fix a configuration that resolves today. Returns the
 * admin-facing problem, or null. Build Your Stack pools are never checked —
 * eligibility there is product-level by design.
 */
async function findCompositionOptionError(db: Db, lines: readonly CuratedCompositionLine[]): Promise<string | null> {
  if (lines.length === 0) return null;
  const groupsByProduct = await loadPurchasableOptionGroups(
    db,
    lines.map((l) => l.productId),
  );
  if (groupsByProduct.size === 0) return null;
  const names = await db
    .select({ id: product.id, name: product.name })
    .from(product)
    .where(inArray(product.id, [...groupsByProduct.keys()]));
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  for (const line of lines) {
    const groups = groupsByProduct.get(line.productId);
    if (!groups || !requiresOptionSelection(groups)) continue;
    const resolved = resolveSelectedOptions(groups, line.selectedOptions);
    if (resolved.ok) continue;
    const name = nameOf.get(line.productId) ?? "a product";
    switch (resolved.code) {
      case "option_required":
        return `Choose a ${resolved.optionName} for "${name}" — this curated stack fixes the exact variant of every line.`;
      case "option_not_found":
        return `"${resolved.value}" is not a ${resolved.optionName} of "${name}" any more. Choose a current option.`;
      case "option_unavailable":
        return `The ${resolved.optionName} "${resolved.value}" of "${name}" is currently unavailable in the store settings. Choose another option.`;
    }
  }
  return null;
}

async function loadCategoryPlacements(db: Db, campaignIds: string[]): Promise<Map<string, string[]>> {
  const placements = new Map<string, string[]>();
  if (campaignIds.length === 0) return placements;
  const rows = await db
    .select({ campaignId: bundleCampaignCategory.bundleCampaignId, categoryId: bundleCampaignCategory.categoryId })
    .from(bundleCampaignCategory)
    .where(inArray(bundleCampaignCategory.bundleCampaignId, campaignIds));
  for (const r of rows) {
    const list = placements.get(r.campaignId) ?? [];
    list.push(r.categoryId);
    placements.set(r.campaignId, list);
  }
  return placements;
}

const campaignWithImageSelect = {
  campaign: bundleCampaign,
  imageUrl: file.diskname,
};

/**
 * Turns campaign rows into DTOs with their EFFECTIVE eligible pool.
 *
 * Five queries total, no matter how many campaigns are passed: the manual
 * pools, the merchandising placements, the eligibility categories, the pricing
 * tiers, and (only if at least one campaign actually has dynamic rules) the
 * union of matching products. Callers that only need cards must still slice/limit their rows
 * BEFORE calling this — see `listLiveBundleCampaigns`.
 */
async function hydrate(db: Db, rows: CampaignWithImage[]): Promise<BundleCampaignDto[]> {
  const ids = rows.map((r) => r.campaign.id);
  const [pools, placements, eligibilityCategories, tiers] = await Promise.all([
    loadPools(db, ids),
    loadCategoryPlacements(db, ids),
    loadEligibilityCategories(db, ids),
    loadTiers(db, ids),
  ]);

  const specs: CampaignEligibilitySpec[] = rows.map((r) => ({
    key: r.campaign.id,
    type: r.campaign.type,
    mode: r.campaign.eligibilityMode,
    rules: toEligibilityRules(r.campaign, eligibilityCategories.get(r.campaign.id)),
  }));
  const dynamicPools = await resolveEligiblePools(db, specs);

  // Effective pools first, then ONE option-group query across all of them —
  // sixth and last query of a hydration, however many campaigns were passed.
  const effectivePools = rows.map((r) => {
    const manual = pools.get(r.campaign.id) ?? [];
    return effectivePoolFor(r.campaign, manual, dynamicPools.get(r.campaign.id) ?? []);
  });
  const curatedLists = new Set(effectivePools.filter((_, i) => rows[i]?.campaign.type === "curated_stack"));
  await finalizeSummaries(db, effectivePools, (list) => curatedLists.has(list));

  const now = new Date();
  return rows.map((r, i) =>
    toDto(
      r,
      effectivePools[i] ?? [],
      placements.get(r.campaign.id) ?? [],
      eligibilityCategories.get(r.campaign.id) ?? [],
      tiers.get(r.campaign.id) ?? [],
      now,
    ),
  );
}

/**
 * Merges a campaign's manual pool with its dynamic matches under the
 * campaign's mode. Curated stacks short-circuit: their rows ARE the
 * composition and dynamic eligibility never applies to them.
 */
function effectivePoolFor(
  campaign: Pick<BundleCampaignRow, "type" | "eligibilityMode">,
  manual: BundleCampaignProductSummary[],
  dynamic: readonly DynamicPoolProduct[],
): BundleCampaignProductSummary[] {
  if (campaign.type === "curated_stack") return manual;
  const dynamicSummaries: BundleCampaignProductSummary[] = dynamic.map((d, index) => ({
    productId: d.productId,
    // Dynamic matches sit after the manual pool; the offset keeps sortOrder a
    // faithful description of the order the shopper sees.
    sortOrder: manual.length + index,
    quantity: 1,
    name: d.name,
    slug: d.slug,
    price: d.price,
    discountPrice: d.discountPrice,
    stock: d.stock,
    imageUrl: d.imageUrl,
    deleted: d.deleted,
    hidden: d.hidden,
    source: "dynamic",
    ...pendingOptionFields(null),
  }));
  return mergeEligiblePools(campaign.eligibilityMode, manual, dynamicSummaries).products;
}

/**
 * Every referenced product must exist and not be soft-deleted. Hidden products
 * are allowed (the admin may be staging them) — the builder simply won't show
 * them until they're unhidden. Returns the ids that failed the check.
 */
async function findInvalidProductIds(db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const found = await db
    .select({ id: product.id })
    .from(product)
    .where(and(inArray(product.id, ids), eq(product.deleted, false)));
  const ok = new Set(found.map((f) => f.id));
  return ids.filter((id) => !ok.has(id));
}

async function findInvalidCategoryIds(db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const found = await db
    .select({ id: category.id })
    .from(category)
    .where(and(inArray(category.id, ids), eq(category.deleted, false)));
  const ok = new Set(found.map((f) => f.id));
  return ids.filter((id) => !ok.has(id));
}

async function slugTaken(db: Db, slug: string, excludeId?: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: bundleCampaign.id })
    .from(bundleCampaign)
    .where(eq(bundleCampaign.slug, slug))
    .limit(1);
  return !!existing && existing.id !== excludeId;
}

/** Pool rows: BYS ids at quantity 1, or a curated composition with its quantities. */
async function replacePool(db: Db, campaignId: string, lines: readonly CuratedCompositionLine[]) {
  await db.delete(bundleCampaignProduct).where(eq(bundleCampaignProduct.bundleCampaignId, campaignId));
  if (lines.length === 0) return;
  await db.insert(bundleCampaignProduct).values(
    lines.map((line, index) => ({
      bundleCampaignId: campaignId,
      productId: line.productId,
      quantity: line.quantity,
      sortOrder: index,
      // Curated lines carry their fixed configuration; BYS pool rows never do.
      selectedOptions:
        line.selectedOptions && Object.keys(line.selectedOptions).length > 0 ? line.selectedOptions : null,
    })),
  );
}

async function replaceCategoryPlacements(db: Db, campaignId: string, categoryIds: readonly string[]) {
  await db.delete(bundleCampaignCategory).where(eq(bundleCampaignCategory.bundleCampaignId, campaignId));
  if (categoryIds.length === 0) return;
  await db.insert(bundleCampaignCategory).values(categoryIds.map((categoryId) => ({ bundleCampaignId: campaignId, categoryId })));
}

async function replaceEligibilityCategories(db: Db, campaignId: string, categoryIds: readonly string[]) {
  await db
    .delete(bundleCampaignEligibilityCategory)
    .where(eq(bundleCampaignEligibilityCategory.bundleCampaignId, campaignId));
  if (categoryIds.length === 0) return;
  await db
    .insert(bundleCampaignEligibilityCategory)
    .values(categoryIds.map((categoryId) => ({ bundleCampaignId: campaignId, categoryId })));
}

/**
 * The ids `validateBundleCampaignConfig` must see when deciding whether a
 * campaign is completable: the manual pool PLUS whatever the rules currently
 * match. Without this, a dynamic campaign with an empty manual pool could
 * never be activated even though it has 20 matching products.
 *
 * Goes through the same resolver the storefront uses, so activation can never
 * accept a pool the builder would then refuse to offer.
 */
async function effectiveEligibleIds(
  db: Db,
  spec: {
    type: BundleCampaignRow["type"];
    mode: BundleEligibilityMode;
    rules: BundleEligibilityRules;
    manualIds: readonly string[];
  },
): Promise<string[]> {
  // Curated stacks and manual-mode campaigns are their stored rows, full stop.
  if (spec.type === "curated_stack" || !modeUsesDynamic(spec.mode)) return [...spec.manualIds];
  const dynamic = await resolveEligiblePools(db, [
    { key: "one", type: spec.type, mode: spec.mode, rules: spec.rules },
  ]);
  return mergeEligiblePools(
    spec.mode,
    spec.manualIds.map((productId) => ({ productId })),
    dynamic.get("one") ?? [],
  ).products.map((r) => r.productId);
}

/** Postgres unique-violation on the slug index, raced past our pre-check. */
function isSlugUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505" &&
    String((err as { constraint?: string }).constraint ?? "").includes("bundle_campaign_slug")
  );
}

/**
 * What a campaign's pool rows should be for a given type: the curated
 * composition, or the BYS pool at quantity 1. Also the ids that must exist.
 */
function poolLinesFor(
  type: BundleCampaignRow["type"],
  eligibleProductIds: readonly string[],
  composition: readonly CuratedCompositionLine[],
): CuratedCompositionLine[] {
  return type === "curated_stack"
    ? composition.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        selectedOptions: line.selectedOptions ?? null,
      }))
    : eligibleProductIds.map((productId) => ({ productId, quantity: 1 }));
}

// ─── Admin services ───────────────────────────────────────────────────────────

/** Admin: every campaign regardless of state, merchandising order first. */
export const listAllBundleCampaigns = () =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        const rows = await db
          .select(campaignWithImageSelect)
          .from(bundleCampaign)
          .leftJoin(file, eq(bundleCampaign.imageId, file.id))
          .orderBy(asc(bundleCampaign.sortOrder), asc(bundleCampaign.createdAt));
        return hydrate(db, rows);
      }),
    );
  });

export const getBundleCampaign = (id: string) =>
  Effect.gen(function* ($) {
    const dto = yield* $(
      query(async (db) => {
        const rows = await db
          .select(campaignWithImageSelect)
          .from(bundleCampaign)
          .leftJoin(file, eq(bundleCampaign.imageId, file.id))
          .where(eq(bundleCampaign.id, id))
          .limit(1);
        const [hydrated] = await hydrate(db, rows);
        return hydrated ?? null;
      }),
    );
    if (!dto) return yield* $(Effect.fail(notFound()));
    return dto;
  });

export const createBundleCampaign = (input: CreateBundleCampaignInput) =>
  Effect.gen(function* ($) {
    const desiredSlug = input.slug ?? slugify(input.title);
    if (!bundleSlugSchema.safeParse(desiredSlug).success) {
      return yield* $(Effect.fail(validationError("Could not derive a valid slug from the title — set one explicitly.")));
    }

    const isCurated = input.type === "curated_stack";
    const requiredQuantity = isCurated ? curatedUnitCount(input.composition) : (input.requiredQuantity ?? 0);
    const poolLines = poolLinesFor(input.type, input.eligibleProductIds, input.composition);
    // Curated stacks own their composition outright — dynamic rules are
    // stripped rather than silently stored and ignored.
    const eligibilityMode: BundleEligibilityMode = isCurated ? "manual" : input.eligibilityMode;
    const eligibilityRules: BundleEligibilityRules = isCurated
      ? { categoryIds: [], minPrice: null, maxPrice: null }
      : {
          categoryIds: input.eligibilityCategoryIds,
          minPrice: input.eligibilityMinPrice ?? null,
          maxPrice: input.eligibilityMaxPrice ?? null,
        };

    // ── Pricing ───────────────────────────────────────────────────────────
    // Build Your Stack is priced by its tiers. When a caller sends none but
    // does send the legacy pair, one tier is synthesised from it, so an older
    // client keeps working and the campaign still ends up with canonical
    // tier rows. Curated stacks keep their single `fixedBundlePrice`.
    const tierInput = isCurated
      ? []
      : input.tiers.length > 0
        ? input.tiers
        : input.fixedBundlePrice !== undefined && requiredQuantity >= 1
          ? [{ quantity: requiredQuantity, price: input.fixedBundlePrice }]
          : [];
    const tiers: BundleTier[] = sortTiers(tierInput.map((t) => ({ id: null, ...t })));
    const lowest = tiers[0] ?? null;
    // Legacy mirrors, derived — never independently authored.
    const legacyQuantity = isCurated ? requiredQuantity : (lowest?.quantity ?? requiredQuantity);
    const legacyPrice = isCurated ? (input.fixedBundlePrice ?? null) : (lowest?.price ?? null);

    const baseConfig = {
      type: input.type,
      requiredQuantity: legacyQuantity,
      pricingType: input.pricingType,
      fixedBundlePrice: legacyPrice,
      tiers,
      allowDuplicates: isCurated ? true : input.allowDuplicates,
      maxPerProduct: isCurated ? null : (input.maxPerProduct ?? null),
      isRepeatable: input.isRepeatable,
      composition: isCurated ? input.composition : undefined,
    };
    // Shape rules first (no DB needed); completability is re-checked below
    // against the RESOLVED pool, which for a dynamic campaign is not the
    // manual list.
    const configError = validateBundleCampaignConfig(
      { ...baseConfig, eligibleProductIds: poolLines.map((l) => l.productId) },
      { requireCompletablePool: false },
    );
    if (configError) return yield* $(Effect.fail(validationError(configError)));

    const created = yield* $(
      query(async (db) => {
        if (await slugTaken(db, desiredSlug)) {
          throw validationError(`The slug "${desiredSlug}" is already used by another campaign.`);
        }
        const invalid = await findInvalidProductIds(db, poolLines.map((l) => l.productId));
        if (invalid.length > 0) {
          throw validationError(`${invalid.length} selected product(s) no longer exist or were deleted.`);
        }
        // Curated: every line with options must fix a real, current variant.
        if (isCurated) {
          const optionError = await findCompositionOptionError(db, poolLines);
          if (optionError) throw validationError(optionError);
        }
        const invalidCategories = await findInvalidCategoryIds(db, [
          ...input.categoryIds,
          ...eligibilityRules.categoryIds,
        ]);
        if (invalidCategories.length > 0) {
          throw validationError(`${invalidCategories.length} selected categor(y/ies) no longer exist.`);
        }
        if (input.isActive) {
          const poolError = validateBundleCampaignConfig(
            {
              ...baseConfig,
              eligibleProductIds: await effectiveEligibleIds(db, {
                type: input.type,
                mode: eligibilityMode,
                rules: eligibilityRules,
                manualIds: poolLines.map((l) => l.productId),
              }),
            },
            { requireCompletablePool: true },
          );
          if (poolError) throw validationError(poolError);
        }

        try {
          return await db.transaction(async (tx) => {
            const [row] = await tx
              .insert(bundleCampaign)
              .values({
                internalName: input.internalName,
                title: input.title,
                slug: desiredSlug,
                subtitle: input.subtitle || null,
                description: input.description || null,
                badgeText: input.badgeText || null,
                imageId: input.imageId ?? null,
                type: input.type,
                isActive: input.isActive,
                requiredQuantity: legacyQuantity,
                pricingType: input.pricingType,
                fixedBundlePrice: legacyPrice === null ? null : legacyPrice.toFixed(2),
                allowDuplicates: isCurated ? true : input.allowDuplicates,
                maxPerProduct: !isCurated && input.allowDuplicates ? (input.maxPerProduct ?? null) : null,
                isRepeatable: input.isRepeatable,
                offerStacking: input.offerStacking,
                eligibilityMode,
                eligibilityMinPrice:
                  eligibilityRules.minPrice === null ? null : eligibilityRules.minPrice.toFixed(2),
                eligibilityMaxPrice:
                  eligibilityRules.maxPrice === null ? null : eligibilityRules.maxPrice.toFixed(2),
                sortOrder: input.sortOrder,
                startsAt: input.startsAt ?? null,
                endsAt: input.endsAt ?? null,
              })
              .returning();
            if (!row) {
              throw new ServerError({ tag: "Internal", statusCode: 500, clientMessage: "Failed to create bundle campaign" });
            }
            await replacePool(tx, row.id, poolLines);
            await replaceCategoryPlacements(tx, row.id, input.categoryIds);
            await replaceEligibilityCategories(tx, row.id, eligibilityRules.categoryIds);
            await replaceTiers(tx, row.id, tiers);
            return row.id;
          });
        } catch (err) {
          if (isSlugUniqueViolation(err)) {
            throw validationError(`The slug "${desiredSlug}" is already used by another campaign.`);
          }
          throw err;
        }
      }),
    );

    return yield* $(getBundleCampaign(created));
  });

export const updateBundleCampaign = (input: UpdateBundleCampaignInput) =>
  Effect.gen(function* ($) {
    const { id, eligibleProductIds, composition, categoryIds, eligibilityCategoryIds, tiers: tierPatch, ...patch } = input;

    const existing = yield* $(
      query(async (db) => {
        const [row] = await db.select().from(bundleCampaign).where(eq(bundleCampaign.id, id)).limit(1);
        if (!row) return null;
        const pool = await db
          .select({
            productId: bundleCampaignProduct.productId,
            quantity: bundleCampaignProduct.quantity,
            selectedOptions: bundleCampaignProduct.selectedOptions,
          })
          .from(bundleCampaignProduct)
          .where(eq(bundleCampaignProduct.bundleCampaignId, id))
          .orderBy(asc(bundleCampaignProduct.sortOrder));
        const storedEligibilityCategories = await loadEligibilityCategories(db, [id]);
        const storedTiers = await loadTiers(db, [id]);
        return {
          row,
          poolLines: pool,
          eligibilityCategoryIds: storedEligibilityCategories.get(id) ?? [],
          tiers: storedTiers.get(id) ?? [],
        };
      }),
    );
    if (!existing) return yield* $(Effect.fail(notFound()));

    const type = patch.type ?? existing.row.type;
    const isCurated = type === "curated_stack";

    // Pool: an explicit new pool/composition wins; otherwise keep the stored
    // rows (re-shaped if the type changed).
    let poolLines: CuratedCompositionLine[];
    if (isCurated) {
      poolLines =
        composition?.map((l) => ({ productId: l.productId, quantity: l.quantity, selectedOptions: l.selectedOptions ?? null })) ??
        existing.poolLines.map((l) => ({ productId: l.productId, quantity: l.quantity, selectedOptions: l.selectedOptions ?? null }));
    } else {
      poolLines = (eligibleProductIds ?? existing.poolLines.map((l) => l.productId)).map((productId) => ({ productId, quantity: 1 }));
    }
    const poolChanged = isCurated ? composition !== undefined : eligibleProductIds !== undefined;
    const typeChanged = type !== existing.row.type;

    // ── Tiers ─────────────────────────────────────────────────────────────
    // An explicit `tiers` array replaces the set; otherwise the stored tiers
    // stand, so a partial update that only flips `isActive` is still judged
    // against the campaign's real pricing. Switching a campaign to curated
    // drops its tiers (curated pricing lives on fixedBundlePrice); switching
    // to Build Your Stack with no stored tiers falls back to the legacy pair
    // so the campaign is never left unpriced.
    // A caller that still speaks the pre-Phase-5 language (patching
    // `fixedBundlePrice` / `requiredQuantity` without sending `tiers`) must
    // keep working. On a SINGLE-tier campaign that patch is unambiguous, so it
    // moves that tier. On a multi-tier campaign it is not — "the" price does
    // not exist — so it is refused rather than silently dropped.
    const patchesLegacyPricing =
      !isCurated &&
      tierPatch === undefined &&
      (patch.fixedBundlePrice !== undefined || patch.requiredQuantity !== undefined);
    if (patchesLegacyPricing && existing.tiers.length > 1) {
      return yield* $(
        Effect.fail(
          validationError(
            "This campaign has several pricing tiers — send the full `tiers` list instead of a single quantity or price.",
          ),
        ),
      );
    }

    const mergedTiers: BundleTier[] = (() => {
      if (isCurated) return [];
      if (tierPatch !== undefined) return sortTiers(tierPatch.map((t) => ({ id: null, ...t })));
      const only = existing.tiers.length === 1 ? existing.tiers[0] : undefined;
      if (only && patchesLegacyPricing) {
        return [
          {
            id: only.id,
            quantity: patch.requiredQuantity ?? only.quantity,
            price: patch.fixedBundlePrice ?? only.price,
          },
        ];
      }
      if (existing.tiers.length > 0) return sortTiers(existing.tiers);
      const legacyQty = patch.requiredQuantity ?? existing.row.requiredQuantity;
      const legacyPrice =
        patch.fixedBundlePrice !== undefined
          ? patch.fixedBundlePrice
          : existing.row.fixedBundlePrice === null
            ? null
            : Number(existing.row.fixedBundlePrice);
      return legacyPrice !== null && legacyQty >= 1
        ? [{ id: null, quantity: legacyQty, price: legacyPrice }]
        : [];
    })();
    const lowestTier = mergedTiers[0] ?? null;
    const tiersChanged =
      tierPatch !== undefined || typeChanged || existing.tiers.length === 0 || patchesLegacyPricing;

    const tierError = isCurated ? null : validateBundleTiers(mergedTiers, { requireAtLeastOne: false });
    if (tierError) return yield* $(Effect.fail(validationError(tierError)));

    // Merge the patch over the stored row so every invariant is checked against
    // what will actually be persisted, not just the fields that changed.
    const merged = {
      internalName: patch.internalName ?? existing.row.internalName,
      title: patch.title ?? existing.row.title,
      slug: patch.slug ?? existing.row.slug,
      subtitle: patch.subtitle !== undefined ? patch.subtitle || null : existing.row.subtitle,
      description: patch.description !== undefined ? patch.description || null : existing.row.description,
      badgeText: patch.badgeText !== undefined ? patch.badgeText || null : existing.row.badgeText,
      imageId: patch.imageId !== undefined ? patch.imageId : existing.row.imageId,
      type,
      isActive: patch.isActive ?? existing.row.isActive,
      // Build Your Stack: legacy mirrors of the lowest tier, so the columns can
      // never drift from `bundle_campaign_tier`.
      requiredQuantity: isCurated
        ? curatedUnitCount(poolLines)
        : (lowestTier?.quantity ?? patch.requiredQuantity ?? existing.row.requiredQuantity),
      pricingType: patch.pricingType ?? existing.row.pricingType,
      fixedBundlePrice: isCurated
        ? patch.fixedBundlePrice !== undefined
          ? patch.fixedBundlePrice
          : existing.row.fixedBundlePrice === null
            ? null
            : Number(existing.row.fixedBundlePrice)
        : (lowestTier?.price ?? null),
      allowDuplicates: isCurated ? true : (patch.allowDuplicates ?? existing.row.allowDuplicates),
      maxPerProduct: isCurated ? null : patch.maxPerProduct !== undefined ? patch.maxPerProduct : existing.row.maxPerProduct,
      isRepeatable: patch.isRepeatable ?? existing.row.isRepeatable,
      offerStacking: patch.offerStacking ?? existing.row.offerStacking,
      sortOrder: patch.sortOrder ?? existing.row.sortOrder,
      startsAt: patch.startsAt !== undefined ? patch.startsAt : existing.row.startsAt,
      endsAt: patch.endsAt !== undefined ? patch.endsAt : existing.row.endsAt,
    };
    // Eligibility, merged the same way: a partial update that only flips
    // `isActive` must still be checked against the STORED rules.
    const eligibilityMode: BundleEligibilityMode = isCurated
      ? "manual"
      : (patch.eligibilityMode ?? existing.row.eligibilityMode);
    const eligibilityRules: BundleEligibilityRules = isCurated
      ? { categoryIds: [], minPrice: null, maxPrice: null }
      : {
          categoryIds: eligibilityCategoryIds ?? existing.eligibilityCategoryIds,
          minPrice:
            patch.eligibilityMinPrice !== undefined
              ? patch.eligibilityMinPrice
              : existing.row.eligibilityMinPrice === null
                ? null
                : Number(existing.row.eligibilityMinPrice),
          maxPrice:
            patch.eligibilityMaxPrice !== undefined
              ? patch.eligibilityMaxPrice
              : existing.row.eligibilityMaxPrice === null
                ? null
                : Number(existing.row.eligibilityMaxPrice),
        };
    const eligibilityChanged =
      eligibilityCategoryIds !== undefined ||
      (!isCurated && patch.eligibilityMode !== undefined) ||
      isCurated !== (existing.row.type === "curated_stack");

    const ruleError = isCurated ? null : validateEligibilityRules(eligibilityMode, eligibilityRules);
    if (ruleError) return yield* $(Effect.fail(validationError(ruleError)));
    // Turning duplicates off makes a per-product cap meaningless — drop it
    // rather than rejecting, so the toggle behaves the way the form implies.
    if (!merged.allowDuplicates) merged.maxPerProduct = null;

    const scheduleError = validateBundleCampaignSchedule(merged.startsAt, merged.endsAt);
    if (scheduleError) return yield* $(Effect.fail(validationError(scheduleError)));

    const mergedConfigBase = {
      type: merged.type,
      requiredQuantity: merged.requiredQuantity,
      pricingType: merged.pricingType,
      fixedBundlePrice: merged.fixedBundlePrice,
      tiers: mergedTiers,
      allowDuplicates: merged.allowDuplicates,
      maxPerProduct: merged.maxPerProduct,
      isRepeatable: merged.isRepeatable,
      composition: isCurated ? poolLines : undefined,
    };
    const configError = validateBundleCampaignConfig(
      { ...mergedConfigBase, eligibleProductIds: poolLines.map((l) => l.productId) },
      { requireCompletablePool: false },
    );
    if (configError) return yield* $(Effect.fail(validationError(configError)));

    yield* $(
      query(async (db) => {
        if (merged.slug !== existing.row.slug && (await slugTaken(db, merged.slug, id))) {
          throw validationError(`The slug "${merged.slug}" is already used by another campaign.`);
        }
        if (poolChanged) {
          const invalid = await findInvalidProductIds(db, poolLines.map((l) => l.productId));
          if (invalid.length > 0) {
            throw validationError(`${invalid.length} selected product(s) no longer exist or were deleted.`);
          }
        }
        // Curated: a new composition must fix a real variant on every line
        // with options, and so must the STORED one before the campaign can be
        // live. A pre-Phase-7 curated stack holding a product that has since
        // gained options therefore stays a draft until the admin picks the
        // variant — the service never picks one for them.
        if (isCurated && (poolChanged || merged.isActive)) {
          const optionError = await findCompositionOptionError(db, poolLines);
          if (optionError) throw validationError(optionError);
        }
        const categoriesToCheck = [...(categoryIds ?? []), ...(eligibilityCategoryIds ?? [])];
        if (categoriesToCheck.length > 0) {
          const invalidCategories = await findInvalidCategoryIds(db, categoriesToCheck);
          if (invalidCategories.length > 0) {
            throw validationError(`${invalidCategories.length} selected categor(y/ies) no longer exist.`);
          }
        }
        // Completability against the effective pool, so switching a dynamic
        // campaign on is judged on what its rules match right now.
        if (merged.isActive) {
          const poolError = validateBundleCampaignConfig(
            {
              ...mergedConfigBase,
              eligibleProductIds: await effectiveEligibleIds(db, {
                type: merged.type,
                mode: eligibilityMode,
                rules: eligibilityRules,
                manualIds: poolLines.map((l) => l.productId),
              }),
            },
            { requireCompletablePool: true },
          );
          if (poolError) throw validationError(poolError);
        }

        try {
          await db.transaction(async (tx) => {
            await tx
              .update(bundleCampaign)
              .set({
                ...merged,
                fixedBundlePrice: merged.fixedBundlePrice === null ? null : merged.fixedBundlePrice.toFixed(2),
                eligibilityMode,
                eligibilityMinPrice:
                  eligibilityRules.minPrice === null ? null : eligibilityRules.minPrice.toFixed(2),
                eligibilityMaxPrice:
                  eligibilityRules.maxPrice === null ? null : eligibilityRules.maxPrice.toFixed(2),
                updatedAt: new Date(),
              })
              .where(eq(bundleCampaign.id, id));
            if (poolChanged || typeChanged) await replacePool(tx, id, poolLines);
            if (categoryIds) await replaceCategoryPlacements(tx, id, categoryIds);
            if (eligibilityCategoryIds || eligibilityChanged) {
              await replaceEligibilityCategories(tx, id, eligibilityRules.categoryIds);
            }
            if (tiersChanged) await replaceTiers(tx, id, mergedTiers);
          });
        } catch (err) {
          if (isSlugUniqueViolation(err)) {
            throw validationError(`The slug "${merged.slug}" is already used by another campaign.`);
          }
          throw err;
        }
      }),
    );

    return yield* $(getBundleCampaign(id));
  });

/** Convenience for the list's on/off switch — goes through the same invariants as a full update. */
export const setBundleCampaignActive = (id: string, isActive: boolean) =>
  updateBundleCampaign({ id, isActive });

/**
 * Hard delete, matching `cart_offer` / `promo_code`. The pool rows cascade.
 * Orders keep their own `order_bundle` snapshot (campaign FK is SET NULL), so
 * deleting a campaign never rewrites history.
 */
export const deleteBundleCampaign = (id: string) =>
  Effect.gen(function* ($) {
    const [deleted] = yield* $(
      query((db) => db.delete(bundleCampaign).where(eq(bundleCampaign.id, id)).returning({ id: bundleCampaign.id })),
    );
    if (!deleted) return yield* $(Effect.fail(notFound()));
    return { success: true } as const;
  });

// ─── Public services (storefront) ─────────────────────────────────────────────

const liveCampaignWhere = (now: Date) =>
  and(
    eq(bundleCampaign.isActive, true),
    or(isNull(bundleCampaign.startsAt), lte(bundleCampaign.startsAt, now)),
    or(isNull(bundleCampaign.endsAt), gte(bundleCampaign.endsAt, now)),
  );

/**
 * Build Your Stack: only products a shopper can actually pick (not deleted,
 * not hidden). Availability was already computed from the full pool, so
 * stripping here changes what is SHOWN, not whether the stack is buyable.
 *
 * Curated stacks are left whole on purpose: their unit count, regular value
 * and savings are derived from the composition, so hiding a line would make
 * the page claim a value it no longer lists. An unavailable line instead
 * turns the whole stack `sold_out` and is flagged per line on the page.
 */
function shopperVisiblePool(dto: BundleCampaignDto): BundleCampaignDto {
  if (dto.type === "curated_stack") return dto;
  const eligibleProducts = dto.eligibleProducts.filter((p) => !p.deleted && !p.hidden);
  return { ...dto, eligibleProducts, eligibleProductCount: eligibleProducts.length };
}

/**
 * Public: campaigns that are switched on and inside their window ("live" =
 * visible). Buyability is a separate, explicit `availability` field so a
 * sold-out stack can still be merchandised as sold out. Sorted by the
 * CMS `sortOrder`, or in the caller's `ids` order when given.
 */
export const listLiveBundleCampaigns = (options: ListLiveBundleCampaignsInput = {}) =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        const placementIds =
          options.categoryId === undefined
            ? null
            : (
                await db
                  .select({ campaignId: bundleCampaignCategory.bundleCampaignId })
                  .from(bundleCampaignCategory)
                  .where(eq(bundleCampaignCategory.categoryId, options.categoryId))
              ).map((r) => r.campaignId);
        if (placementIds !== null && placementIds.length === 0) return [] as PublicBundleCampaignDto[];

        let rows = await db
          .select(campaignWithImageSelect)
          .from(bundleCampaign)
          .leftJoin(file, eq(bundleCampaign.imageId, file.id))
          .where(
            and(
              liveCampaignWhere(new Date()),
              placementIds !== null ? inArray(bundleCampaign.id, placementIds) : undefined,
              options.ids && options.ids.length > 0 ? inArray(bundleCampaign.id, options.ids) : undefined,
            ),
          )
          .orderBy(asc(bundleCampaign.sortOrder), asc(bundleCampaign.createdAt));

        // Order and limit BEFORE hydrating: pools and placements are then
        // fetched only for the campaigns actually returned, so a "is there
        // any live bundle?" probe (limit 1) or a 6-card homepage rail never
        // pulls every live campaign's composition.
        if (options.ids && options.ids.length > 0) {
          const position = new Map(options.ids.map((id, index) => [id, index]));
          rows = [...rows].sort(
            (a, b) => (position.get(a.campaign.id) ?? 0) - (position.get(b.campaign.id) ?? 0),
          );
        }

        // Best Sellers: one grouped sales query, then a pure re-order of the
        // rows already proven live. `rows` arrives in CMS order, so passing it
        // straight in also supplies the documented backfill order for
        // campaigns with no sales in the window.
        if (options.sort === "best_selling" && rows.length > 0) {
          const sales = await loadBundleSalesRanking(
            db,
            options.periodDays ?? BEST_SELLING_PERIOD_DAYS,
          );
          const ranked = rankBestSellingCampaignIds(
            sales,
            rows.map((r) => r.campaign.id),
            rows.length,
          );
          const position = new Map(ranked.map((id, index) => [id, index]));
          rows = [...rows].sort(
            (a, b) =>
              (position.get(a.campaign.id) ?? Number.MAX_SAFE_INTEGER) -
              (position.get(b.campaign.id) ?? Number.MAX_SAFE_INTEGER),
          );
        }

        if (options.limit) rows = rows.slice(0, options.limit);

        const dtos = (await hydrate(db, rows)).map(shopperVisiblePool);
        return dtos.map((dto) =>
          toPublic(options.includeProducts ? dto : { ...dto, eligibleProducts: [] }),
        );
      }),
    );
  });

/** Public: one live campaign by slug (404 for drafts/scheduled/expired), with its pool/composition. */
export const getLiveBundleCampaignBySlug = (slug: string) =>
  Effect.gen(function* ($) {
    const dto = yield* $(
      query(async (db) => {
        const rows = await db
          .select(campaignWithImageSelect)
          .from(bundleCampaign)
          .leftJoin(file, eq(bundleCampaign.imageId, file.id))
          .where(and(eq(bundleCampaign.slug, slug), liveCampaignWhere(new Date())))
          .limit(1);
        const [hydrated] = await hydrate(db, rows);
        return hydrated ? toPublic(shopperVisiblePool(hydrated)) : null;
      }),
    );
    if (!dto) return yield* $(Effect.fail(notFound()));
    return dto;
  });

/** Admin helper: is this slug free? Lets the form warn before submit. */
export const isBundleSlugAvailable = (slug: string, excludeId?: string) =>
  Effect.gen(function* ($) {
    const taken = yield* $(query((db) => slugTaken(db, slug, excludeId)));
    return { available: !taken };
  });

// ─── CMS eligibility preview ──────────────────────────────────────────────────

/**
 * What the Bundle Campaign editor asks the server while the merchant is still
 * typing. Unsaved on purpose: the form sends the configuration it currently
 * shows, so the counts describe what WOULD be saved.
 */
export const previewBundleEligibilitySchema = z.object({
  type: z.enum(["build_your_stack", "curated_stack"]).default("build_your_stack"),
  eligibilityMode: z.enum(["manual", "dynamic", "hybrid"]).default("manual"),
  eligibilityCategoryIds: z.array(z.string().uuid()).max(50).default([]),
  eligibilityMinPrice: z.number().nonnegative().nullable().optional(),
  eligibilityMaxPrice: z.number().nonnegative().nullable().optional(),
  /** Manual pool as the form currently holds it (order matters for the preview list). */
  manualProductIds: z.array(z.string().uuid()).max(500).default([]),
  /** The tier ladder as the form currently holds it. Empty falls back to `requiredQuantity`. */
  tiers: z
    .array(z.object({ quantity: z.number().int().min(1).max(100), price: z.number().positive() }))
    .max(20)
    .default([]),
  requiredQuantity: z.number().int().min(1).max(100),
  allowDuplicates: z.boolean().default(false),
  maxPerProduct: z.number().int().min(1).max(100).nullable().optional(),
});

export type PreviewBundleEligibilityInput = z.infer<typeof previewBundleEligibilitySchema>;

export interface BundleEligibilityPreview {
  /** Distinct products in the effective pool. */
  eligibleProductCount: number;
  manualProductCount: number;
  dynamicProductCount: number;
  /** Effective-pool products a shopper could actually pick right now. */
  purchasableProductCount: number;
  /** Purchasable units the pool can supply toward ONE bundle, under the duplicate/cap rules. */
  availableCapacity: number;
  /** Enough purchasable units to finish the SMALLEST tier today. */
  canCompleteStack: boolean;
  /**
   * Per-tier economics, ascending by quantity: what it costs, whether the
   * effective pool can fill it right now, and what those pieces would cost
   * bought separately. Computed by the same domain helpers the storefront
   * uses, so the CMS never runs a second availability calculation.
   */
  tiers: {
    quantity: number;
    price: number;
    availability: BundleAvailability;
    valueRange: { min: number; max: number } | null;
  }[];
  /**
   * The campaign cannot be activated as configured — a structural problem the
   * merchant must fix (too small a pool, rules matching nothing). Distinct
   * from `canCompleteStack`, which can be false purely because of stock.
   */
  configError: string | null;
  /** Manual picks the storefront will not offer, with the reason. */
  unusableManualProducts: { productId: string; name: string; reason: "deleted" | "hidden" }[];
  /** First 24 of the effective pool, in the order the builder shows them. */
  sample: BundleCampaignProductSummary[];
}

/**
 * Admin: resolve the effective pool for an unsaved configuration and report
 * how it looks today. Runs the SAME resolver and the SAME Phase 3 availability
 * rules the storefront uses — the CMS never approximates them itself.
 */
export const previewBundleEligibility = (input: PreviewBundleEligibilityInput) =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db): Promise<BundleEligibilityPreview> => {
        const isCurated = input.type === "curated_stack";
        const mode: BundleEligibilityMode = isCurated ? "manual" : input.eligibilityMode;
        const rules: BundleEligibilityRules = isCurated
          ? { categoryIds: [], minPrice: null, maxPrice: null }
          : {
              categoryIds: input.eligibilityCategoryIds,
              minPrice: input.eligibilityMinPrice ?? null,
              maxPrice: input.eligibilityMaxPrice ?? null,
            };

        // Manual half: read the products the form is holding, in form order.
        const manualRows = await loadProductSummaries(db, input.manualProductIds);
        const manual = input.manualProductIds
          .map((id, index) => {
            const row = manualRows.get(id);
            return row ? { ...row, sortOrder: index } : null;
          })
          .filter((r): r is BundleCampaignProductSummary => r !== null);

        // Dynamic half: the authoritative resolver.
        const dynamicRaw =
          modeUsesDynamic(mode) && hasAnyEligibilityRule(rules)
            ? ((await resolveEligiblePools(db, [{ key: "one", type: input.type, mode, rules }])).get("one") ?? [])
            : [];
        const dynamic: BundleCampaignProductSummary[] = dynamicRaw.map((d, index) => ({
          productId: d.productId,
          sortOrder: manual.length + index,
          quantity: 1,
          name: d.name,
          slug: d.slug,
          price: d.price,
          discountPrice: d.discountPrice,
          stock: d.stock,
          imageUrl: d.imageUrl,
          deleted: d.deleted,
          hidden: d.hidden,
          source: "dynamic",
          ...pendingOptionFields(null),
        }));

        const effective = mergeEligiblePools(mode, manual, dynamic).products;
        await finalizeSummaries(db, [effective], () => isCurated);
        const maxPerProduct = input.allowDuplicates ? (input.maxPerProduct ?? null) : null;

        const availabilityProducts = effective.map((p) => ({
          productId: p.productId,
          stock: p.stock,
          purchasable: p.purchasable,
          unitPrice: p.unitPrice,
        }));
        const capacityConfig = {
          eligibleProductIds: effective.map((p) => p.productId),
          allowDuplicates: input.allowDuplicates,
          maxPerProduct,
        };
        // THE capacity calculation — the same `bundlePoolCapacity` the
        // storefront's availability and per-tier availability derive from,
        // options included through each summary's `purchasable` flag.
        const availableCapacity = bundlePoolCapacity(capacityConfig, availabilityProducts);
        const purchasableProductCount = effective.filter((p) => p.purchasable && p.stock > 0).length;

        // The ladder being previewed. A form with no tiers yet falls back to
        // the single legacy quantity so the panel still says something useful.
        const previewTiers: BundleTier[] =
          input.tiers.length > 0
            ? sortTiers(input.tiers.map((t) => ({ id: null, ...t })))
            : [{ id: null, quantity: input.requiredQuantity, price: 1 }];
        const smallestQuantity = previewTiers[0]?.quantity ?? input.requiredQuantity;
        const tierPreview = previewTiers.map((tier) => ({
          quantity: tier.quantity,
          price: tier.price,
          availability:
            availableCapacity >= tier.quantity ? ("available" as const) : ("sold_out" as const),
          valueRange: valueRangeForTier(capacityConfig, availabilityProducts, tier.quantity),
        }));

        const configError = validateBundleCampaignConfig(
          {
            type: input.type,
            requiredQuantity: smallestQuantity,
            pricingType: "fixed_total",
            // Pricing is validated by the form/service; the preview only cares
            // about the pool, so pass a placeholder that clears the price rule.
            fixedBundlePrice: 1,
            allowDuplicates: isCurated ? true : input.allowDuplicates,
            maxPerProduct: isCurated ? null : maxPerProduct,
            isRepeatable: false,
            tiers: isCurated ? [] : previewTiers,
            eligibleProductIds: effective.map((p) => p.productId),
            composition: isCurated ? effective.map((p) => ({ productId: p.productId, quantity: p.quantity })) : undefined,
          },
          { requireCompletablePool: true },
        );

        return {
          eligibleProductCount: effective.length,
          manualProductCount: effective.filter((p) => p.source === "manual").length,
          dynamicProductCount: effective.filter((p) => p.source === "dynamic").length,
          purchasableProductCount,
          availableCapacity,
          // Campaign level: can ANY tier be completed? A ladder whose top rung
          // is out of stock is still sellable at its lower rungs.
          canCompleteStack: availableCapacity >= smallestQuantity,
          tiers: tierPreview,
          configError,
          unusableManualProducts: manual
            .filter((p) => p.deleted || p.hidden)
            .map((p) => ({ productId: p.productId, name: p.name, reason: p.deleted ? ("deleted" as const) : ("hidden" as const) })),
          sample: effective.slice(0, 24),
        };
      }),
    );
  });

/** Product rows in the pool shape, keyed by id. One query. */
async function loadProductSummaries(
  db: Db,
  productIds: readonly string[],
): Promise<Map<string, BundleCampaignProductSummary>> {
  const byId = new Map<string, BundleCampaignProductSummary>();
  if (productIds.length === 0) return byId;
  const rows = await db
    .select({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      discountPrice: product.discountPrice,
      stock: product.stock,
      deleted: product.deleted,
      hidden: product.hidden,
      imageUrl: file.diskname,
    })
    .from(product)
    .leftJoin(file, eq(product.imageId, file.id))
    .where(inArray(product.id, [...new Set(productIds)]));
  for (const r of rows) {
    byId.set(r.productId, {
      productId: r.productId,
      sortOrder: 0,
      quantity: 1,
      name: r.name,
      slug: r.slug,
      price: Number(r.price),
      discountPrice: r.discountPrice === null ? null : Number(r.discountPrice),
      stock: r.stock,
      imageUrl: r.imageUrl,
      deleted: r.deleted,
      hidden: r.hidden,
      source: "manual",
      ...pendingOptionFields(null),
    });
  }
  return byId;
}
