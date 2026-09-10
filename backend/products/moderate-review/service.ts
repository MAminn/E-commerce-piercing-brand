import { query } from "#root/shared/database/drizzle/db";
import { productReview } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";

export const moderateReviewSchema = z.object({
  reviewId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
});

export const moderateReview = (input: z.infer<typeof moderateReviewSchema>) =>
  Effect.gen(function* ($) {
    return yield* $(
      query(async (db) => {
        const updated = await db
          .update(productReview)
          .set({ status: input.status, updatedAt: new Date() })
          .where(eq(productReview.id, input.reviewId))
          .returning({ id: productReview.id })
          .execute();

        if (updated.length === 0) {
          return { success: false, error: "Review not found" };
        }

        return { success: true };
      }),
    );
  });
