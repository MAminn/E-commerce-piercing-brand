import type { ClientSession } from "#root/backend/auth/shared/entities";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";
import {
  bundleCampaignCategory,
  bundleCampaignEligibilityCategory,
  category,
  categoryLog,
  product,
  productCategory,
  promoCodeCategories,
  user,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { normalizeCategoryName, uniqueSlug } from "#root/shared/categories/tree";
import { and, count, eq, inArray, isNull, ne, not, sql } from "drizzle-orm";
import slug from "slug";
import { productBelongsToCategory } from "./category-products";

/**
 * Server-side building blocks for the two-level category hierarchy, shared by
 * the category CRUD services, bulk product assignment and safe deletion.
 *
 * MEMBERSHIP INVARIANT — read before changing anything that moves products:
 *
 *   A product in a subcategory is always also in that subcategory's main
 *   category.
 *
 * Subcategory assignment is therefore ADDITIVE: adding a product to "Helix"
 * never takes it out of "Ear Piercings", and taking it out of "Helix" leaves
 * it in "Ear Piercings". Promo codes and bundle campaigns target category
 * ids, mostly main ones, so detaching a product from its main category would
 * silently change which discounts it qualifies for — and a shopper browsing
 * "All Ear Piercings" must keep seeing it while an admin reorganises.
 */

export type Tx = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type Db = DatabaseClient | Tx;

export const isAdminSession = (session?: ClientSession) =>
  !!session && (session.role === "admin" || session.role === "superadmin");

export const unauthorized = () =>
  new ServerError({
    tag: "Unauthorized",
    statusCode: 401,
    clientMessage: "Admin access required",
  });

export const badRequest = (clientMessage: string) =>
  new ServerError({ tag: "BadRequest", statusCode: 400, clientMessage });

export const notFound = (clientMessage: string) =>
  new ServerError({ tag: "NotFound", statusCode: 404, clientMessage });

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  parentId: string | null;
  sortOrder: number;
  hidden: boolean;
  deleted: boolean;
}

const categoryColumns = {
  id: category.id,
  name: category.name,
  slug: category.slug,
  type: category.type,
  parentId: category.parentId,
  sortOrder: category.sortOrder,
  hidden: category.hidden,
  deleted: category.deleted,
};

/** A live (not soft-deleted) category, optionally row-locked for the transaction. */
export async function getLiveCategory(
  db: Db,
  id: string,
  opts: { forUpdate?: boolean } = {},
): Promise<CategoryRow | undefined> {
  const q = db
    .select(categoryColumns)
    .from(category)
    .where(and(eq(category.id, id), eq(category.deleted, false)));
  const rows = opts.forUpdate ? await q.for("update") : await q;
  return rows[0];
}

/** A live subcategory and its live main category, or a client-facing error. */
export async function requireSubcategory(
  db: Db,
  id: string,
  opts: { forUpdate?: boolean } = {},
): Promise<{ sub: CategoryRow; parent: CategoryRow }> {
  const sub = await getLiveCategory(db, id, opts);
  if (!sub) throw notFound("Subcategory not found. It may have been deleted — refresh the page.");
  if (!sub.parentId) {
    throw badRequest(`"${sub.name}" is a main category, not a subcategory.`);
  }
  const parent = await getLiveCategory(db, sub.parentId);
  if (!parent) throw notFound("This subcategory's main category no longer exists.");
  return { sub, parent };
}

/** A live MAIN category (no parent), or a client-facing error. */
export async function requireMainCategory(
  db: Db,
  id: string,
  opts: { forUpdate?: boolean } = {},
): Promise<CategoryRow> {
  const main = await getLiveCategory(db, id, opts);
  if (!main) throw notFound("Category not found. It may have been deleted — refresh the page.");
  if (main.parentId) {
    throw badRequest(`"${main.name}" is a subcategory; choose a main category.`);
  }
  return main;
}

/** Live subcategories of a main category, in no particular order. */
export async function liveChildren(db: Db, parentId: string): Promise<CategoryRow[]> {
  return db
    .select(categoryColumns)
    .from(category)
    .where(and(eq(category.parentId, parentId), eq(category.deleted, false)));
}

