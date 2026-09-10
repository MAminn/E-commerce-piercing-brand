import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import { deleteReview, deleteReviewSchema } from "./service";

export const deleteReviewProcedure = adminProcedure
  .input(deleteReviewSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      deleteReview(input).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });
