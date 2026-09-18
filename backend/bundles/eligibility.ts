/**
 * THE authoritative Build Your Stack eligibility resolver (Phase 4).
 *
 * Every surface that needs to know which products belong to a campaign —
 * storefront listings, the bundle detail builder, cart validation, checkout /
 * order creation, the admin CMS preview — goes through `resolveEligiblePools`
 * or through `service.ts`/`selection.ts`, which call it. There is no second
 * implementation of these rules anywhere, and in particular none in the
 * browser: the client only ever sends product ids and is told yes or no.
 *
 * ── Why batched ─────────────────────────────────────────────────────────────
 * The obvious shape (for each campaign → read its rules → read its products)
 * is an N+1 and would make every card listing quadratic in campaign count.
 * Instead the resolver takes ALL campaigns at once and runs a fixed number of
 * queries regardless of how many there are:
 *
 *   1. one query for every campaign's eligibility categories
 *   2. one query for the union of candidate products (an OR of each campaign's
 *      narrowed predicate, so the database never returns the whole catalogue
 *      for a campaign that filters on category)
 *
 * The SQL only NARROWS. Assignment of a candidate to a campaign is then done
 * in memory by `matchesEligibilityRules`, the same pure predicate the unit
 * tests pin down, so SQL and domain can never drift apart.
 *
 * Callers that already know a campaign is `manual` (and every `curated_stack`)
 * cost nothing: those campaigns are filtered out before any query runs.
 */

