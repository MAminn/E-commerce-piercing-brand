import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import { provideDatabase, publicProcedure } from "#root/shared/trpc/server";
import { createOrder, createOrderSchema } from "./service";

// Public procedure — both logged-in users and guests can place orders.
// The service layer handles userId=null for guests. Order emails are queued
// by the service after commit (backend/orders/order-emails), not sent here.
export const createOrderProcedure = publicProcedure
  .input(createOrderSchema)
  .mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      createOrder(input, ctx.clientSession ?? undefined).pipe(
        provideDatabase(ctx),
      ),
    ).then(serializeBackendEffectResult);
  });
