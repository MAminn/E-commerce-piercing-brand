import { protectedProcedure } from "#root/shared/trpc/server.js";
import { z } from "zod";

export const meProcedure = protectedProcedure
  .input(z.object({ token: z.string() }))
  .mutation(async ({ ctx }) => {
    // ctx.clientSession is already validated by the auth middleware.
    // No need to re-validate the token (which would double-hash it).
    return { success: true as const, result: ctx.clientSession };
  });
