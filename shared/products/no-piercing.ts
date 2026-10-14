/**
 * "No piercing needed" — decided from the product's CATEGORY, which the
 * merchant assigns (e.g. the "Fake Piercings" placement), never from words in
 * a product title or description. A category named fake / faux / clip-on /
 * no-piercing means exactly that by definition; nothing else is inferred
 * (an ear cuff in an "Ear Cuffs" category is NOT flagged — the store has not
 * said so).
 */
const NO_PIERCING_CATEGORY = /(^|[^a-z])(fake|faux|clip[\s-]?on|no[\s-]?piercing)([^a-z]|$)/i;

export function isNoPiercingCategory(name: string | null | undefined): boolean {
  return typeof name === "string" && NO_PIERCING_CATEGORY.test(name);
}

export function needsNoPiercing(product: {
  categoryName?: string | null;
  categories?: readonly { name: string }[] | null;
}): boolean {
  if (isNoPiercingCategory(product.categoryName)) return true;
  return (product.categories ?? []).some((c) => isNoPiercingCategory(c.name));
}
