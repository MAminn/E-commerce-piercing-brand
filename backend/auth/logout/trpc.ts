import {
  provideDatabase,
  protectedProcedure,
} from "#root/shared/trpc/server.js";
import { z } from "zod";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect.js";
import { invalidateSessionByHash } from "../session";

export const logoutProcedure = protectedProcedure
  .input(z.object({ token: z.string() }))
  .mutation(async ({ ctx }) => {
    // ctx.clientSession.token is the *hashed* token (set by the auth middleware).
    // Use invalidateSessionByHash so it matches the DB value directly.
    const hashedToken = ctx.clientSession.token;
    return await runBackendEffect(
      invalidateSessionByHash(hashedToken).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });
