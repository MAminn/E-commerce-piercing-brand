/**
 * Server-authoritative validation of a proposed bundle instance.
 *
 * The browser only ever sends WHICH products, WHICH options and HOW MANY;
 * everything with a price on it (unit prices, bundle total, savings) is
 * re-derived here from the live campaign, product and option-group rows, then
 * run through the shared domain evaluator. `validateBundleSelection` is pure
 * so it can be unit-tested; `loadAndValidate…` does the DB reads and is what
 * tRPC and create-order call.
 *
 * Phase 7 — options ("variants"). Each requested line may carry
 * `selectedOptions`; the server resolves it against the product's CURRENT
 * option groups (`shared/products/options.ts`): every group must have a
 * value, the value must exist and be available, and the price is the
 * product's effective price plus the chosen modifiers. What the client
 * labelled the line is never used — the canonical map the resolver returns is
 * what reaches the cart, the order and the receipt. Campaign rules
 * (eligibility, duplicates, max per product) stay PRODUCT-level: Gold and
 * Silver of one product are two lines for pricing but one product for the
 * evaluator.
 */

import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  bundleCampaign,
  bundleCampaignProduct,
  bundleCampaignTier,
  file,
  product,
  type BundleCampaignRow,
} from "#root/shared/database/drizzle/schema";
import {
  type BundleEvaluation,
  type BundleEvaluationReason,
  type BundleTier,
  type CuratedCompositionLine,
  curatedEvaluationConfig,
  evaluateBundleSelection,
  getBundleCampaignState,
  sortTiers,
} from "#root/shared/bundles/evaluate";
import { toBundleCampaignConfig } from "./service";
import {
  loadEligibilityCategories,
  resolveEligibleMembership,
  toEligibilityRules,
} from "./eligibility";
import { mergeEligiblePools } from "#root/shared/bundles/eligibility";
import {
  type OptionResolutionFailure,
  type PurchasableOptionGroup,
  type SelectedOptions,
  formatSelectedOptions,
  resolvePurchasableLinePrice,
  resolveSelectedOptions,
} from "#root/shared/products/options";
import { loadPurchasableOptionGroups } from "#root/backend/products/option-groups";
import { and, asc, eq, inArray } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RequestedBundleItem {
  productId: string;
  quantity: number;
  /** The configuration the shopper chose. Resolved server-side; never trusted as-is. */
  selectedOptions?: SelectedOptions | null;
}

/** Product columns the validation needs — the same ones create-order already loads. */
export interface SelectionProductRow {
  id: string;
  name: string;
  price: string;
  discountPrice: string | null;
  stock: number;
  deleted: boolean;
  hidden: boolean;
  categoryId: string | null;
  imageUrl: string | null;
}

export type BundleRejectionCode =
  | "campaign_not_found"
  | "tier_unavailable"
  | "campaign_not_live"
  | "product_unavailable"
  | "product_not_eligible"
  | "out_of_stock"
  | "invalid_pricing"
  | "price_changed"
  /** Phase 7: a curated composition line's product has options but the line fixes none — the merchant must finish it. */
  | "composition_incomplete"
  | OptionResolutionFailure
  | BundleEvaluationReason;

/** What went wrong, for a client that wants to word it itself (EN/AR). */
export interface BundleRejectionDetail {
  productId?: string;
  productName?: string;
  optionName?: string;
  value?: string | null;
}

export interface ValidatedBundleItem {
  productId: string;
  name: string;
  quantity: number;
  /**
   * Server-derived regular unit price of THIS line: the product's effective
   * price (discountPrice ?? price) plus the resolved option modifiers. What
   * `regularTotal` and the separately-bought value are made of.
   */
  unitPrice: number;
  /** The product's regular price and discount BEFORE option modifiers — snapshotted onto the order line with the modifier folded in. */
  price: number;
  discountPrice: number | null;
  /** Σ modifiers of the chosen option values (0 for a simple product). */
  priceModifier: number;
  /** Canonical configuration as the server resolved it — `{}` for a simple product. */
  selectedOptions: SelectedOptions;
  /** `Color: Gold, Size: 8mm`, or null for a simple product. Display only. */
  optionsLabel: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  stock: number;
}

/** A bundle the server is willing to price into a cart/order. */
export interface ValidatedBundle {
  campaignId: string;
  campaignSlug: string;
  campaignTitle: string;
  /** Snapshotted onto `order_bundle` so admin history can label the group. */
  campaignType: BundleCampaignRow["type"];
  /**
   * The tier the SERVER matched from the unit count. Null for a curated stack
   * (and for a legacy campaign whose tier row predates Phase 5). Snapshotted
   * onto the order as a plain id — never a live dependency.
   */
  tierId: string | null;
  /** Units in one bundle: the matched tier's quantity. */
  tierQuantity: number;
  requiredQuantity: number;
  offerStacking: BundleCampaignRow["offerStacking"];
  isRepeatable: boolean;
  regularTotal: number;
  bundleTotal: number;
  savings: number;
  items: ValidatedBundleItem[];
}

export interface PublicCampaignSummary {
  id: string;
  slug: string;
  title: string;
  type: BundleCampaignRow["type"];
  /** The campaign's real pricing, ascending by quantity. */
  tiers: BundleTier[];
  requiredQuantity: number;
  fixedBundlePrice: number | null;
  allowDuplicates: boolean;
  maxPerProduct: number | null;
  isRepeatable: boolean;
  offerStacking: BundleCampaignRow["offerStacking"];
}

export type SelectionCheck =
  | {
      ok: true;
      code: null;
      message: null;
      campaign: PublicCampaignSummary;
      evaluation: BundleEvaluation;
      bundle: ValidatedBundle;
    }
  | {
      ok: false;
      code: BundleRejectionCode;
      /** Customer-safe sentence. */
      message: string;
      /** Which product/option the code is about, when it is about one. */
      detail: BundleRejectionDetail | null;
      campaign: PublicCampaignSummary | null;
      /** Present when the campaign was live and products valid but the selection itself doesn't qualify — lets the builder show progress. */
      evaluation: BundleEvaluation | null;
      bundle: null;
    };

// ─── Messages ─────────────────────────────────────────────────────────────────

export function bundleRejectionMessage(
  code: BundleRejectionCode,
  campaignTitle?: string,
  detail?: BundleRejectionDetail | null,
): string {
  const name = campaignTitle ? `"${campaignTitle}"` : "This bundle";
  const productName = detail?.productName ?? "one of the products in your stack";
  const optionName = detail?.optionName ?? "an option";
  switch (code) {
    case "campaign_not_found":
      return "This bundle is no longer available.";
    case "tier_unavailable":
      return "That stack size is no longer offered. Please rebuild your stack.";
    case "campaign_not_live":
      return `${name} is not available right now.`;
    case "product_unavailable":
      return "One of the products in your stack is no longer available. Please rebuild your stack.";
    case "product_not_eligible":
      return "One of the products in your stack is not part of this bundle. Please rebuild your stack.";
    case "out_of_stock":
      return "One of the products in your stack has sold out. Please rebuild your stack.";
    case "invalid_pricing":
      return `${name} cannot be priced right now. Please try again later.`;
    case "price_changed":
      return `The price of ${name} has changed. Please review your cart before continuing.`;
    case "option_required":
      return `Please choose ${optionName} for ${productName} before adding it to your stack.`;
    case "option_not_found":
      return `The ${optionName} you chose for ${productName} is no longer available. Please choose another option.`;
    case "option_unavailable":
      return `The ${optionName} you chose for ${productName} is currently unavailable. Please choose another option.`;
    case "composition_incomplete":
      return `${name} is not available right now.`;
    case "duplicates_not_allowed":
      return "Each product can only be added once to this stack.";
    case "max_per_product_exceeded":
      return "You have added too many of the same product to this stack.";
    case "not_enough_units":
      return "Your stack is not complete yet.";
    case "too_many_units":
      return "Your stack has too many items.";
    case "no_matching_tier":
      return "That number of pieces isn't one of this bundle's sizes. Adjust your stack to a listed size.";
    case "no_tiers_configured":
      return `${name} has no pricing set up right now.`;
    default:
      return "Your stack could not be validated. Please rebuild it.";
  }
}

// ─── Pure validation ──────────────────────────────────────────────────────────

export interface ValidateBundleSelectionInput {
  campaign: BundleCampaignRow | null;
  /** The campaign's stored pricing tiers. Empty falls back to the legacy pair. */
  tiers?: readonly BundleTier[];
  /** Product ids in the campaign's pool. */
  poolProductIds: readonly string[];
  /**
   * Pool rows with their quantities — the fixed composition of a curated
   * stack. When the campaign is curated this REPLACES `requested`: the
   * browser cannot alter what a curated stack contains. Optional so the
   * Phase 2 call sites keep working; defaults to the pool at quantity 1.
   */
  composition?: readonly CuratedCompositionLine[];
  /** Rows for every requested product id that exists (missing ids are simply absent). */
  products: readonly SelectionProductRow[];
  /**
   * Phase 7: option groups per product id, with store-wide availability
   * already applied. A product with no entry is a simple product. Optional so
   * pre-Phase-7 callers/tests keep working — they describe simple products.
   */
  optionGroups?: ReadonlyMap<string, readonly PurchasableOptionGroup[]>;
  requested: readonly RequestedBundleItem[];
  /** The bundle total the shopper was shown; a mismatch is rejected as `price_changed`. Never used for pricing. */
  expectedBundleTotal?: number | null;
  now?: Date;
}

function summarize(c: BundleCampaignRow, tiers: readonly BundleTier[]): PublicCampaignSummary {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    type: c.type,
    tiers: sortTiers(tiers),
    requiredQuantity: c.requiredQuantity,
    fixedBundlePrice: c.fixedBundlePrice === null ? null : Number(c.fixedBundlePrice),
    allowDuplicates: c.allowDuplicates,
    maxPerProduct: c.maxPerProduct,
    isRepeatable: c.isRepeatable,
    offerStacking: c.offerStacking,
  };
}

