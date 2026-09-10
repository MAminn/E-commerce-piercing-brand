import { provideDatabase, publicProcedure } from "#root/shared/trpc/server.js";
import { verifyEmail, verifyEmailSchema } from "./verify-email";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect.js";
import { Effect } from "effect";
import { EmailService } from "#root/shared/email/service.js";

export const verifyEmailProcedure = publicProcedure
  .input(verifyEmailSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      verifyEmail(input).pipe(
        provideDatabase(ctx),
        Effect.provideService(EmailService, ctx.emailService)
      )
    ).then(serializeBackendEffectResult);
  });
