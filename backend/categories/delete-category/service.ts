import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import {
	category,
	categoryLog,
	user,
} from "#root/shared/database/drizzle/schema";
import { ServerError } from "#root/shared/error/server";
import { Effect } from "effect";
import { z } from "zod";
import slug from "slug";
import { eq } from "drizzle-orm";

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
