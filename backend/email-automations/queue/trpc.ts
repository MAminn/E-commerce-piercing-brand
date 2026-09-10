import { z } from "zod";
import { adminProcedure, router } from "#root/shared/trpc/server";
import { listRecentScheduledEmails } from "./service";

export const emailQueueRouter = router({
  /** Admin-only: recent queue activity across every automation type, for the marketing-emails "Recent Activity" panel. */
  listRecent: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ input }) => {
      try {
        const rows = await listRecentScheduledEmails(input?.limit ?? 50);
        return { success: true as const, result: rows };
      } catch (err) {
        return {
          success: false as const,
          error: err instanceof Error ? err.message : "Failed to load queue activity",
        };
      }
    }),
});
