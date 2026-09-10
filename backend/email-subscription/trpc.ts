import { z } from "zod";
import { publicProcedure, router } from "#root/shared/trpc/server";
import {
  getSubscriptionStatusByToken,
  unsubscribeByToken,
  resubscribeByToken,
} from "./service";

export const emailSubscriptionRouter = router({
  getStatus: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const status = await getSubscriptionStatusByToken(input.token);
      if (!status) {
        return { success: false as const, error: "Invalid or expired link" };
      }
      return { success: true as const, result: status };
    }),

  unsubscribe: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const result = await unsubscribeByToken(input.token);
      if (!result.success) {
        return { success: false as const, error: "Invalid or expired link" };
      }
      return { success: true as const, result };
    }),

  resubscribe: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const result = await resubscribeByToken(input.token);
      if (!result.success) {
        return { success: false as const, error: "Invalid or expired link" };
      }
      return { success: true as const, result };
    }),
});