/**
 * Rejects a name already used by a live sibling (same parent; or another main
 * category when `parentId` is null). Compared loosely — "Helix" and "helix "
 * collide — so double submissions cannot create look-alike duplicates.
 */
export async function assertSiblingNameFree(
  db: Db,
  name: string,
  parentId: string | null,
  excludeId?: string,
): Promise<void> {
  const siblings = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(
      and(
        eq(category.deleted, false),
        parentId ? eq(category.parentId, parentId) : isNull(category.parentId),
        excludeId ? ne(category.id, excludeId) : undefined,
      ),
    );
  const wanted = normalizeCategoryName(name);
  const clash = siblings.find((s) => normalizeCategoryName(s.name) === wanted);
  if (clash) {
    throw badRequest(
      parentId
        ? `A subcategory called "${clash.name}" already exists here.`
        : `A category called "${clash.name}" already exists.`,
    );
  }
}

/** Slugs held by live categories (optionally ignoring one row). */
export async function takenSlugs(db: Db, excludeId?: string): Promise<Set<string>> {
  const rows = await db
    .select({ slug: category.slug })
    .from(category)
    .where(and(eq(category.deleted, false), excludeId ? ne(category.id, excludeId) : undefined));
  return new Set(rows.map((r) => r.slug));
}

/**
 * The slug to store. An admin-typed slug is normalised and must be free (an
 * error, not a silent rename, so the link they typed is the link they get);
 * otherwise one is generated from the name.
 */
export async function resolveSlug(
  db: Db,
  opts: { requested?: string | null; name: string; parentSlug?: string | null; excludeId?: string },
): Promise<string> {
  const taken = await takenSlugs(db, opts.excludeId);
  if (opts.requested?.trim()) {
    const wanted = slug(opts.requested.trim());
    if (!wanted) throw badRequest("The link can only contain letters, numbers and hyphens.");
    if (taken.has(wanted)) {
      throw badRequest(`The link "/categories/${wanted}" is already used by another category.`);
    }
    return wanted;
  }
  return uniqueSlug(slug(opts.name), taken, opts.parentSlug);
}

/**
 * `category.image_id` is UNIQUE, so two categories cannot share one file.
 * Checked up front for a readable message instead of a constraint error.
 */
export async function assertImageFree(
  db: Db,
  imageId: string | null | undefined,
  excludeId?: string,
): Promise<void> {
  if (!imageId) return;
  const [owner] = await db
    .select({ name: category.name })
    .from(category)
    .where(and(eq(category.imageId, imageId), excludeId ? ne(category.id, excludeId) : undefined));
  if (owner) {
    throw badRequest(
      `That photo is already the image of "${owner.name}". Upload the photo again or choose another one.`,
    );
  }
}

/** Next position at the end of a sibling list. */
export async function nextSortOrder(db: Db, parentId: string | null): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${category.sortOrder}), 0)::int` })
    .from(category)
    .where(
      and(
        eq(category.deleted, false),
        parentId ? eq(category.parentId, parentId) : isNull(category.parentId),
      ),
    );
  return Number(row?.max ?? 0) + 1;
}

export async function logCategoryAction(
  db: Db,
  session: ClientSession,
  categoryId: string,
  action: "created" | "updated" | "deleted",
): Promise<void> {
  const [actionUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, session.email));
  if (!actionUser) return;
  await db.insert(categoryLog).values({ action, categoryId, userId: actionUser.id });
}

/**
 * The category list a product is saved with, closed under the membership
 * invariant: choosing a subcategory in the product form also files the
 * product in that subcategory's main category, whatever the client sent.
 * Deduplicated with the primary first (a repeated id used to hit the
 * junction's unique index and fail the whole save).
 */
export async function normalizeProductCategoryIds(
  db: Db,
  primaryId: string,
  categoryIds: readonly string[],
): Promise<string[]> {
  const ids = [...new Set([primaryId, ...categoryIds].filter(Boolean))];
  const rows = await db
    .select({ id: category.id, parentId: category.parentId })
    .from(category)
    .where(and(inArray(category.id, ids), eq(category.deleted, false)));
  for (const row of rows) {
    if (row.parentId && !ids.includes(row.parentId)) ids.push(row.parentId);
  }
  return ids;
}

/** Ids from `productIds` that are live (not soft-deleted) products. */
export async function liveProductIds(db: Db, productIds: readonly string[]): Promise<string[]> {
  if (productIds.length === 0) return [];
  const rows = await db
    .select({ id: product.id })
    .from(product)
    .where(and(inArray(product.id, [...productIds]), eq(product.deleted, false)));
  return rows.map((r) => r.id);
}

/**
 * Attaches products to a category through the junction table, skipping any
 * already attached by EITHER path. Returns how many memberships were new.
 * `onConflictDoNothing` on `product_category_unique` makes a repeated or
 * concurrent request a no-op instead of a duplicate row.
 */
export async function attachProducts(
  db: Db,
  categoryId: string,
  productIds: readonly string[],
): Promise<number> {
  if (productIds.length === 0) return 0;
  const missing = await db
    .select({ id: product.id })
    .from(product)
    .where(
      and(
        inArray(product.id, [...productIds]),
        not(productBelongsToCategory(categoryId)),
      ),
    );
  if (missing.length === 0) return 0;
  const inserted = await db
    .insert(productCategory)
    .values(missing.map((p) => ({ productId: p.id, categoryId, isPrimary: false })))
    .onConflictDoNothing()
    .returning({ id: productCategory.id });
  return inserted.length;
}

/**
 * Takes products out of a subcategory without ever taking them out of its
 * main category (see the invariant above). A product whose PRIMARY category
 * (`product.category_id`, NOT NULL) is the subcategory gets the main category
 * as its primary instead — the FK cannot simply be cleared. Returns how many
 * of the products were actually in the subcategory.
 */
export async function detachProductsFromSubcategory(
  db: Db,
  sub: Pick<CategoryRow, "id">,
  parent: Pick<CategoryRow, "id">,
  productIds: readonly string[],
): Promise<number> {
  if (productIds.length === 0) return 0;
  const ids = [...productIds];

  const members = await db
    .select({ id: product.id })
    .from(product)
    .where(and(inArray(product.id, ids), productBelongsToCategory(sub.id)));
  if (members.length === 0) return 0;
  const memberIds = members.map((m) => m.id);

  // 1. Guarantee main-category membership BEFORE removing anything, so there
  //    is no moment at which the product belongs to neither.
  await attachProducts(db, parent.id, memberIds);

  // 2. Move a primary pointer off the subcategory.
  await db
    .update(product)
    .set({ categoryId: parent.id, updatedAt: new Date() })
    .where(and(inArray(product.id, memberIds), eq(product.categoryId, sub.id)));

  // 3. Drop the junction rows.
  await db
    .delete(productCategory)
    .where(
      and(
        eq(productCategory.categoryId, sub.id),
        inArray(productCategory.productId, memberIds),
      ),
    );

  return memberIds.length;
}

/**
 * Promo codes and bundle campaigns that point at a category. Deleting such a
 * category would quietly change what those offers apply to, so deletion is
 * refused until the admin edits them (hiding the category is always allowed).
 */
export async function offerReferences(
  db: Db,
  categoryId: string,
): Promise<{ promoCodes: number; bundles: number }> {
  const [promo] = await db
    .select({ n: count() })
    .from(promoCodeCategories)
    .where(eq(promoCodeCategories.categoryId, categoryId));
  const [placed] = await db
    .select({ n: count() })
    .from(bundleCampaignCategory)
    .where(eq(bundleCampaignCategory.categoryId, categoryId));
  const [eligible] = await db
    .select({ n: count() })
    .from(bundleCampaignEligibilityCategory)
    .where(eq(bundleCampaignEligibilityCategory.categoryId, categoryId));
  return {
    promoCodes: Number(promo?.n ?? 0),
    bundles: Number(placed?.n ?? 0) + Number(eligible?.n ?? 0),
  };
}
