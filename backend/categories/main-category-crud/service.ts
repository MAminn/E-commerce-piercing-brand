import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
  category,
  categoryLog,
  user,
  product,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { Effect } from "effect";
import { z } from "zod";
import { eq, and, count, isNull } from "drizzle-orm";
import { attachedToCategory } from "../category-products";
import {
  assertImageFree,
  assertSiblingNameFree,
  badRequest,
  nextSortOrder,
  offerReferences,
  resolveSlug,
} from "../hierarchy";

/**
 * Create Main Category
 * Creates a top-level category that can have subcategories
 */
export const createMainCategorySchema = z.object({
  name: z.string().trim().max(255).min(1, "Category name is required"),
  imageId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
});

export const createMainCategory = (
  input: z.infer<typeof createMainCategorySchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "Admin access required",
          }),
        ),
      );
    }

    return yield* $(
      query(async (db) => {
        return await db.transaction(async (tx) => {
          // Only other MAIN categories clash: a subcategory called "Nose"
          // somewhere else does not block a main category "Nose".
          await assertSiblingNameFree(tx, input.name, null);
          await assertImageFree(tx, input.imageId);

          // `type` is the legacy grouping key (still read by product.search's
          // `categoryType`). Keep it unique per main category so an old type
          // string never merges two groups.
          const takenTypes = new Set(
            (await tx.select({ type: category.type }).from(category)).map(
              (r) => r.type,
            ),
          );
          let type = input.name.toLowerCase();
          for (let n = 2; takenTypes.has(type); n++) {
            type = `${input.name.toLowerCase()}-${n}`;
          }

          const newCategory = await tx
            .insert(category)
            .values({
              name: input.name,
              slug: await resolveSlug(tx, { name: input.name }),
              type,
              parentId: null,
              imageId: input.imageId || null,
              description: input.description || null,
              sortOrder: await nextSortOrder(tx, null),
            })
            .returning()
            .then((data) => data[0]);

          if (!newCategory) {
            throw new Error("Category creation failed");
          }

          const actionUser = await tx
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, session.email))
            .then((data) => data[0]);

          if (actionUser) {
            await tx.insert(categoryLog).values({
              action: "created",
              categoryId: newCategory.id,
              userId: actionUser.id,
            });
          }

          return newCategory;
        });
      }),
    );
  });

/**
 * Rename Main Category
 * Updates the name, image and description of a main category (the slug stays)
 */
export const renameMainCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(255).min(1, "Category name is required"),
  imageId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
});

export const renameMainCategory = (
  input: z.infer<typeof renameMainCategorySchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "Admin access required",
          }),
        ),
      );
    }

    return yield* $(
      query(async (db) => {
        return await db.transaction(async (tx) => {
          // Check if category exists
          const existing = await tx
            .select({ id: category.id, name: category.name })
            .from(category)
            .where(
              and(
                eq(category.id, input.id),
                eq(category.deleted, false),
                isNull(category.parentId),
              ),
            )
            .then((data) => data[0]);

          if (!existing) {
            throw new ServerError({
              tag: "NotFound",
              statusCode: 404,
              clientMessage: "Category not found",
            });
          }

          await assertSiblingNameFree(tx, input.name, null, input.id);
          if (input.imageId !== undefined) {
            await assertImageFree(tx, input.imageId, input.id);
          }

          // The slug and `type` are deliberately left alone. Rewriting the
          // slug broke every link to the category on each rename; rewriting
          // `type` detached all of its subcategories, because they used to be
          // grouped by that string (they are linked by parent_id now).
          const updatedCategory = await tx
            .update(category)
            .set({
              name: input.name,
              ...(input.imageId !== undefined && { imageId: input.imageId }),
              ...(input.description !== undefined && {
                description: input.description || null,
              }),
              updatedAt: new Date(),
            })
            .where(eq(category.id, input.id))
            .returning()
            .then((data) => data[0]);

          if (!updatedCategory) {
            throw new Error("Category update failed");
          }

          const actionUser = await tx
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, session.email))
            .then((data) => data[0]);

          if (actionUser) {
            await tx.insert(categoryLog).values({
              action: "updated",
              categoryId: updatedCategory.id,
              userId: actionUser.id,
            });
          }

          return updatedCategory;
        });
      }),
    );
  });

