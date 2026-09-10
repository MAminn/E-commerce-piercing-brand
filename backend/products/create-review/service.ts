import type { ClientSession } from "#root/backend/auth/shared/entities";
import { query } from "#root/shared/database/drizzle/db";
import { productReview, product } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

export const createReviewSchema = z.object({
  productId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  userName: z.string().min(2).max(50),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(3).max(500),
  imageId: z.string().uuid().optional(),
});

export const createReview = (
  input: z.infer<typeof createReviewSchema>,
  clientSession?: ClientSession
) =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        // Check if product exists
        const productExists = await db
          .select({ id: product.id })
          .from(product)
          .where(eq(product.id, input.productId))
          .execute();

        if (productExists.length === 0) {
          return {
            success: false,
            error: "Product not found",
          };
        }

        const newReview = await db
          .insert(productReview)
          .values({
            productId: input.productId,
            userId: input.userId,
            userName: input.userName,
            rating: input.rating,
            comment: input.comment,
            imageId: input.imageId,
            // New reviews always start pending — admin approves/rejects
            // before they become publicly visible.
            status: "pending",
          })
          .returning()
          .execute();

        return {
          success: true,
          review: newReview[0],
        };
      })
    );
  });
