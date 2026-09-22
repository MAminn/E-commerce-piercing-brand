import { and, eq, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { product, productCategory } from "#root/shared/database/drizzle/schema";

/**
 * THE definition of "this product is in that category", shared by everything
 * that counts, lists or guards on category membership.
 *
 * A product can be filed into a category two ways, and both are live:
 *
 *   1. `product.category_id` — the legacy direct foreign key, still set on
 *      every product (the column is NOT NULL).
 *   2. `product_category` — the junction table the admin UI writes when an
 *      administrator ticks categories on a product.
 *
 * Every place in the codebase that answered "is this category empty?" used to
 * pick one path and ignore the other, and they did not all pick the same one.
 * `viewCategories` counted the FK only; the delete guard in
 * `main-category-crud` also counted the FK only; `searchProducts` — the query
 * that actually lists the products to a shopper — matched EITHER. So a
 * category could show "0 products", pass the delete guard, be soft-deleted,
 * and still have a full storefront page behind it, with its products now
 * pointing at a deleted category row.
 *
 * Deriving all of those from the one predicate below is what stops the
 * displayed count and the enforced delete rule drifting apart again.
 *
 * NOTE ON SHAPE: this is a predicate over the `product` table, not a join.
 * The junction half is an EXISTS subquery precisely so that a product filed
 * into the same category through several rows — the FK and the junction, or
 * duplicate junction rows in data that predates `product_category_unique` —
 * still contributes exactly once to any `count(*)` built on top of it.
 * Joining `product_category` instead is how a count starts double-counting.
 */
export function productBelongsToCategory(
  /** A category id, or a column holding one (for a correlated subquery). */
  categoryRef: PgColumn | string,
): SQL {
  return or(
    // 1. Legacy direct FK.
    eq(product.categoryId, categoryRef),
    // 2. Junction table. EXISTS, never a join — see the note above.
    sql`exists (select 1 from ${productCategory} where ${productCategory.productId} = ${product.id} and ${productCategory.categoryId} = ${categoryRef})`,
  ) as SQL;
}

/**
 * Products in a category that a SHOPPER can reach.
 *
 * Matches the visibility filter in `searchProducts`, which is what renders
 * the category page, so a "12 products" badge and the page it labels agree.
 */
export function storefrontVisibleInCategory(
  categoryRef: PgColumn | string,
): SQL {
  return and(
    eq(product.deleted, false),
    eq(product.hidden, false),
    productBelongsToCategory(categoryRef),
  ) as SQL;
}

/**
 * Products still ATTACHED to a category, for referential-integrity guards.
 *
 * Deliberately different from `storefrontVisibleInCategory` in one respect:
 * it does NOT exclude hidden products, so a hidden product blocks deleting
 * its category. This preserves the semantics the existing delete guard
 * already had (it filtered on `deleted` only) and it is the correct rule:
 *
 *   - `deleted` is a tombstone. The row is gone as far as the application is
 *     concerned and nothing will ever orphan.
 *   - `hidden` means "not shown in the public shop" and nothing more. The
 *     product is live, editable, and still owned by the merchant — deleting
 *     its category would leave exactly the dangling reference this guard
 *     exists to prevent, and would hide the product from the admin product
 *     list too (which resolves categories through this same FK).
 *
 * So the two policies intentionally disagree about hidden products. Do not
 * "align" them: a storefront badge must not promise a product a shopper
 * cannot see, and a destructive guard must not ignore a row that still
 * exists. What they DO share — and what was actually broken — is the
 * assignment paths in `productBelongsToCategory`.
 */
export function attachedToCategory(categoryRef: PgColumn | string): SQL {
  return and(
    eq(product.deleted, false),
    productBelongsToCategory(categoryRef),
  ) as SQL;
}
