import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

export const setComingSoonMode = (enabled: boolean) =>
  Effect.gen(function* ($) {
    const updated = yield* $(
      query(async (db) =>
        db
          .update(storeSettings)
          .set({ comingSoonMode: enabled, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning({ comingSoonMode: storeSettings.comingSoonMode }),
      ),
    );

    if (updated.length > 0) return updated[0]!.comingSoonMode;

    // No row yet — insert one
    const inserted = yield* $(
      query(async (db) =>
        db
          .insert(storeSettings)
          .values({ key: "default", comingSoonMode: enabled })
          .returning({ comingSoonMode: storeSettings.comingSoonMode }),
      ),
    );
    return inserted[0]!.comingSoonMode;
  });
