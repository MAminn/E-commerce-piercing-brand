/**
 * Loads products' option groups with store-wide availability applied — the
 * ONE server-side source every path that must agree about a "variant" reads
 * from: bundle validation, bundle DTOs/capacity, curated composition checks
 * and order creation.
 *
 * Two queries regardless of how many products are asked for: the
 * `product_variant` rows for the ids, and the store's variant presets (whose
 * `strikethroughValues` make a value unavailable). Never one query per
 * product.
 */

import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import { productVariant, storeSettings } from "#root/shared/database/drizzle/schema";
import {
  type OptionStrikethroughMap,
  type ProductOptionValue,
  type PurchasableOptionGroup,
  toPurchasableOptionGroups,
} from "#root/shared/products/options";
import { asc, eq, inArray } from "drizzle-orm";

type Db = Pick<DatabaseClient, "select">;

/** The store's strikethrough rules by option-group name — one settings read. */
export async function loadOptionStrikethroughMap(db: Db): Promise<OptionStrikethroughMap> {
  const [row] = await db
    .select({ variantPresets: storeSettings.variantPresets })
    .from(storeSettings)
    .where(eq(storeSettings.key, "default"))
    .limit(1);
  const map: Record<string, string[]> = {};
  for (const preset of row?.variantPresets ?? []) {
    if (preset.strikethroughValues?.length) map[preset.name] = [...preset.strikethroughValues];
  }
  return map;
}

/**
 * Option groups for a set of products, batched. Values stored as plain
 * strings by older admin saves are normalised the same way the product
 * endpoints normalise them (`{ value, priceModifier: 0 }`).
 */
export async function loadPurchasableOptionGroups(
  db: Db,
  productIds: readonly string[],
): Promise<Map<string, PurchasableOptionGroup[]>> {
  const result = new Map<string, PurchasableOptionGroup[]>();
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return result;

  // Sequential on purpose: callers pass an order transaction, which is one
  // connection.
  const rows = await db
    .select({ productId: productVariant.productId, name: productVariant.name, values: productVariant.values })
    .from(productVariant)
    .where(inArray(productVariant.productId, ids))
    // Ids are UUIDv7 (time-ordered), so this is insertion order — the order
    // the product page lists the groups in.
    .orderBy(asc(productVariant.id));
  const strikethrough = rows.length === 0 ? {} : await loadOptionStrikethroughMap(db);

  const rawByProduct = new Map<string, { name: string; values: ProductOptionValue[] }[]>();
  for (const row of rows) {
    const values = (Array.isArray(row.values) ? row.values : []).map((v) =>
      typeof v === "string" ? { value: v, priceModifier: 0 } : (v as ProductOptionValue),
    );
    const list = rawByProduct.get(row.productId) ?? [];
    list.push({ name: row.name, values });
    rawByProduct.set(row.productId, list);
  }
  for (const [productId, groups] of rawByProduct) {
    result.set(productId, toPurchasableOptionGroups(groups, strikethrough));
  }
  return result;
}
