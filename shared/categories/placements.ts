/**
 * Placement — the storefront's browsing spine. Pure and shared by the navbar,
 * the homepage placement index and the listing chips, so they cannot
 * disagree about what a placement is.
 *
 * A placement is a main category a shopper can see (Ear, Nose), with its
 * visible, non-empty subcategories (Daith, Rook…). Labels drop the trailing
 * "Piercings" ("Ear Piercings" → "Ear"); everything else is the stored data.
 * Counts are the category's real `productCount` (storefront-visible products,
 * backend/categories/view-categories) — never estimated.
 */
import {
  buildCategoryTree,
  compareCategories,
  isGenericSubcategory,
  storefrontCategoryNav,
  visibleToShoppers,
  type CategoryNodeLike,
} from "./tree";
import { placementLabel } from "#root/shared/products/index-line";

type Row = CategoryNodeLike & { productCount?: number };

export interface Placement {
  id: string;
  slug: string;
  /** "Ear", "Daith". */
  label: string;
  href: string;
  /**
   * Products in the placement, or null when it is not a single stored figure:
   * a main category's own count does not include products filed only under
   * its subcategories, so a main with subcategories shows no count rather
   * than a wrong one.
   */
  count: number | null;
  children: Placement[];
}

export const placementHref = (slug: string) => `/categories/${encodeURIComponent(slug)}`;

/**
 * Main placements in admin order, each with its visible, non-generic,
 * non-empty subcategories. A main with no products and no such
 * subcategories is left out — a placement that leads nowhere is noise.
 */
export function placementTree(rows: readonly Row[]): Placement[] {
  const visible = visibleToShoppers(rows);
  return buildCategoryTree(visible)
    .map((main) => {
      const children = main.children
        .filter((c) => !isGenericSubcategory(c, main) && (c.productCount ?? 0) > 0)
        .sort(compareCategories)
        .map<Placement>((c) => ({
          id: c.id,
          slug: c.slug,
          label: placementLabel(c.name),
          href: placementHref(c.slug),
          count: c.productCount ?? null,
          children: [],
        }));
      return {
        id: main.id,
        slug: main.slug,
        label: placementLabel(main.name),
        href: placementHref(main.slug),
        count: children.length > 0 ? null : (main.productCount ?? null),
        children,
      } satisfies Placement;
    })
    .filter((p) => p.children.length > 0 || (p.count ?? 0) > 0);
}

/**
 * A product's placement as labels, placement first: ["Ear", "Rook"]. Built
 * from the product's own categories, ordered by the tree (a main category,
 * then its subcategories), so a product filed under "Rook" reads "Ear · Rook"
 * whichever category happens to be its primary one. Without the tree it
 * falls back to the names as given.
 */
export function productPlacement(
  product: { categoryName?: string | null; categories?: readonly { id: string; name: string }[] | null },
  rows: readonly Row[] | null | undefined,
): string[] {
  const names = [product.categoryName, ...(product.categories ?? []).map((c) => c.name)].filter(
    (n): n is string => !!n?.trim(),
  );
  if (!rows?.length) return [...new Set(names.map(placementLabel))];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));
  const own = [
    ...(product.categories ?? []).map((c) => byId.get(c.id)),
    ...names.map((n) => byName.get(n.trim().toLowerCase())),
  ].filter((r): r is Row => !!r && !r.hidden);
  const mains = new Map<string, Row>();
  const subs: Row[] = [];
  for (const r of own) {
    const main = r.parentId ? byId.get(r.parentId) : r;
    if (main && !main.hidden) mains.set(main.id, main);
    if (r.parentId && main && !isGenericSubcategory(r, main)) subs.push(r);
  }
  const ordered = [...mains.values()].sort(compareCategories).flatMap((m) => [
    m,
    ...subs.filter((s) => s.parentId === m.id).sort(compareCategories),
  ]);
  return [...new Set(ordered.map((r) => placementLabel(r.name)))];
}

export interface PlacementChip {
  id: string;
  label: string;
  href: string;
  active: boolean;
}

/**
 * The chip row under a listing's title.
 *   /shop                      All · Ear · Nose            (All active)
 *   a placement with subs      All · Daith · Rook · …      (All = the placement)
 *   one of its subs            All · Daith · Rook · …      (that sub active)
 *   a placement with no subs   All · Ear · Nose            (it is active)
 * `allLabel` is the localized "All". Empty when there is nothing to choose.
 */
export function placementChips(
  rows: readonly Row[],
  currentRef: string | null | undefined,
  allLabel: string,
): PlacementChip[] {
  const tree = placementTree(rows);
  const nav = currentRef ? storefrontCategoryNav(rows, currentRef) : undefined;
  const main = nav ? tree.find((p) => p.id === nav.main.id) : undefined;

  if (main && main.children.length > 0 && nav) {
    return [
      { id: main.id, label: allLabel, href: main.href, active: nav.current.id === main.id },
      ...main.children.map((c) => ({ id: c.id, label: c.label, href: c.href, active: c.id === nav.current.id })),
    ];
  }
  if (tree.length === 0) return [];
  return [
    { id: "__all", label: allLabel, href: "/shop", active: !nav },
    ...tree.map((p) => ({ id: p.id, label: p.label, href: p.href, active: nav?.main.id === p.id })),
  ];
}
