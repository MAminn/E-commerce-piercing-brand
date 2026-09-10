import { provideDatabase, publicProcedure } from "#root/shared/trpc/server.js";
import { requestPasswordReset, requestResetSchema } from "./request-reset";
import { resetPassword, resetPasswordSchema } from "./reset-password";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect.js";
import { Effect } from "effect";
import { EmailService } from "#root/shared/email/service.js";

export const requestPasswordResetProcedure = publicProcedure
  .input(requestResetSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      requestPasswordReset(input).pipe(
        provideDatabase(ctx),
        Effect.provideService(EmailService, ctx.emailService),
      ),
    ).then(serializeBackendEffectResult);
  });

export const resetPasswordProcedure = publicProcedure
  .input(resetPasswordSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      resetPassword(input).pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  });
