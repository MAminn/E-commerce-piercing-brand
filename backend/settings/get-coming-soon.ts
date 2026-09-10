import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

export const getComingSoonMode = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db.select({ comingSoonMode: storeSettings.comingSoonMode })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );
    return rows[0]?.comingSoonMode ?? false;
  });
