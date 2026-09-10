import { provideDatabase, publicProcedure } from "#root/shared/trpc/server.js";
import { z } from "zod";
import { login } from "./login";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect.js";

export const loginProcedure = publicProcedure
  .input(z.object({ email: z.string().email(), password: z.string() }))
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      login(input.email, input.password).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  });
