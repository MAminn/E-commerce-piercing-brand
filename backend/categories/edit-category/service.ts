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

export const editCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().nonempty().max(255),
  type: z.string().nonempty().max(255),
  imageId: z.string().uuid().optional().nullable(),
});

export const editCategory = (
  input: z.infer<typeof editCategorySchema>,
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
          const updatedCategory = await tx
            .update(category)
            .set({
              name: input.name,
              imageId: input.imageId || null,
              slug: slug(input.name),
              type: input.type,
            })
            .where(eq(category.id, input.id))
            .returning()
            .then((data) => data[0]);

          if (!updatedCategory) {
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
            action: "updated",
            categoryId: updatedCategory.id,
            userId: actionUser.id,
          });
        });
      }),
    );
  });
