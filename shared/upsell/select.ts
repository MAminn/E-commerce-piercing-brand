import type { UpsellMode, UpsellSettings } from "./config";

/**
 * The upsell resolver's decision logic, kept free of I/O so the server, the
 * tests and the storefront all run the exact same rules.
 *
 * The server owns eligibility: it loads the catalogue and calls
 * `resolveUpsells`, which applies the product's mode, stock, visibility and
 * exclusion rules and returns an ordered pool. The storefront only ever
 * narrows that pool with `pickUpsells` — by what is in the shopper's bag,
 * which lives in the browser and which the server cannot see.
 */

export interface UpsellCandidate {
  id: string;
  stock: number;
  hidden?: boolean;
  deleted?: boolean;
  /** Every category the product belongs to (primary + junction). */
  categoryIds: string[];
}

export interface UpsellSubject {
  id: string;
  mode: UpsellMode;
  /** Admin-ordered manual list. Only read in `manual` mode. */
  manualIds: string[];
  categoryIds: string[];
}

export interface ResolveUpsellsInput<T extends UpsellCandidate> {
  settings: UpsellSettings;
  product: UpsellSubject;
  /** Products that may be recommended. Ineligible rows are filtered here too. */
  candidates: T[];
  /** Products never to return — typically what is already in the bag. */
  excludeIds?: readonly string[];
  /**
   * Fixes the random order. The same seed always yields the same order, so a
   * shopper sees one stable set for a product during their session instead of
   * a reshuffle on every request.
   */
  seed: string;
  /**
   * How many to return. Larger than what a surface displays, so the post-add
   * sheet can replace an item the shopper already took without a refetch.
   */
  poolSize: number;
}

export type UpsellSource = "manual" | "random" | "none";

export interface ResolvedUpsells<T> {
  source: UpsellSource;
  items: T[];
}

/** In stock, visible and not deleted. */
export function isUpsellEligible(c: UpsellCandidate): boolean {
  return c.stock > 0 && !c.hidden && !c.deleted;
}

/**
 * cyrb53 — a small, well-distributed, non-cryptographic string hash. Used
 * only to order recommendations, never for anything security-relevant.
 */
export function hashString(input: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Seeded order: every product gets its own key from (seed, id) and the list
 * is sorted by it. Unlike a seeded Fisher–Yates, adding or removing one
 * product (a restock, a sell-out) does not reshuffle all the others — the
 * relative order of the rest is untouched.
 */
export function seededOrder<T extends { id: string }>(
  items: readonly T[],
  seed: string,
): T[] {
  return items
    .map((item) => ({ item, key: hashString(`${seed}:${item.id}`) }))
    .sort((a, b) => a.key - b.key || (a.item.id < b.item.id ? -1 : 1))
    .map(({ item }) => item);
}

function sharesCategory(a: readonly string[], b: readonly string[]): boolean {
  return a.some((id) => b.includes(id));
}

export function resolveUpsells<T extends UpsellCandidate>({
  settings,
  product,
  candidates,
  excludeIds = [],
  seed,
  poolSize,
}: ResolveUpsellsInput<T>): ResolvedUpsells<T> {
  if (!settings.enabled || product.mode === "disabled" || poolSize <= 0) {
    return { source: "none", items: [] };
  }

  const excluded = new Set<string>([product.id, ...excludeIds]);
  const byId = new Map<string, T>();
  for (const c of candidates) {
    if (!byId.has(c.id)) byId.set(c.id, c);
  }

  if (product.mode === "manual") {
    // Manual overrides random entirely: only what the admin picked, in the
    // admin's order. An unavailable pick is skipped, not replaced with a
    // random product — the owner chose this list on purpose.
    const seen = new Set<string>();
    const items: T[] = [];
    for (const id of product.manualIds) {
      if (seen.has(id) || excluded.has(id)) continue;
      seen.add(id);
      const c = byId.get(id);
      if (c && isUpsellEligible(c)) items.push(c);
      if (items.length >= poolSize) break;
    }
    return { source: "manual", items };
  }

  // Global default — random. Eligibility and the category rule are applied
  // before ordering; exclusions after, so taking one item out (because it was
  // just added to the bag) moves the next one up without reordering the rest.
  const eligible = [...byId.values()].filter((c) => {
    if (c.id === product.id || !isUpsellEligible(c)) return false;
    if (settings.randomPool === "other-categories") {
      return !sharesCategory(c.categoryIds, product.categoryIds);
    }
    if (settings.randomPool === "same-category") {
      return sharesCategory(c.categoryIds, product.categoryIds);
    }
    return true;
  });

  const items = seededOrder(eligible, seed)
    .filter((c) => !excluded.has(c.id))
    .slice(0, poolSize);

  return { source: "random", items };
}

/**
 * How many recommendations the server returns for a surface showing
 * `maxItems`. The surplus is what lets the post-add sheet skip an item the
 * shopper already took from the product page and still show a full row.
 */
export function upsellPoolSize(maxItems: number, mode: UpsellMode): number {
  if (mode === "manual") return 24;
  return Math.min(18, Math.max(1, maxItems) * 3);
}

/**
 * Storefront-side narrowing of a server-resolved pool: drop anything the
 * shopper already has, drop duplicates, keep the server's order, take `limit`.
 * It never adds or re-ranks — eligibility stays the server's decision.
 */
export function pickUpsells<T extends { id: string }>(
  pool: readonly T[],
  excludeIds: Iterable<string>,
  limit: number,
): T[] {
  const excluded = new Set(excludeIds);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of pool) {
    if (out.length >= limit) break;
    if (excluded.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
