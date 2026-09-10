import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { Effect } from "effect";
import { createOrder, createOrderSchema } from "./service";
import { EmailService } from "#root/shared/email/service";

// Public procedure — both logged-in users and guests can place orders.
// The service layer handles userId=null for guests.
export const createOrderProcedure = publicProcedure
  .input(createOrderSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      createOrder(input, ctx.clientSession ?? undefined).pipe(
        provideDatabase(ctx),
        Effect.provideService(EmailService, ctx.emailService)
      )
    ).then(serializeBackendEffectResult);
  });