export function validateBundleSelection(input: ValidateBundleSelectionInput): SelectionCheck {
  const now = input.now ?? new Date();
  const { campaign } = input;

  if (!campaign) {
    return {
      ok: false,
      code: "campaign_not_found",
      message: bundleRejectionMessage("campaign_not_found"),
      detail: null,
      campaign: null,
      evaluation: null,
      bundle: null,
    };
  }
  const storedTiers = input.tiers ?? [];
  const summary = summarize(campaign, storedTiers);
  const reject = (
    code: BundleRejectionCode,
    evaluation: BundleEvaluation | null = null,
    detail: BundleRejectionDetail | null = null,
  ): SelectionCheck => ({
    ok: false,
    code,
    message: bundleRejectionMessage(code, campaign.title, detail),
    detail,
    campaign: summary,
    evaluation,
    bundle: null,
  });

  if (getBundleCampaignState(campaign, now) !== "active") return reject("campaign_not_live");
  if (campaign.pricingType === "fixed_total" && (campaign.fixedBundlePrice === null || Number(campaign.fixedBundlePrice) <= 0)) {
    return reject("invalid_pricing");
  }

  // A curated stack's content is decided by the merchant: whatever the client
  // sent is discarded and the server-side composition is used instead.
  const isCurated = campaign.type === "curated_stack";
  const composition: readonly CuratedCompositionLine[] =
    input.composition ?? input.poolProductIds.map((productId) => ({ productId, quantity: 1 }));
  if (isCurated && composition.length === 0) return reject("invalid_pricing");
  const requested: readonly RequestedBundleItem[] = isCurated
    ? composition.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        selectedOptions: line.selectedOptions ?? null,
      }))
    : input.requested;

  // Product-level merge for stock and campaign rules; individual lines kept
  // for pricing and for the order, because two options of one product are
  // two sellable lines at (possibly) two prices.
  const pool = new Set(input.poolProductIds);
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const optionGroups = input.optionGroups ?? new Map<string, readonly PurchasableOptionGroup[]>();
  const requestedPerProduct = new Map<string, number>();
  const items: ValidatedBundleItem[] = [];

  for (const line of requested) {
    const quantity = Math.floor(line.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) continue;
    const row = byId.get(line.productId);
    if (!row || row.deleted || row.hidden) return reject("product_unavailable");
    if (!pool.has(row.id)) return reject("product_not_eligible");

    // Options: resolved against the product's CURRENT groups. The client's
    // map is only a request; the canonical map is what is priced and stored.
    const groups = optionGroups.get(row.id) ?? [];
    const resolved = resolveSelectedOptions(groups, line.selectedOptions);
    if (!resolved.ok) {
      const detail: BundleRejectionDetail = {
        productId: row.id,
        productName: row.name,
        optionName: resolved.optionName,
        value: resolved.value,
      };
      // A curated line the merchant never finished is the campaign's fault,
      // not the shopper's — say the stack is unavailable, never ask them to
      // choose something they cannot choose.
      return reject(isCurated ? "composition_incomplete" : resolved.code, null, detail);
    }

    requestedPerProduct.set(row.id, (requestedPerProduct.get(row.id) ?? 0) + quantity);
    const price = Number(row.price);
    const discountPrice = row.discountPrice === null ? null : Number(row.discountPrice);
    const unitPrice = resolvePurchasableLinePrice(discountPrice ?? price, resolved.priceModifier);
    const hasOptions = Object.keys(resolved.selectedOptions).length > 0;
    items.push({
      productId: row.id,
      name: row.name,
      quantity,
      unitPrice,
      price,
      discountPrice,
      priceModifier: resolved.priceModifier,
      selectedOptions: resolved.selectedOptions,
      optionsLabel: hasOptions ? formatSelectedOptions(resolved.selectedOptions) : null,
      imageUrl: row.imageUrl,
      categoryId: row.categoryId,
      stock: row.stock,
    });
  }

  // Stock is PRODUCT-level in this store (options never own inventory), so
  // Gold ×1 + Silver ×2 of one product need 3 units of that product.
  for (const [productId, quantity] of requestedPerProduct) {
    const row = byId.get(productId);
    if (!row || row.stock < quantity) {
      return reject("out_of_stock", null, row ? { productId, productName: row.name } : null);
    }
  }

  const config = toBundleCampaignConfig(campaign, input.poolProductIds, composition, storedTiers);
  // Curated stacks go through the same evaluator under the same derived
  // config the storefront/DTO uses (see curatedEvaluationConfig).
  const evaluation = evaluateBundleSelection(
    isCurated ? curatedEvaluationConfig(config) : config,
    items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
    { schedule: campaign, now },
  );

  if (!evaluation.qualifies) return reject(evaluation.reason ?? "not_enough_units", evaluation);
  if (evaluation.bundleTotal === null || evaluation.discountAmount === null) return reject("invalid_pricing", evaluation);

  if (
    input.expectedBundleTotal !== undefined &&
    input.expectedBundleTotal !== null &&
    Math.round(input.expectedBundleTotal * 100) !== Math.round(evaluation.bundleTotal * 100)
  ) {
    return reject("price_changed", evaluation);
  }

  return {
    ok: true,
    code: null,
    message: null,
    campaign: summary,
    evaluation,
    bundle: {
      campaignId: campaign.id,
      campaignSlug: campaign.slug,
      campaignTitle: campaign.title,
      campaignType: campaign.type,
      // Derived by the SERVER from the selection's unit count via the shared
      // evaluator — never taken from anything the client sent.
      tierId: evaluation.tier?.id ?? null,
      tierQuantity: evaluation.tier?.quantity ?? evaluation.requiredQuantity,
      // The evaluated requirement (for curated stacks: the composition's unit
      // count), so an order snapshot never records a stale column value.
      requiredQuantity: evaluation.requiredQuantity,
      offerStacking: campaign.offerStacking,
      isRepeatable: campaign.isRepeatable,
      regularTotal: evaluation.regularTotal,
      bundleTotal: evaluation.bundleTotal,
      savings: evaluation.discountAmount,
      items,
    },
  };
}

// ─── DB loader ────────────────────────────────────────────────────────────────

type Db = Pick<DatabaseClient, "select">;

/**
 * Loads everything `validateBundleSelection` needs, re-resolving eligibility
 * from the LIVE campaign every time.
 *
 * This is the guarantee behind dynamic eligibility: whatever the browser
 * believed when the stack entered the cart is irrelevant. If the merchant has
 * since narrowed the rules, moved a product to another category or repriced
 * it, the product is no longer in `poolProductIds` and the selection is
 * rejected as `product_not_eligible`. If a NEW product now matches, it is
 * accepted without the campaign being edited.
 *
 * For Build Your Stack the dynamic half is resolved only for the ids the
 * shopper actually selected (`resolveEligibleMembership`) — the full pool is
 * never materialised on the checkout path. That subset is exactly what the
 * pure evaluator consults for this selection, so the answer is identical to
 * resolving the whole pool, at a fraction of the cost.
 */
export async function loadSelectionContext(
  db: Db,
  campaignId: string,
  productIds: readonly string[],
): Promise<
  Pick<ValidateBundleSelectionInput, "campaign" | "poolProductIds" | "composition" | "products" | "tiers" | "optionGroups">
