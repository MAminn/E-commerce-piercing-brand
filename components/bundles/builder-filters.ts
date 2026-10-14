/**
 * Browse helpers for the Pick Your Set builder. Pure, so the exact matching
 * rules are testable. They only decide which pool products are SHOWN — never
 * what is selected, what is eligible, or how anything is priced.
 */

interface FilterableProduct {
  name: string;
  categories?: readonly { id: string; name: string }[];
}

/** Case-, accent- and spacing-insensitive form used for name search. */
function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The categories worth a filter chip: those carried by at least one pool
 * product, most-populated first (then by name), each listed once. Products
 * with no category data simply contribute nothing — no chip is invented.
 */
export function builderFilterCategories(pool: readonly FilterableProduct[]): { id: string; name: string; count: number }[] {
  const byId = new Map<string, { id: string; name: string; count: number }>();
  for (const p of pool) {
    for (const c of p.categories ?? []) {
      const entry = byId.get(c.id) ?? { id: c.id, name: c.name, count: 0 };
      entry.count += 1;
      byId.set(c.id, entry);
    }
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Pool products matching a name search (every word must appear) and an optional category. */
export function filterBuilderPool<T extends FilterableProduct>(
  pool: readonly T[],
  { search, categoryId }: { search: string; categoryId: string | null },
): T[] {
  const words = normalize(search).split(" ").filter(Boolean);
  return pool.filter((p) => {
    if (categoryId && !(p.categories ?? []).some((c) => c.id === categoryId)) return false;
    if (words.length === 0) return true;
    const name = normalize(p.name);
    return words.every((w) => name.includes(w));
  });
}