import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  bundleCampaignEligibilityCategory,
  file,
  product,
} from "#root/shared/database/drizzle/schema";
import {
  type BundleEligibilityMode,
  type BundleEligibilityRules,
  type EligibilityCandidate,
  candidateEffectivePrice,
  hasAnyEligibilityRule,
  matchesEligibilityRules,
  modeUsesDynamic,
} from "#root/shared/bundles/eligibility";
import { and, asc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";

/** Either the request-scoped client or a transaction handle. */
type Db = Pick<DatabaseClient, "select">;

// ─── Inputs / outputs ─────────────────────────────────────────────────────────

/**
 * What the resolver needs to know about one campaign. Deliberately not the
 * Drizzle row: `create` validates a campaign that does not exist yet, and the
 * CMS previews rules the merchant has not saved.
 */
export interface CampaignEligibilitySpec {
  /** Any stable key; the returned map is keyed by it. For saved campaigns, the campaign id. */
  key: string;
  type: "build_your_stack" | "curated_stack";
  mode: BundleEligibilityMode;
  rules: BundleEligibilityRules;
}

/**
 * A dynamically matched product, in the same shape the manual pool uses, so
 * the two merge without translation.
 */
export interface DynamicPoolProduct {
  productId: string;
  name: string;
  slug: string | null;
  price: number;
  discountPrice: number | null;
  stock: number;
  imageUrl: string | null;
  categoryId: string | null;
  /** Always false — the resolver never returns retired products. */
  deleted: boolean;
  hidden: boolean;
}

type CandidateRow = EligibilityCandidate & Omit<DynamicPoolProduct, "productId">;

// ─── SQL narrowing ────────────────────────────────────────────────────────────

/**
 * The product's effective price in SQL, matching
 * `candidateEffectivePrice`: the discount when it is genuinely lower,
 * otherwise the regular price.
 */
const effectivePriceSql = sql<string>`least(${product.price}, coalesce(${product.discountPrice}, ${product.price}))`;

/** One campaign's rules as a SQL predicate. Null when the rules match nothing. */
function ruleCondition(rules: BundleEligibilityRules): SQL | undefined {
  if (!hasAnyEligibilityRule(rules)) return undefined;
  const parts: (SQL | undefined)[] = [];
  if (rules.categoryIds.length > 0) {
    parts.push(inArray(product.categoryId, [...rules.categoryIds]));
  }
  if (rules.minPrice !== null) parts.push(gte(effectivePriceSql, rules.minPrice.toFixed(2)));
  if (rules.maxPrice !== null) parts.push(lte(effectivePriceSql, rules.maxPrice.toFixed(2)));
  return and(...parts);
}

// ─── Rule loading ─────────────────────────────────────────────────────────────

/**
 * Every campaign's eligibility categories in ONE query. Campaigns with no rows
 * are absent from the map (an empty category filter, not "no categories exist").
 */
export async function loadEligibilityCategories(
  db: Db,
  campaignIds: readonly string[],
): Promise<Map<string, string[]>> {
  const byCampaign = new Map<string, string[]>();
  if (campaignIds.length === 0) return byCampaign;
  const rows = await db
    .select({
      campaignId: bundleCampaignEligibilityCategory.bundleCampaignId,
      categoryId: bundleCampaignEligibilityCategory.categoryId,
    })
    .from(bundleCampaignEligibilityCategory)
    .where(inArray(bundleCampaignEligibilityCategory.bundleCampaignId, [...campaignIds]))
    .orderBy(asc(bundleCampaignEligibilityCategory.createdAt));
  for (const r of rows) {
    const list = byCampaign.get(r.campaignId) ?? [];
    list.push(r.categoryId);
    byCampaign.set(r.campaignId, list);
  }
  return byCampaign;
}

/** Builds the rule object for a campaign row + its loaded category ids. */
export function toEligibilityRules(
  row: { eligibilityMinPrice: string | null; eligibilityMaxPrice: string | null },
  categoryIds: readonly string[] | undefined,
): BundleEligibilityRules {
  return {
    categoryIds: categoryIds ?? [],
    minPrice: row.eligibilityMinPrice === null ? null : Number(row.eligibilityMinPrice),
    maxPrice: row.eligibilityMaxPrice === null ? null : Number(row.eligibilityMaxPrice),
  };
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Dynamic matches for every given campaign, in ONE product query.
 *
 * Returned lists are sorted by product name — the same secondary ordering the
 * manual pool query uses — so the merged effective pool is deterministic.
 *
 * Hidden and soft-deleted products are excluded in SQL AND re-checked by the
 * pure predicate: dynamic rules must never make a retired product selectable.
 */
export async function resolveEligiblePools(
  db: Db,
  specs: readonly CampaignEligibilitySpec[],
): Promise<Map<string, DynamicPoolProduct[]>> {
  const result = new Map<string, DynamicPoolProduct[]>();

  // Curated stacks never use dynamic eligibility; manual-mode campaigns have
  // no rules to run. Both are answered without touching the database.
  const dynamicSpecs = specs.filter(
    (s) => s.type === "build_your_stack" && modeUsesDynamic(s.mode) && hasAnyEligibilityRule(s.rules),
  );
  for (const spec of specs) result.set(spec.key, []);
  if (dynamicSpecs.length === 0) return result;

  const conditions = dynamicSpecs
    .map((s) => ruleCondition(s.rules))
    .filter((c): c is SQL => c !== undefined);
  if (conditions.length === 0) return result;

  const rows = await db
    .select({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      discountPrice: product.discountPrice,
      stock: product.stock,
      categoryId: product.categoryId,
      deleted: product.deleted,
      hidden: product.hidden,
      imageUrl: file.diskname,
    })
    .from(product)
    .leftJoin(file, eq(product.imageId, file.id))
    .where(
      and(
        eq(product.deleted, false),
        eq(product.hidden, false),
        conditions.length === 1 ? conditions[0] : or(...conditions),
      ),
    )
    .orderBy(asc(product.name), asc(product.id));

  const candidates: (CandidateRow & { productId: string })[] = rows.map((r) => ({
    productId: r.productId,
    name: r.name,
    slug: r.slug,
    price: Number(r.price),
    discountPrice: r.discountPrice === null ? null : Number(r.discountPrice),
    stock: r.stock,
    categoryId: r.categoryId,
    deleted: r.deleted,
    hidden: r.hidden,
    imageUrl: r.imageUrl,
  }));

  // Assignment is done by the pure predicate, not by re-reading the SQL, so
  // the domain rules stay the single source of truth.
  for (const spec of dynamicSpecs) {
    const matched: DynamicPoolProduct[] = [];
    for (const c of candidates) {
      if (!matchesEligibilityRules(spec.rules, c)) continue;
      const { categoryId: _categoryId, ...rest } = c;
      matched.push({ ...rest, categoryId: c.categoryId });
    }
    result.set(spec.key, matched);
  }
  return result;
}

/**
 * Convenience for the single-campaign path. Still one query — it just wraps
 * the batched resolver.
 */
export async function resolveEligiblePool(
  db: Db,
  spec: Omit<CampaignEligibilitySpec, "key">,
): Promise<DynamicPoolProduct[]> {
  const pools = await resolveEligiblePools(db, [{ ...spec, key: "one" }]);
  return pools.get("one") ?? [];
}

/**
 * "Which of THESE products does the campaign's dynamic half currently accept?"
 *
 * The validation path (cart check, checkout, order creation) never needs the
 * whole pool — it needs a yes/no for the handful of products the shopper
 * actually put in the stack. Resolving the full pool there would read the
 * campaign's entire catalogue slice on every checkout for no benefit.
 *
 * Same rules, same pure predicate, same "never resurrect a hidden or deleted
 * product" guarantee — only the candidate set is narrowed. Returns the subset
 * of `productIds` that the rules match.
 */
export async function resolveEligibleMembership(
  db: Db,
  spec: Omit<CampaignEligibilitySpec, "key">,
  productIds: readonly string[],
): Promise<Set<string>> {
  const matched = new Set<string>();
  const unique = [...new Set(productIds)];
  if (
    unique.length === 0 ||
    spec.type !== "build_your_stack" ||
    !modeUsesDynamic(spec.mode) ||
    !hasAnyEligibilityRule(spec.rules)
  ) {
    return matched;
  }
  const condition = ruleCondition(spec.rules);
  if (!condition) return matched;

  const rows = await db
    .select({
      productId: product.id,
      categoryId: product.categoryId,
      price: product.price,
      discountPrice: product.discountPrice,
      deleted: product.deleted,
      hidden: product.hidden,
    })
    .from(product)
    .where(
      and(
        inArray(product.id, unique),
        eq(product.deleted, false),
        eq(product.hidden, false),
        condition,
      ),
    );

  for (const r of rows) {
    const candidate: EligibilityCandidate = {
      productId: r.productId,
      categoryId: r.categoryId,
      price: Number(r.price),
      discountPrice: r.discountPrice === null ? null : Number(r.discountPrice),
      deleted: r.deleted,
      hidden: r.hidden,
    };
    if (matchesEligibilityRules(spec.rules, candidate)) matched.add(r.productId);
  }
  return matched;
}

/** Re-exported so callers need only this module for the price convention. */
export { candidateEffectivePrice };