> {
  const [campaign] = await db.select().from(bundleCampaign).where(eq(bundleCampaign.id, campaignId)).limit(1);
  if (!campaign) {
    return { campaign: null, poolProductIds: [], composition: [], products: [], tiers: [], optionGroups: new Map() };
  }

  /**
   * Tiers are re-read on EVERY validation, so pricing is always the merchant's
   * current configuration. A cart holding "6 for 480" revalidates against
   * whatever the 6-piece tier costs now, and a tier the merchant has since
   * deleted simply is not found — the selection is rejected rather than
   * silently repriced onto a neighbouring tier.
   */
  const tierRows = await db
    .select({
      id: bundleCampaignTier.id,
      quantity: bundleCampaignTier.quantity,
      price: bundleCampaignTier.price,
    })
    .from(bundleCampaignTier)
    .where(eq(bundleCampaignTier.bundleCampaignId, campaignId))
    .orderBy(asc(bundleCampaignTier.quantity));
  const tiers: BundleTier[] = tierRows.map((t) => ({
    id: t.id,
    quantity: t.quantity,
    price: Number(t.price),
  }));

  const pool = await db
    .select({
      productId: bundleCampaignProduct.productId,
      quantity: bundleCampaignProduct.quantity,
      selectedOptions: bundleCampaignProduct.selectedOptions,
    })
    .from(bundleCampaignProduct)
    .where(eq(bundleCampaignProduct.bundleCampaignId, campaignId))
    .orderBy(asc(bundleCampaignProduct.sortOrder));

  // Curated: the products to load are the composition's, never the client's.
  const idsToLoad = campaign.type === "curated_stack" ? pool.map((p) => p.productId) : productIds;
  const uniqueIds = [...new Set(idsToLoad)];
  const products: SelectionProductRow[] =
    uniqueIds.length === 0
      ? []
      : await db
          .select({
            id: product.id,
            name: product.name,
            price: product.price,
            discountPrice: product.discountPrice,
            stock: product.stock,
            deleted: product.deleted,
            hidden: product.hidden,
            categoryId: product.categoryId,
            imageUrl: file.diskname,
          })
          .from(product)
          .leftJoin(file, eq(product.imageId, file.id))
          .where(and(inArray(product.id, uniqueIds)));

  // Option groups for exactly the products being validated — one batched
  // query (plus the settings read), never one per product. This is the
  // narrow checkout-path read: selected product ids only, not the pool.
  const optionGroups = await loadPurchasableOptionGroups(db, uniqueIds);

  const manualIds = pool.map((p) => p.productId);
  const poolProductIds =
    campaign.type === "curated_stack"
      ? manualIds
      : await effectiveSelectionPool(db, campaign, manualIds, productIds);

  return {
    campaign,
    tiers,
    poolProductIds,
    composition: pool.map((p) => ({ productId: p.productId, quantity: p.quantity, selectedOptions: p.selectedOptions ?? null })),
    products,
    optionGroups,
  };
}

/**
 * The effective pool as far as THIS selection is concerned: the manual pool
 * under a mode that uses it, plus whichever of the requested products the
 * dynamic rules currently accept, deduplicated and manual-first (the ordering
 * `mergeEligiblePools` defines).
 */
async function effectiveSelectionPool(
  db: Db,
  campaign: BundleCampaignRow,
  manualIds: readonly string[],
  requestedIds: readonly string[],
): Promise<string[]> {
  const categories = await loadEligibilityCategories(db, [campaign.id]);
  const rules = toEligibilityRules(campaign, categories.get(campaign.id));
  const matched = await resolveEligibleMembership(
    db,
    { type: campaign.type, mode: campaign.eligibilityMode, rules },
    requestedIds,
  );
  return mergeEligiblePools(
    campaign.eligibilityMode,
    manualIds.map((productId) => ({ productId })),
    [...matched].map((productId) => ({ productId })),
  ).products.map((r) => r.productId);
}

/** Load + validate in one call. Usable inside an order transaction (pass `tx`). */
export async function loadAndValidateBundleSelection(
  db: Db,
  args: {
    campaignId: string;
    requested: readonly RequestedBundleItem[];
    expectedBundleTotal?: number | null;
    now?: Date;
  },
): Promise<SelectionCheck> {
  const context = await loadSelectionContext(
    db,
    args.campaignId,
    args.requested.map((r) => r.productId),
  );
  return validateBundleSelection({
    ...context,
    requested: args.requested,
    expectedBundleTotal: args.expectedBundleTotal,
    now: args.now,
  });
}
