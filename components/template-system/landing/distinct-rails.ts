/**
 * Homepage product rails, each SKU shown once.
 *
 * "New in", "Featured" and "On sale" are filled by independent queries, so
 * the same pieces used to appear in two or three rails in a row — the page
 * read as a repeated catalogue rather than distinct merchandising. Rails are
 * resolved in priority order: a product stays in the first rail that holds
 * it and is dropped from every later one. Each rail is capped AFTER removing
 * duplicates, so callers can over-fetch to keep later rails full.
 */
export function distinctRails<T extends { id: string }>(rails: readonly (readonly T[])[], max = 8): T[][] {
  const seen = new Set<string>();
  return rails.map((rail) => {
    const kept: T[] = [];
    for (const item of rail) {
      if (kept.length >= max) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      kept.push(item);
    }
    return kept;
  });
}
