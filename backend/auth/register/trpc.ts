import { provideDatabase, publicProcedure } from "#root/shared/trpc/server.js";
import { register, registerSchema } from "./register";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect.js";
import { Effect } from "effect";
import { EmailService } from "#root/shared/email/service.js";

export const registerProcedure = publicProcedure
  .input(registerSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      register(input).pipe(
        provideDatabase(ctx),
        Effect.provideService(EmailService, ctx.emailService)
      )
    ).then(serializeBackendEffectResult);
  });
