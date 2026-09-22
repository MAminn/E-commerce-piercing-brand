import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
	category,
	categoryLog,
	product,
	user,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { Effect } from "effect";
import { z } from "zod";
import slug from "slug";
import { count, eq } from "drizzle-orm";
import { attachedToCategory } from "../category-products";

export const deleteCategorySchema = z.object({
	id: z.string().uuid(),
});

export const deleteCategory = (
	input: z.infer<typeof deleteCategorySchema>,
	session?: ClientSession,
) =>
	Effect.gen(function* ($) {
		if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
			return yield* $(
				Effect.fail(
					new ServerError({
						tag: "Unauthorized",
						statusCode: 401,
						clientMessage: "Unauthorized",
					}),
				),
			);
		}

		yield* $(
			query(async (db) => {
				await db.transaction(async (tx) => {
					// Subcategory deletion had NO guard at all: it soft-deleted the
					// row whatever was attached to it. The dashboard dialog warned
					// "this subcategory has N products" and then deleted anyway, so
					// the number an administrator was shown and what the server
					// enforced had nothing to do with each other.
					//
					// Orphaning a category this way is what leaves live products
					// pointing at a deleted category row — invisible in the admin
					// product list, still listed and counted on the storefront.
					// The same shared predicate the main-category guard and the
					// public category count use decides "not empty" here.
					const attachedProducts = await tx
						.select({ count: count() })
						.from(product)
						.where(attachedToCategory(input.id))
						.then((data) => data[0]?.count || 0);

					if (Number(attachedProducts) > 0) {
						const target = await tx
							.select({ name: category.name })
							.from(category)
							.where(eq(category.id, input.id))
							.then((data) => data[0]);

						throw new ServerError({
							tag: "BadRequest",
							statusCode: 400,
							clientMessage: `Cannot delete "${target?.name ?? "this category"}". It still has ${attachedProducts} product${Number(attachedProducts) === 1 ? "" : "s"} assigned to it. Please reassign or delete them first.`,
						});
					}

					const newCategory = await tx
						.update(category)
						.set({
							deleted: true,
						})
						.where(eq(category.id, input.id))
						.returning()
						.then((data) => data[0]);

					if (!newCategory) {
						throw new Error("Category not created for some reason");
					}

					const actionUser = await tx
						.select({
							id: user.id,
						})
						.from(user)
						.where(eq(user.email, session.email))
						.then((data) => data[0]);

					if (!actionUser) {
						throw new Error("User not found");
					}

					await tx.insert(categoryLog).values({
						action: "deleted",
						categoryId: newCategory.id,
						userId: actionUser.id,
					});
				});
			}),
		);
	});
