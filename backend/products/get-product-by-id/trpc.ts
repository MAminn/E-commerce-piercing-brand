import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { getProductById, getProductByIdSchema } from "./service";

export const getProductByIdProcedure = publicProcedure
  .input(getProductByIdSchema) // Use the schema defined in the service
  .query(async ({ ctx, input }) => {
    // Run the effect and provide the database context
    const effect = getProductById(input).pipe(provideDatabase(ctx));
    // Execute the effect and serialize the result
    return await runBackendEffect(effect).then(serializeBackendEffectResult);
  });
