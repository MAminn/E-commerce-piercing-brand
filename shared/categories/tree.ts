/**
 * Category hierarchy helpers — pure, shared by the server and the browser.
 *
 * The catalogue is two levels deep: a MAIN category (`parentId === null`,
 * e.g. "Ear Piercings") and its SUBCATEGORIES (`parentId` = the main's id,
 * e.g. "Helix"). Membership itself lives in `product.category_id` and the
 * `product_category` junction (see backend/categories/category-products.ts);
 * nothing here touches products.
 *
 * Everything that orders, nests, resolves or hides categories goes through
 * this module so the dashboard, the storefront tabs and the homepage strip
 * cannot disagree about what "the Helix subcategory of Ear Piercings" is.
 */

export interface CategoryNodeLike {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  hidden: boolean;
  /** ISO string or Date; only used to break `sortOrder` ties. */
  createdAt?: string | Date | null;
}

export type CategoryTreeNode<T extends CategoryNodeLike> = T & {
  children: T[];
};

function createdAtMs(value: CategoryNodeLike["createdAt"]): number {
  if (!value) return 0;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/** Sibling order: explicit position, then creation order, then id. */
export function compareCategories(
  a: CategoryNodeLike,
  b: CategoryNodeLike,
): number {
  return (
    a.sortOrder - b.sortOrder ||
    createdAtMs(a.createdAt) - createdAtMs(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Nests a flat category list. A row whose parent is not in the list (a
 * subcategory of a deleted main, which the delete guards prevent but older
 * data could hold) is promoted to the top level rather than dropped, so its
 * products are never unreachable.
 */
export function buildCategoryTree<T extends CategoryNodeLike>(
  rows: readonly T[],
): CategoryTreeNode<T>[] {
  const ids = new Set(rows.map((r) => r.id));
  const isTopLevel = (r: T) => r.parentId === null || !ids.has(r.parentId);

  const childrenOf = new Map<string, T[]>();
  for (const row of rows) {
    if (isTopLevel(row)) continue;
    const list = childrenOf.get(row.parentId as string) ?? [];
    list.push(row);
    childrenOf.set(row.parentId as string, list);
  }

  return rows
    .filter(isTopLevel)
    .sort(compareCategories)
    .map((main) => ({
      ...main,
      children: (childrenOf.get(main.id) ?? []).sort(compareCategories),
    }));
}

/**
 * A row is hidden from shoppers when it, or its main category, is hidden.
 * `byId` must contain the parent for the parent rule to apply.
 */
export function isEffectivelyHidden<T extends CategoryNodeLike>(
  row: T,
  byId: ReadonlyMap<string, T>,
): boolean {
  if (row.hidden) return true;
  if (!row.parentId) return false;
  return byId.get(row.parentId)?.hidden ?? false;
}

/**
 * The categories a shopper may see in navigation and search: drops hidden
 * categories and the subcategories of hidden main categories. Rows without
 * a `hidden` field (older payloads) are kept.
 */
export function visibleToShoppers<
  T extends { id: string; parentId?: string | null; hidden?: boolean },
>(rows: readonly T[]): T[] {
  const hiddenIds = new Set(rows.filter((r) => r.hidden).map((r) => r.id));
  return rows.filter(
    (r) => !r.hidden && !(r.parentId && hiddenIds.has(r.parentId)),
  );
}

/**
 * Comparable form of a category name: case, spacing, punctuation and a
 * trailing plural "s" ignored, so "Ear piercings", "Ear Piercing" and
 * "ear-piercings" all compare equal.
 */
export function normalizeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .map((word) => (word.length > 3 ? word.replace(/s$/, "") : word))
    .join(" ");
}

/**
 * A "generic" subcategory just repeats its parent's name ("Ear Piercings" →
 * "Ear piercings"). Those are legacy catch-alls created before real
 * subcategories existed: products in them are not meaningfully classified.
 * The dashboard flags them and counts their products as still needing a
 * specific subcategory; nothing is ever moved or deleted automatically.
 */
export function isGenericSubcategory(
  sub: Pick<CategoryNodeLike, "name">,
  parent: Pick<CategoryNodeLike, "name">,
): boolean {
  return normalizeCategoryName(sub.name) === normalizeCategoryName(parent.name);
}

/**
 * Resolves a `/categories/<slug>` or `?category=<slug|id>` value.
 *
 * Slugs were never unique (a legacy subcategory often shares its parent's
 * slug), and the storefront used to take whichever row `Array.find` met first.
 * Resolution is now deterministic: an exact id wins; otherwise a main category
 * beats a subcategory with the same slug, then sibling order decides.
 */
export function resolveCategoryRef<T extends CategoryNodeLike>(
  rows: readonly T[],
  ref: string | null | undefined,
): T | undefined {
  if (!ref) return undefined;
  const byId = rows.find((r) => r.id === ref);
  if (byId) return byId;

  const wanted = safeDecode(ref).toLowerCase();
  const matches = rows.filter((r) => r.slug.toLowerCase() === wanted);
  return matches.sort(
    (a, b) =>
      Number(a.parentId !== null) - Number(b.parentId !== null) ||
      compareCategories(a, b),
  )[0];
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export interface StorefrontCategoryNav<T extends CategoryNodeLike> {
  /** The category the URL points at. */
  current: T;
  /** Its main category (itself when `current` is a main category). */
  main: T;
  /** Subcategory tabs to show: visible, non-empty, in admin order. */
  tabs: T[];
  /**
   * Every category whose products belong on this listing: a main category
   * lists its own products plus all of its subcategories' (hidden ones too —
   * hiding is navigation-only), a subcategory lists just its own.
   */
  listingIds: string[];
}

/**
 * Everything a shopper-facing category page needs, or `undefined` when the
 * reference does not resolve to a category a shopper may open (unknown slug,
 * hidden category, or a subcategory of a hidden main).
 */
export function storefrontCategoryNav<
  T extends CategoryNodeLike & { productCount?: number },
>(rows: readonly T[], ref: string | null | undefined): StorefrontCategoryNav<T> | undefined {
  const current = resolveCategoryRef(rows, ref);
  if (!current) return undefined;

  const byId = new Map(rows.map((r) => [r.id, r]));
  if (isEffectivelyHidden(current, byId)) return undefined;

  const main =
    current.parentId && byId.has(current.parentId)
      ? (byId.get(current.parentId) as T)
      : current;
  const children = rows
    .filter((r) => r.parentId === main.id)
    .sort(compareCategories);

  const tabs = children.filter(
    (c) =>
      !c.hidden &&
      !isGenericSubcategory(c, main) &&
      // An empty tab is a dead end. The tab for the page the shopper is on
      // stays, so the active state never disappears from under them.
      ((c.productCount ?? 1) > 0 || c.id === current.id),
  );

  const listingIds =
    current.id === main.id ? [main.id, ...children.map((c) => c.id)] : [current.id];

  return { current, main, tabs, listingIds };
}

/**
 * The homepage "Shop by placement" strip: categories the admin featured
 * (`showOnLanding`), in tree order — each main category followed by its
 * featured subcategories — excluding anything hidden and empty subcategories.
 */
export function landingCategories<
  T extends CategoryNodeLike & { showOnLanding: boolean; productCount?: number },
>(rows: readonly T[], limit = 8): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: T[] = [];
  for (const main of buildCategoryTree(rows)) {
    for (const row of [main, ...main.children] as T[]) {
      if (!row.showOnLanding || isEffectivelyHidden(row, byId)) continue;
      if (row !== main && (row.productCount ?? 1) <= 0) continue;
      // A legacy catch-all ("Ear piercings" under "Ear Piercings") would be
      // a second tile for the same thing.
      if (row !== main && isGenericSubcategory(row, main)) continue;
      out.push(row);
    }
  }
  return out.slice(0, limit);
}

/**
 * Next free slug. Tries `base`, then `<parentSlug>-<base>` (so a second
 * "Hoops" under Nose becomes `nose-piercings-hoops`, not `hoops-2`), then
 * numbered suffixes. `base` must already be slugified.
 */
export function uniqueSlug(
  base: string,
  taken: ReadonlySet<string>,
  parentSlug?: string | null,
): string {
  const root = base || "category";
  if (!taken.has(root)) return root;
  const scoped = parentSlug ? `${parentSlug}-${root}` : root;
  if (!taken.has(scoped)) return scoped;
  for (let n = 2; ; n++) {
    const candidate = `${scoped}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Shape check for an admin-typed slug: lowercase words joined by hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
