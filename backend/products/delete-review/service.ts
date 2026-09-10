import { query } from "#root/shared/database/drizzle/db";
import { productReview } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

export const deleteReviewSchema = z.object({
  reviewId: z.string().uuid(),
});

export const deleteReview = (input: z.infer<typeof deleteReviewSchema>) =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        const deleted = await db
          .delete(productReview)
          .where(eq(productReview.id, input.reviewId))
          .returning({ id: productReview.id })
          .execute();

        if (deleted.length === 0) {
          return { success: false, error: "Review not found" };
        }

        return { success: true };
      }),
    );
  });
