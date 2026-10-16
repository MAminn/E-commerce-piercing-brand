import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
  category,
  file,
  product,
  productCategory,
} from "#root/shared/database/drizzle/schema";
import { summarizeCategoryTree } from "#root/shared/categories/summary";
import { Effect } from "effect";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import {
  badRequest,
  getLiveCategory,
  isAdminSession,
  logCategoryAction,
  notFound,
  unauthorized,
} from "../hierarchy";

/**
 * Admin view of the whole catalogue structure: main categories in order, each
 * with its subcategories, product counts and the number of products still
 * waiting for a specific subcategory. Two queries regardless of catalogue
 * size — the counting happens in shared/categories/summary.ts.
 */
export const viewCategoryAdminTree = (session?: ClientSession) =>
  Effect.gen(function* ($) {
    if (!session || !isAdminSession(session)) {
      return yield* $(Effect.fail(unauthorized()));
    }

    return yield* $(
      query(async (db) => {
        const [rows, viaFk, viaJunction] = await Promise.all([
          db
            .select({
              id: category.id,
              name: category.name,
              slug: category.slug,
              type: category.type,
              parentId: category.parentId,
              sortOrder: category.sortOrder,
              hidden: category.hidden,
              showOnLanding: category.showOnLanding,
              description: category.description,
              imageId: category.imageId,
              filename: file.diskname,
              createdAt: category.createdAt,
            })
            .from(category)
            .leftJoin(file, eq(category.imageId, file.id))
            .where(eq(category.deleted, false)),
          db
            .select({
              productId: product.id,
              categoryId: product.categoryId,
              productHidden: product.hidden,
            })
            .from(product)
            .where(eq(product.deleted, false)),
          db
            .select({
              productId: productCategory.productId,
              categoryId: productCategory.categoryId,
              productHidden: product.hidden,
            })
            .from(productCategory)
            .innerJoin(product, eq(product.id, productCategory.productId))
            .where(eq(product.deleted, false)),
        ]);

        return summarizeCategoryTree(rows, [...viaFk, ...viaJunction]);
      }),
    );
  });

export type CategoryAdminTree = Effect.Effect.Success<
  ReturnType<typeof viewCategoryAdminTree>
>;

/**
 * Saves a new order for one sibling list (the main categories, or the
 * subcategories of one main category). The list must name every live sibling
 * exactly once — a stale list from another browser tab is refused rather
 * than half-applied.
 */
export const reorderCategoriesSchema = z.object({
  parentId: z.string().uuid().nullable(),
  orderedIds: z.array(z.string().uuid()).min(1).max(500),
});

export const reorderCategories = (
  input: z.infer<typeof reorderCategoriesSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || !isAdminSession(session)) {
      return yield* $(Effect.fail(unauthorized()));
    }

    return yield* $(
      query(async (db) =>
        db.transaction(async (tx) => {
          const siblings = await tx
            .select({ id: category.id, sortOrder: category.sortOrder })
            .from(category)
            .where(
              and(
                eq(category.deleted, false),
                input.parentId
                  ? eq(category.parentId, input.parentId)
                  : isNull(category.parentId),
              ),
            )
            .for("update");

          const requested = new Set(input.orderedIds);
          const sameSet =
            requested.size === input.orderedIds.length &&
            requested.size === siblings.length &&
            siblings.every((s) => requested.has(s.id));
          if (!sameSet) {
            throw badRequest(
              "The list changed since you opened this page. Refresh and try again.",
            );
          }

          const current = new Map(siblings.map((s) => [s.id, s.sortOrder]));
          let changed = 0;
          for (const [index, id] of input.orderedIds.entries()) {
            const position = index + 1;
            if (current.get(id) === position) continue;
            await tx
              .update(category)
              .set({ sortOrder: position, updatedAt: new Date() })
              .where(eq(category.id, id));
            changed++;
          }
          return { changed };
        }),
      ),
    );
  });

/**
 * Hides or shows a category in shopper navigation. Never touches products:
 * they stay assigned, and stay listed under the main category.
 */
export const setCategoryVisibilitySchema = z.object({
  id: z.string().uuid(),
  hidden: z.boolean(),
});

export const setCategoryVisibility = (
  input: z.infer<typeof setCategoryVisibilitySchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || !isAdminSession(session)) {
      return yield* $(Effect.fail(unauthorized()));
    }

    return yield* $(
      query(async (db) =>
        db.transaction(async (tx) => {
          const target = await getLiveCategory(tx, input.id, { forUpdate: true });
          if (!target) throw notFound("Category not found. Refresh the page.");
          const [updated] = await tx
            .update(category)
            .set({ hidden: input.hidden, updatedAt: new Date() })
            .where(eq(category.id, target.id))
            .returning({ id: category.id, name: category.name, hidden: category.hidden });
          if (!updated) throw new Error("Category not updated");
          await logCategoryAction(tx, session, updated.id, "updated");
          return updated;
        }),
      ),
    );
  });