/**
 * Delete Main Category
 * Deletes a main category only if:
 * - It has 0 subcategories
 * - It has 0 products linked
 */
export const deleteMainCategorySchema = z.object({
  id: z.string().uuid(),
});

export const deleteMainCategory = (
  input: z.infer<typeof deleteMainCategorySchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "Admin access required",
          }),
        ),
      );
    }

    return yield* $(
      query(async (db) => {
        return await db.transaction(async (tx) => {
          // Get the category
          const targetCategory = await tx
            .select({
              id: category.id,
              name: category.name,
              type: category.type,
            })
            .from(category)
            .where(and(eq(category.id, input.id), eq(category.deleted, false)))
            .then((data) => data[0]);

          if (!targetCategory) {
            throw new ServerError({
              tag: "NotFound",
              statusCode: 404,
              clientMessage: "Category not found",
            });
          }

          // Check for subcategories
          const subcategoryCount = await tx
            .select({ count: count() })
            .from(category)
            .where(
              and(eq(category.parentId, input.id), eq(category.deleted, false)),
            )
            .then((data) => data[0]?.count || 0);

          if (Number(subcategoryCount) > 0) {
            throw new ServerError({
              tag: "BadRequest",
              statusCode: 400,
              clientMessage: `Cannot delete "${targetCategory.name}". It has ${subcategoryCount} subcategories. Please delete all subcategories first.`,
            });
          }

          // Check for products.
          //
          // This used to test `product.category_id = <id>` only, so a product
          // filed into the category through `product_category` — which is how
          // the admin UI assigns categories — did not count as attached. The
          // category deleted "empty", its products stayed live on the
          // storefront, and the admin product list (which resolves categories
          // through that same FK) stopped showing them.
          //
          // `attachedToCategory` is the shared predicate the public category
          // count is also built from, so "not empty" now means the same thing
          // in both places. It matches EITHER assignment path and counts each
          // product once regardless of how many rows attach it.
          const productCount = await tx
            .select({ count: count() })
            .from(product)
            .where(attachedToCategory(input.id))
            .then((data) => data[0]?.count || 0);

          if (Number(productCount) > 0) {
            throw new ServerError({
              tag: "BadRequest",
              statusCode: 400,
              clientMessage: `Cannot delete "${targetCategory.name}". It has ${productCount} products. Please reassign or delete all products first.`,
            });
          }

          const refs = await offerReferences(tx, input.id);
          if (refs.promoCodes > 0 || refs.bundles > 0) {
            throw badRequest(
              `Cannot delete "${targetCategory.name}": it is used by promo codes or bundles. Remove it there first.`,
            );
          }

          // Safe to delete - soft delete
          const deletedCategory = await tx
            .update(category)
            .set({
              deleted: true,
              updatedAt: new Date(),
            })
            .where(eq(category.id, input.id))
            .returning()
            .then((data) => data[0]);

          if (!deletedCategory) {
            throw new Error("Category deletion failed");
          }

          const actionUser = await tx
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, session.email))
            .then((data) => data[0]);

          if (actionUser) {
            await tx.insert(categoryLog).values({
              action: "deleted",
              categoryId: deletedCategory.id,
              userId: actionUser.id,
            });
          }

          return { success: true, categoryName: targetCategory.name };
        });
      }),
    );
  });

/**
 * Toggle Show On Landing
 * Toggles the showOnLanding flag for a main category
 */
export const toggleCategoryLandingSchema = z.object({
  id: z.string().uuid(),
  showOnLanding: z.boolean(),
});

export const toggleCategoryLanding = (
  input: z.infer<typeof toggleCategoryLandingSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "Admin access required",
          }),
        ),
      );
    }

    return yield* $(
      query(async (db) => {
        const updated = await db
          .update(category)
          .set({
            showOnLanding: input.showOnLanding,
            updatedAt: new Date(),
          })
          .where(eq(category.id, input.id))
          .returning()
          .then((data) => data[0]);

        if (!updated) {
          throw new ServerError({
            tag: "NotFound",
            statusCode: 404,
            clientMessage: "Category not found",
          });
        }

        return updated;
      }),
    );
  });
