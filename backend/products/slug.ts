import slug from "slug";
import { eq } from "drizzle-orm";
import { db } from "#root/shared/database/drizzle/db";
import { product } from "#root/shared/database/drizzle/schema";

/**
 * Generates a unique product slug from a name, appending a short suffix
 * from `disambiguator` (e.g. the product id) only if the base slug is
 * already taken by a different row.
 */
export async function generateUniqueProductSlug(
  name: string,
  disambiguator: string,
  excludeProductId?: string,
): Promise<string> {
  const database = db();
  const base = slug(name) || "product";

  const existing = await database.query.product.findFirst({
    where: eq(product.slug, base),
  });

  if (!existing || existing.id === excludeProductId) {
    return base;
  }

  return `${base}-${disambiguator.slice(0, 8)}`;
}

/**
 * Backfills `slug` for any product rows created before this feature shipped.
 * Idempotent — a no-op once every product has a slug, safe to run every boot.
 */
export async function backfillProductSlugs(): Promise<void> {
  const database = db();

  const missing = await database.query.product.findMany({
    where: (fields, { isNull }) => isNull(fields.slug),
  });

  if (missing.length === 0) return;

  console.log(`[Bootstrap] Backfilling slugs for ${missing.length} product(s)...`);

  for (const row of missing) {
    try {
      const newSlug = await generateUniqueProductSlug(row.name, row.id, row.id);
      await database.update(product).set({ slug: newSlug }).where(eq(product.id, row.id));
    } catch (error) {
      console.error(`[Bootstrap] Failed to backfill slug for product ${row.id}:`, error);
    }
  }

  console.log("[Bootstrap] Product slug backfill complete.");
}
