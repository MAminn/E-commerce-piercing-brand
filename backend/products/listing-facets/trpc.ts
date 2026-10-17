import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { getListingFacets, listingFacetsSchema } from "./service";

export const listingFacetsProcedure = publicProcedure
  .input(listingFacetsSchema)
  .query(async ({ ctx, input }) => {
    return await runBackendEffect(
      getListingFacets(input).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });
