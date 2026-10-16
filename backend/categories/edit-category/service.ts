import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import { category } from "#root/shared/database/drizzle/schema";
import { Effect } from "effect";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  assertImageFree,
  assertSiblingNameFree,
  badRequest,
  getLiveCategory,
  isAdminSession,
  logCategoryAction,
  nextSortOrder,
  notFound,
  requireMainCategory,
  resolveSlug,
  unauthorized,
} from "../hierarchy";

/**
 * Edits a category (normally a subcategory; main categories use renameMain,
 * which shares the same rules).
 *
 * Two behaviours changed from the original, both to stop edits breaking
 * things that point at the category:
 *
 *   - Renaming no longer regenerates the slug. Every rename used to change
 *     the category's URL, breaking shared links, homepage tiles and nav
 *     entries. The slug changes only when `slug` is sent explicitly.
 *   - Omitting `imageId` keeps the current image (`null` removes it). It used
 *     to be `imageId || null`, so any edit that did not resend the image
 *     erased it.
 *
 * `type` is accepted and ignored for older clients: it is derived from the
 * parent and is never set directly.
 */
export const editCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(80),
  /** @deprecated ignored; derived from the parent. */
  type: z.string().max(255).optional(),
  imageId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
  slug: z.string().trim().max(120).optional().nullable(),
  hidden: z.boolean().optional(),
  showOnLanding: z.boolean().optional(),
  /** Move a subcategory under a different main category. */
  parentId: z.string().uuid().optional(),
});

export const editCategory = (
  input: z.infer<typeof editCategorySchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || !isAdminSession(session)) {
      return yield* $(Effect.fail(unauthorized()));
    }

    return yield* $(
      query(async (db) =>
        db.transaction(async (tx) => {
          const current = await getLiveCategory(tx, input.id, { forUpdate: true });
          if (!current) throw notFound("Category not found. It may have been deleted — refresh the page.");

          let parentId = current.parentId;
          let type = current.type;
          let sortOrder = current.sortOrder;
          if (input.parentId && input.parentId !== current.parentId) {
            if (!current.parentId) {
              throw badRequest("A main category cannot be placed inside another category.");
            }
            const newParent = await requireMainCategory(tx, input.parentId, { forUpdate: true });
            parentId = newParent.id;
            type = newParent.type;
            sortOrder = await nextSortOrder(tx, newParent.id);
          }

          await assertSiblingNameFree(tx, input.name, parentId, current.id);
          if (input.imageId !== undefined) {
            await assertImageFree(tx, input.imageId, current.id);
          }

          const slugChanged =
            input.slug != null && input.slug.trim() !== "" && input.slug.trim() !== current.slug;

          const [updated] = await tx
            .update(category)
            .set({
              name: input.name,
              ...(slugChanged && {
                slug: await resolveSlug(tx, {
                  requested: input.slug,
                  name: input.name,
                  excludeId: current.id,
                }),
              }),
              ...(input.imageId !== undefined && { imageId: input.imageId }),
              ...(input.description !== undefined && {
                description: input.description || null,
              }),
              ...(input.hidden !== undefined && { hidden: input.hidden }),
              ...(input.showOnLanding !== undefined && {
                showOnLanding: input.showOnLanding,
              }),
              parentId,
              type,
              sortOrder,
              updatedAt: new Date(),
            })
            .where(eq(category.id, current.id))
            .returning();

          if (!updated) throw new Error("Category not updated");
          await logCategoryAction(tx, session, updated.id, "updated");
          return updated;
        }),
      ),
    );
  });
