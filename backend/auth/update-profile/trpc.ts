import { provideDatabase, protectedProcedure } from "#root/shared/trpc/server.js";
import { updateProfile, updateProfileSchema } from "./service";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect.js";

export const updateProfileProcedure = protectedProcedure
  .input(updateProfileSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      updateProfile(input, ctx.clientSession).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });
