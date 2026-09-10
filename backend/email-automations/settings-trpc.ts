import { z } from "zod";
import { adminProcedure, provideDatabase, router } from "#root/shared/trpc/server";
import {
  runBackendEffect,
  serializeBackendEffectResult,
} from "#root/shared/backend/effect";
import {
  getEmailAutomationSettings,
  updateEmailAutomationSettings,
} from "./settings-service";

const emailAutomationSettingsSchema = z.object({
  workerEnabled: z.boolean(),
  testModeEnabled: z.boolean(),
  testModeEmail: z.string(),
  emailLogoUrl: z.string(),
});

export const emailAutomationSettingsRouter = router({
  get: adminProcedure.query(async ({ ctx }) => {
    return runBackendEffect(
      getEmailAutomationSettings().pipe(provideDatabase(ctx)),
    ).then(serializeBackendEffectResult);
  }),

  update: adminProcedure
    .input(emailAutomationSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.testModeEnabled && input.testModeEmail.trim()) {
        const parsed = z.string().email().safeParse(input.testModeEmail.trim());
        if (!parsed.success) {
          return {
            success: false as const,
            error: "Test email must be a valid email address",
          };
        }
      }
      return runBackendEffect(
        updateEmailAutomationSettings({
          ...input,
          testModeEmail: input.testModeEmail.trim(),
        }).pipe(provideDatabase(ctx)),
      ).then(serializeBackendEffectResult);
    }),
});
