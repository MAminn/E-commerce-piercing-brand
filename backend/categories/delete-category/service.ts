import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import { category, product } from "#root/shared/database/drizzle/schema";
import { Effect } from "effect";
import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { attachedToCategory } from "../category-products";
import {
	attachProducts,
	badRequest,
	detachProductsFromSubcategory,
	getLiveCategory,
	isAdminSession,
	logCategoryAction,
	notFound,
	offerReferences,
	requireSubcategory,
	unauthorized,
} from "../hierarchy";

/**
 * Soft-deletes a category. Products are never deleted, hidden or orphaned.
 *
 * A category that still has products is refused, exactly as before, UNLESS
 * the caller says what happens to them (`moveProductsTo`):
 *
 *   - `"parent"`   — they stay in the main category only (they already are
 *                    in it — see the membership invariant in ../hierarchy).
 *   - `<uuid>`     — they are also added to that sibling subcategory first.
 *
 * Both run in one transaction with the delete, so there is no state in which
 * the subcategory is gone but its products have not been re-homed. Only
 * subcategories can be emptied this way; a main category with products is
 * still refused outright.
 *
 * A category used by a promo code or bundle campaign is refused regardless:
 * deleting it would silently change what those offers apply to. Hiding it is
 * the non-destructive alternative.
 */
export const deleteCategorySchema = z.object({
	id: z.string().uuid(),
	moveProductsTo: z.union([z.literal("parent"), z.string().uuid()]).optional(),
});

export const deleteCategory = (
	input: z.infer<typeof deleteCategorySchema>,
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
					if (!target) throw notFound("Category not found. It may already have been deleted.");

					if (!target.parentId) {
						const [children] = await tx
							.select({ n: count() })
							.from(category)
							.where(and(eq(category.parentId, target.id), eq(category.deleted, false)));
						if (Number(children?.n ?? 0) > 0) {
							throw badRequest(
								`Cannot delete "${target.name}". It still has ${children?.n} subcategories. Delete or move them first.`,
							);
						}
					}

					const refs = await offerReferences(tx, target.id);
					if (refs.promoCodes > 0 || refs.bundles > 0) {
						const parts = [
							refs.promoCodes > 0 && `${refs.promoCodes} promo code${refs.promoCodes === 1 ? "" : "s"}`,
							refs.bundles > 0 && `${refs.bundles} bundle setting${refs.bundles === 1 ? "" : "s"}`,
						].filter(Boolean);
						throw badRequest(
							`Cannot delete "${target.name}": it is used by ${parts.join(" and ")}. Remove it there first, or hide the category instead.`,
						);
					}

					// Subcategory deletion originally had NO guard at all: it
					// soft-deleted the row whatever was attached, leaving live
					// products pointing at a deleted category. The shared
					// predicate the public count also uses decides "not empty".
					const attached = await tx
						.select({ id: product.id })
						.from(product)
						.where(attachedToCategory(target.id));

					if (attached.length > 0) {
						if (!input.moveProductsTo || !target.parentId) {
							throw badRequest(
								`Cannot delete "${target.name}". It still has ${attached.length} product${attached.length === 1 ? "" : "s"} assigned to it. Choose where they should go, or reassign them first.`,
							);
						}
						const { sub, parent } = await requireSubcategory(tx, target.id);
						const ids = attached.map((p) => p.id);
						if (input.moveProductsTo !== "parent") {
							if (input.moveProductsTo === sub.id) {
								throw badRequest("Choose a different subcategory to move the products to.");
							}
							const destination = await getLiveCategory(tx, input.moveProductsTo);
							if (!destination || destination.parentId !== parent.id) {
								throw badRequest(`Products can only be moved to another subcategory of "${parent.name}".`);
							}
							await attachProducts(tx, destination.id, ids);
						}
						await detachProductsFromSubcategory(tx, sub, parent, ids);
					}

					const [deleted] = await tx
						.update(category)
						.set({ deleted: true, showOnLanding: false, updatedAt: new Date() })
						.where(eq(category.id, target.id))
						.returning({ id: category.id, name: category.name });

					if (!deleted) throw new Error("Category not deleted");
					await logCategoryAction(tx, session, deleted.id, "deleted");
					return { id: deleted.id, name: deleted.name, productsMoved: attached.length };
				}),
			),
		);
	});
