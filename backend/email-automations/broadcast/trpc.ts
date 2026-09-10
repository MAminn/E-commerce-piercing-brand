import { z } from "zod";
import { adminProcedure, router } from "#root/shared/trpc/server";
import { sendBroadcast, resolveBroadcastRecipients } from "./service";

const automationTypeEnum = z.enum(["new_drops", "flash_offer", "retention"]);
const segmentEnum = z.enum(["all_subscribers", "customers", "inactive_customers"]);

export const broadcastRouter = router({
  previewRecipientCount: adminProcedure
    .input(
      z.object({
        segment: segmentEnum,
        inactiveDays: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const recipients = await resolveBroadcastRecipients(input.segment, input.inactiveDays);
      return { success: true as const, result: { count: recipients.length } };
    }),

  send: adminProcedure
    .input(
      z.object({
        automationType: automationTypeEnum,
        segment: segmentEnum,
        inactiveDays: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await sendBroadcast(
          input.automationType,
          input.segment,
          input.inactiveDays,
        );
        return { success: true as const, result };
      } catch (err) {
        return {
          success: false as const,
          error: err instanceof Error ? err.message : "Failed to send broadcast",
        };
      }
    }),
});
