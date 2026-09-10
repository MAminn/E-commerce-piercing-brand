import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { trackEvents, trackEventSchema } from "./service";

export const trackEventProcedure = publicProcedure
  .input(trackEventSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      trackEvents(input).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });
