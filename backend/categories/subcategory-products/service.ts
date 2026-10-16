import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
  category,
  file,
  product,
  productCategory,
} from "#root/shared/database/drizzle/schema";
import { isGenericSubcategory } from "#root/shared/categories/tree";
import { Effect } from "effect";
import { z } from "zod";
import { and, asc, count, eq, ilike, inArray, not, or, sql } from "drizzle-orm";
import {
  productBelongsToAnyCategory,
  productBelongsToCategory,
} from "../category-products";
import {
  attachProducts,
  badRequest,
  detachProductsFromSubcategory,
  isAdminSession,
  liveChildren,
  liveProductIds,
  logCategoryAction,
  requireMainCategory,
  requireSubcategory,
  unauthorized,
} from "../hierarchy";

/**
 * Bulk product assignment for subcategories — the dashboard's
 * "Manage products" screen.
 *
 * All three writes (assign / remove / move) are single transactions built on
 * the helpers in ../hierarchy, which keep every product inside its main
 * category throughout. None of them changes a product's name, price, stock,
 * images, variants, visibility or ordering; the only product column ever
 * written is `category_id`, and only when it pointed at a subcategory the
 * product is being taken out of (it then points at the main category).
 */

const MAX_BATCH = 500;

export const listCategoryProductsSchema = z.object({
  mainCategoryId: z.string().uuid(),
  /** Required for the `in_subcategory` view; marks rows already in it otherwise. */
  subcategoryId: z.string().uuid().optional(),
  view: z.enum([
    /** Products in `subcategoryId`. */
    "in_subcategory",
    /** Products of the main category not yet in a specific subcategory. */
    "unclassified",
    /** Everything in the main category (any subcategory or none). */
    "in_category",
    /** The whole catalogue, for pulling products in from other categories. */
    "all",
  ]),
  search: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
});

export const listCategoryProducts = (
  input: z.infer<typeof listCategoryProductsSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || !isAdminSession(session)) {
      return yield* $(Effect.fail(unauthorized()));
    }

    return yield* $(
      query(async (db) => {
        const main = await requireMainCategory(db, input.mainCategoryId);
        const children = await liveChildren(db, main.id);
        const groupIds = [main.id, ...children.map((c) => c.id)];
        const specificIds = children
          .filter((c) => !isGenericSubcategory(c, main))
          .map((c) => c.id);

        if (input.subcategoryId && !children.some((c) => c.id === input.subcategoryId)) {
          throw badRequest("That subcategory does not belong to this category.");
        }
        if (input.view === "in_subcategory" && !input.subcategoryId) {
          throw badRequest("Choose a subcategory.");
        }

        const viewCondition =
          input.view === "in_subcategory"
            ? productBelongsToCategory(input.subcategoryId as string)
            : input.view === "unclassified"
              ? and(
                  productBelongsToAnyCategory(groupIds),
                  not(productBelongsToAnyCategory(specificIds)),
                )
              : input.view === "in_category"
                ? productBelongsToAnyCategory(groupIds)
                : undefined;

        const term = input.search?.replace(/[\\%_]/g, (c) => `\\${c}`);
        const where = and(
          eq(product.deleted, false),
          viewCondition,
          term
            ? or(
                ilike(product.name, `%${term}%`),
                ilike(product.internalCode, `%${term}%`),
                ilike(product.slug, `%${term}%`),
              )
            : undefined,
        );

        const [[totalRow], items] = await Promise.all([
          db.select({ n: count() }).from(product).where(where),
          db
            .select({
              id: product.id,
              name: product.name,
              slug: product.slug,
              price: product.price,
              discountPrice: product.discountPrice,
              stock: product.stock,
              hidden: product.hidden,
              internalCode: product.internalCode,
              primaryCategoryId: product.categoryId,
              imageId: product.imageId,
              imageUrl: file.diskname,
            })
            .from(product)
            .leftJoin(file, eq(file.id, product.imageId))
            .where(where)
            .orderBy(asc(sql`lower(${product.name})`), asc(product.id))
            .limit(input.pageSize)
            .offset((input.page - 1) * input.pageSize),
        ]);

        // Every category each listed product is in, by either path, so the
        // screen can show "Helix, Daith" next to it.
        const ids = items.map((i) => i.id);
        const junction = ids.length
          ? await db
              .select({ productId: productCategory.productId, categoryId: productCategory.categoryId })
              .from(productCategory)
              .where(inArray(productCategory.productId, ids))
          : [];
        const memberOf = new Map<string, Set<string>>();
        for (const item of items) memberOf.set(item.id, new Set([item.primaryCategoryId]));
        for (const row of junction) memberOf.get(row.productId)?.add(row.categoryId);

        const allCategoryIds = [...new Set([...memberOf.values()].flatMap((s) => [...s]))];
        const names = allCategoryIds.length
          ? await db
              .select({ id: category.id, name: category.name, deleted: category.deleted })
              .from(category)
              .where(inArray(category.id, allCategoryIds))
          : [];
        const categoryName = new Map(names.filter((n) => !n.deleted).map((n) => [n.id, n.name]));
        const childIds = new Set(children.map((c) => c.id));

        return {
          total: Number(totalRow?.n ?? 0),
          page: input.page,
          pageSize: input.pageSize,
          items: items.map(({ primaryCategoryId: _primary, ...item }) => {
            const member = memberOf.get(item.id) ?? new Set<string>();
            return {
              ...item,
              /** This main category's subcategories the product is in. */
              subcategoryIds: [...member].filter((id) => childIds.has(id)),
              inMainCategory: [...member].some((id) => id === main.id || childIds.has(id)),
              /** Categories outside this main category (cross-listings). */
              otherCategories: [...member]
                .filter((id) => id !== main.id && !childIds.has(id) && categoryName.has(id))
                .map((id) => ({ id, name: categoryName.get(id) as string })),
            };
          }),
        };
      }),
    );
  });

const batchSchema = z.array(z.string().uuid()).min(1, "Select at least one product").max(MAX_BATCH);

export const assignProductsSchema = z.object({
  subcategoryId: z.string().uuid(),
  productIds: batchSchema,
});

/** Adds products to a subcategory (and, if needed, to its main category). */
export const assignProductsToSubcategory = (
  input: z.infer<typeof assignProductsSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || !isAdminSession(session)) {
      return yield* $(Effect.fail(unauthorized()));
    }

    return yield* $(
      query(async (db) =>
        db.transaction(async (tx) => {
          const { sub, parent } = await requireSubcategory(tx, input.subcategoryId);
          const ids = await liveProductIds(tx, [...new Set(input.productIds)]);
          if (ids.length === 0) throw badRequest("None of the selected products exist any more. Refresh the page.");

          // Main category first: the invariant holds at every step.
          await attachProducts(tx, parent.id, ids);
          const added = await attachProducts(tx, sub.id, ids);
          if (added > 0) await logCategoryAction(tx, session, sub.id, "updated");

          return {
            subcategoryName: sub.name,
            added,
            alreadyIn: ids.length - added,
          };
        }),
      ),
    );
  });

export const removeProductsSchema = assignProductsSchema;

/** Takes products out of a subcategory. They stay in its main category. */
export const removeProductsFromSubcategory = (
  input: z.infer<typeof removeProductsSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || !isAdminSession(session)) {
      return yield* $(Effect.fail(unauthorized()));
    }

    return yield* $(
      query(async (db) =>
        db.transaction(async (tx) => {
          const { sub, parent } = await requireSubcategory(tx, input.subcategoryId);
          const removed = await detachProductsFromSubcategory(
            tx,
            sub,
            parent,
            [...new Set(input.productIds)],
          );
          if (removed > 0) await logCategoryAction(tx, session, sub.id, "updated");
          return { subcategoryName: sub.name, parentName: parent.name, removed };
        }),
      ),
    );
  });

export const moveProductsSchema = z.object({
  fromSubcategoryId: z.string().uuid(),
  toSubcategoryId: z.string().uuid(),
  productIds: batchSchema,
});

/**
 * Moves products from one subcategory to a sibling. Add-then-remove in one
 * transaction: a failure leaves the products where they were, never in
 * neither.
 */
export const moveProductsBetweenSubcategories = (
  input: z.infer<typeof moveProductsSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || !isAdminSession(session)) {
      return yield* $(Effect.fail(unauthorized()));
    }

    return yield* $(
      query(async (db) =>
        db.transaction(async (tx) => {
          if (input.fromSubcategoryId === input.toSubcategoryId) {
            throw badRequest("Choose a different subcategory to move the products to.");
          }
          const from = await requireSubcategory(tx, input.fromSubcategoryId);
          const to = await requireSubcategory(tx, input.toSubcategoryId);
          if (from.parent.id !== to.parent.id) {
            throw badRequest(
              `Products can only be moved between subcategories of the same category. Use "Add to" for "${to.sub.name}" instead.`,
            );
          }

          // Only products actually in the source move; anything else in the
          // selection is ignored rather than silently added to the target.
          const candidates = await liveProductIds(tx, [...new Set(input.productIds)]);
          const inSource = candidates.length
            ? (
                await tx
                  .select({ id: product.id })
                  .from(product)
                  .where(and(inArray(product.id, candidates), productBelongsToCategory(from.sub.id)))
              ).map((r) => r.id)
            : [];
          if (inSource.length === 0) {
            throw badRequest(`None of the selected products are in "${from.sub.name}" any more. Refresh the page.`);
          }

          await attachProducts(tx, to.sub.id, inSource);
          await detachProductsFromSubcategory(tx, from.sub, from.parent, inSource);
          await logCategoryAction(tx, session, from.sub.id, "updated");
          await logCategoryAction(tx, session, to.sub.id, "updated");

          return { moved: inSource.length, fromName: from.sub.name, toName: to.sub.name };
        }),
      ),
    );
  });
