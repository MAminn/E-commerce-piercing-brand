import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import { moderateReview, moderateReviewSchema } from "./service";

export const moderateReviewProcedure = adminProcedure
  .input(moderateReviewSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      moderateReview(input).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });
