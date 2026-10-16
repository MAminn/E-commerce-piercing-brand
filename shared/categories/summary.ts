import {
  buildCategoryTree,
  isGenericSubcategory,
  type CategoryNodeLike,
} from "./tree";

/** One product↔category link, from either assignment path. */
export interface CategoryMembership {
  productId: string;
  categoryId: string;
  /** `product.hidden` — still a live product, just not in the public shop. */
  productHidden: boolean;
}

export interface SubcategorySummary {
  /** Live products in this subcategory (hidden products included). */
  productCount: number;
  /** Of those, how many a shopper can see. */
  visibleProductCount: number;
  /**
   * The subcategory only repeats its parent's name — a legacy catch-all. Its
   * products still count as needing a specific subcategory.
   */
  generic: boolean;
}

export interface MainCategorySummary {
  /** Distinct live products in the main category or any of its subcategories. */
  productCount: number;
  visibleProductCount: number;
  /**
   * Products in the group that are in no specific (non-generic) subcategory —
   * the "needs a subcategory" work list. 0 when the category has no specific
   * subcategories yet, since there is nothing to classify into.
   */
  unclassifiedCount: number;
}

/**
 * The dashboard's view of the catalogue: main categories in admin order, each
 * with its subcategories and product counts. Memberships may repeat (a
 * product attached by both the FK and the junction); every count is of
 * DISTINCT products.
 */
export function summarizeCategoryTree<T extends CategoryNodeLike>(
  rows: readonly T[],
  memberships: readonly CategoryMembership[],
): Array<T & MainCategorySummary & { children: Array<T & SubcategorySummary> }> {
  const productsIn = new Map<string, Set<string>>();
  const hiddenProducts = new Set<string>();
  for (const m of memberships) {
    let set = productsIn.get(m.categoryId);
    if (!set) {
      set = new Set();
      productsIn.set(m.categoryId, set);
    }
    set.add(m.productId);
    if (m.productHidden) hiddenProducts.add(m.productId);
  }

  const union = (ids: readonly string[]) => {
    const out = new Set<string>();
    for (const id of ids) for (const p of productsIn.get(id) ?? []) out.add(p);
    return out;
  };
  const visible = (set: Set<string>) =>
    [...set].filter((p) => !hiddenProducts.has(p)).length;

  return buildCategoryTree(rows).map(({ children, ...main }) => {
    const subs = children.map((sub) => {
      const own = productsIn.get(sub.id) ?? new Set<string>();
      return {
        ...sub,
        productCount: own.size,
        visibleProductCount: visible(own),
        generic: isGenericSubcategory(sub, main),
      };
    });

    const group = union([main.id, ...children.map((c) => c.id)]);
    const specific = subs.filter((s) => !s.generic);
    const classified = union(specific.map((s) => s.id));

    return {
      ...(main as unknown as T),
      productCount: group.size,
      visibleProductCount: visible(group),
      unclassifiedCount:
        specific.length === 0 ? 0 : [...group].filter((p) => !classified.has(p)).length,
      children: subs,
    };
  });
}
