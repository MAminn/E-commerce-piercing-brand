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
import slug from "slug";
import { eq, and, count, sql } from "drizzle-orm";

/**
 * Create Main Category
 * Creates a top-level category that can have subcategories
 */
export const createMainCategorySchema = z.object({
  name: z.string().nonempty().max(255).min(1, "Category name is required"),
  imageId: z.string().uuid().optional().nullable(),
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
          // Check if category with same name already exists
          const existing = await tx
            .select({ id: category.id })
            .from(category)
            .where(
              and(eq(category.name, input.name), eq(category.deleted, false)),
            )
            .then((data) => data[0]);

          if (existing) {
            throw new ServerError({
              tag: "BadRequest",
              statusCode: 400,
              clientMessage: `Category "${input.name}" already exists`,
            });
          }

          const newCategory = await tx
            .insert(category)
            .values({
              name: input.name,
              slug: slug(input.name),
              type: input.name.toLowerCase() as any, // Dynamic type
              imageId: input.imageId || null,
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
 * Updates the name and slug of a main category
 */
export const renameMainCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().nonempty().max(255).min(1, "Category name is required"),
  imageId: z.string().uuid().optional().nullable(),
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
            .where(and(eq(category.id, input.id), eq(category.deleted, false)))
            .then((data) => data[0]);

          if (!existing) {
            throw new ServerError({
              tag: "NotFound",
              statusCode: 404,
              clientMessage: "Category not found",
            });
          }

          // Check if new name conflicts with another category
          const nameConflict = await tx
            .select({ id: category.id })
            .from(category)
            .where(
              and(
                eq(category.name, input.name),
                eq(category.deleted, false),
                sql`${category.id} != ${input.id}`,
              ),
            )
            .then((data) => data[0]);

          if (nameConflict) {
            throw new ServerError({
              tag: "BadRequest",
              statusCode: 400,
              clientMessage: `Category "${input.name}" already exists`,
            });
          }

          const updatedCategory = await tx
            .update(category)
            .set({
              name: input.name,
              slug: slug(input.name),
              type: input.name.toLowerCase() as any,
              ...(input.imageId !== undefined && { imageId: input.imageId }),
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

          // Check for subcategories (categories with same type but different ID)
          const subcategoryCount = await tx
            .select({ count: count() })
            .from(category)
            .where(
              and(
                eq(category.type, targetCategory.type),
                eq(category.deleted, false),
                sql`${category.id} != ${input.id}`,
              ),
            )
            .then((data) => data[0]?.count || 0);

          if (Number(subcategoryCount) > 0) {
            throw new ServerError({
              tag: "BadRequest",
              statusCode: 400,
              clientMessage: `Cannot delete "${targetCategory.name}". It has ${subcategoryCount} subcategories. Please delete all subcategories first.`,
            });
          }

          // Check for products
          const productCount = await tx
            .select({ count: count() })
            .from(product)
            .where(and(eq(product.categoryId, input.id), eq(product.deleted, false)))
            .then((data) => data[0]?.count || 0);

          if (Number(productCount) > 0) {
            throw new ServerError({
              tag: "BadRequest",
              statusCode: 400,
              clientMessage: `Cannot delete "${targetCategory.name}". It has ${productCount} products. Please reassign or delete all products first.`,
            });
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
