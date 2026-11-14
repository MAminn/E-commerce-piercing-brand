import { z } from "zod";
import { Effect } from "effect";
import { t, adminProcedure, provideDatabase } from "#root/shared/trpc/server";
import { runBackendEffect, serializeBackendEffectResult } from "#root/shared/backend/effect";
import { query } from "#root/shared/database/drizzle/db";
import { effectiveGa4PurchaseOwner } from "#root/shared/config/ga4-purchase-owner";
import { getGa4PurchaseDiagnostics } from "./diagnostics";

/** Admin, read-only. In browser mode the tables may not exist yet: report the mode only. */
export const ga4PurchaseRouter = t.router({
  diagnostics: adminProcedure
    .input(z.object({ windowDays: z.number().int().min(1).max(90).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return await runBackendEffect(
        Effect.gen(function* () {
          if (effectiveGa4PurchaseOwner() === "browser") {
            return { effectiveOwner: "browser" as const, note: "GA4 purchase is browser-owned; no server rows are written." };
          }
          return yield* query((db) => getGa4PurchaseDiagnostics(db, input?.windowDays ?? 7));
        }).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),
});
