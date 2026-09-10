import { db, query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import type { EmailAutomationSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { ServerError } from "#root/shared/error/server";
import { DEFAULT_EMAIL_AUTOMATION_SETTINGS } from "./defaults";

export const getEmailAutomationSettings = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db
          .select({ emailAutomationSettings: storeSettings.emailAutomationSettings })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );
    return {
      ...DEFAULT_EMAIL_AUTOMATION_SETTINGS,
      ...(rows[0]?.emailAutomationSettings ?? {}),
    };
  });

export const updateEmailAutomationSettings = (settings: EmailAutomationSettings) =>
  Effect.gen(function* ($) {
    const updated = yield* $(
      query(async (db) =>
        db
          .update(storeSettings)
          .set({ emailAutomationSettings: settings, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning(),
      ),
    );
    if (updated.length > 0) {
      return {
        emailAutomationSettings: updated[0]!.emailAutomationSettings as EmailAutomationSettings,
      };
    }

    const inserted = yield* $(
      query(async (db) =>
        db
          .insert(storeSettings)
          .values({ key: "default", emailAutomationSettings: settings })
          .returning(),
      ),
    );
    if (!inserted[0]) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "FailedToUpdateEmailAutomationSettings",
            statusCode: 500,
            clientMessage: "Failed to save email automation settings",
          }),
        ),
      );
    }
    return {
      emailAutomationSettings: inserted[0].emailAutomationSettings as EmailAutomationSettings,
    };
  });

/** Plain-async variant for the worker's polling loop (non-Effect context). */
export async function getEmailAutomationSettingsRaw(): Promise<EmailAutomationSettings> {
  const rows = await db()
    .select({ emailAutomationSettings: storeSettings.emailAutomationSettings })
    .from(storeSettings)
    .where(eq(storeSettings.key, "default"))
    .limit(1);
  return {
    ...DEFAULT_EMAIL_AUTOMATION_SETTINGS,
    ...(rows[0]?.emailAutomationSettings ?? {}),
  };
}
