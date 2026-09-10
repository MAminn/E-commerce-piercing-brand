import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { getProductImages, getProductImagesSchema } from "./service";

export const getProductImagesProcedure = publicProcedure
  .input(getProductImagesSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      getProductImages(input).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });
