import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import { category } from "#root/shared/database/drizzle/schema";
import { Effect } from "effect";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import {
  assertImageFree,
  assertSiblingNameFree,
  badRequest,
  isAdminSession,
  logCategoryAction,
  nextSortOrder,
  requireMainCategory,
  resolveSlug,
  unauthorized,
} from "../hierarchy";

/**
 * Creates a SUBCATEGORY under a main category.
 *
 * `parentId` is the way to name the parent. `type` is the legacy input (the
 * old dashboard sent the parent's `type` string) and still resolves to that
 * type's main category, so older clients keep working. The image used to be
 * mandatory; it is optional now — a subcategory is usable without one.
 */
export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    parentId: z.string().uuid().optional(),
    /** @deprecated pass `parentId`. */
    type: z.string().trim().min(1).max(255).optional(),
    imageId: z.string().uuid().optional().nullable(),
    description: z.string().trim().max(300).optional().nullable(),
    /** Optional custom link; generated from the name when omitted. */
    slug: z.string().trim().max(120).optional().nullable(),
    hidden: z.boolean().optional(),
    /** Feature in the homepage "Shop by placement" strip. Off by default. */
    showOnLanding: z.boolean().optional(),
  })
  .refine((v) => v.parentId || v.type, {
    message: "Choose the main category this subcategory belongs to",
    path: ["parentId"],
  });

export const createCategory = (
  input: z.infer<typeof createCategorySchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || !isAdminSession(session)) {
      return yield* $(Effect.fail(unauthorized()));
    }

    return yield* $(
      query(async (db) =>
        db.transaction(async (tx) => {
          let parentId = input.parentId;
          if (!parentId && input.type) {
            const [legacyMain] = await tx
              .select({ id: category.id })
              .from(category)
              .where(
                and(
                  eq(category.type, input.type),
                  isNull(category.parentId),
                  eq(category.deleted, false),
                ),
              )
              .limit(1);
            if (!legacyMain) throw badRequest("Main category not found.");
            parentId = legacyMain.id;
          }

          // Row-lock the parent: two concurrent "Add Helix" submissions
          // serialise here, so the second one sees the first and is refused
          // as a duplicate instead of creating a twin.
          const parent = await requireMainCategory(tx, parentId as string, {
            forUpdate: true,
          });
          await assertSiblingNameFree(tx, input.name, parent.id);
          await assertImageFree(tx, input.imageId);

          const [created] = await tx
            .insert(category)
            .values({
              name: input.name,
              slug: await resolveSlug(tx, {
                requested: input.slug,
                name: input.name,
                parentSlug: parent.slug,
              }),
              type: parent.type,
              parentId: parent.id,
              imageId: input.imageId ?? null,
              description: input.description || null,
              hidden: input.hidden ?? false,
              showOnLanding: input.showOnLanding ?? false,
              sortOrder: await nextSortOrder(tx, parent.id),
            })
            .returning();

          if (!created) throw new Error("Category not created");
          await logCategoryAction(tx, session, created.id, "created");
          return created;
        }),
      ),
    );
  });
