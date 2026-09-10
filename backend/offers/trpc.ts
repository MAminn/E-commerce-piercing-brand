import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import {
  adminProcedure,
  provideDatabase,
  publicProcedure,
  t,
} from "#root/shared/trpc/server";
import { Effect } from "effect";
import { z } from "zod";
import {
  createOffer,
  createOfferSchema,
  deleteOffer,
  evaluateOffers,
  evaluateOffersSchema,
  listActiveOffers,
  listAllOffers,
  updateOffer,
  updateOfferSchema,
} from "./service";

export const offersRouter = t.router({
  /** Public: list active offers (for cart display banners) */
  listActive: publicProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      listActiveOffers().pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  }),

  /** Public: evaluate which offers apply to the current cart */
  evaluate: publicProcedure.input(evaluateOffersSchema).query(async ({ ctx, input }) => {
    return await runBackendEffect(
      evaluateOffers(input).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  }),

  /** Admin: list all offers */
  adminList: adminProcedure.query(async ({ ctx }) => {
    return await runBackendEffect(
      listAllOffers().pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  }),

  /** Admin: create an offer */
  create: adminProcedure.input(createOfferSchema).mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      createOffer(input).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  }),

  /** Admin: update an offer */
  update: adminProcedure.input(updateOfferSchema).mutation(async ({ ctx, input }) => {
    return await runBackendEffect(
      updateOffer(input).pipe(provideDatabase(ctx))
    ).then(serializeBackendEffectResult);
  }),

  /** Admin: delete an offer */
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await runBackendEffect(
        deleteOffer(input.id).pipe(provideDatabase(ctx))
      ).then(serializeBackendEffectResult);
    }),
});
