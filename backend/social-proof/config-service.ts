import { query } from "#root/shared/database/drizzle/db";
import { storeSettings } from "#root/shared/database/drizzle/schema";
import type { SocialProofConfig } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { ServerError } from "#root/shared/error/server";
import { DEFAULT_SOCIAL_PROOF_CONFIG } from "./defaults";

/**
 * Reads the social-proof config, merged over the shipped defaults.
 *
 * Merging (rather than returning the stored object as-is) is what lets a
 * field be added to `SocialProofConfig` later without a data migration: a row
 * saved before the field existed simply inherits its default.
 *
 * Mirrors backend/popup/config-service.ts, but against its own column — the
 * two features share a settings row and nothing else.
 */
export const getSocialProofConfig = () =>
  Effect.gen(function* ($) {
    const rows = yield* $(
      query(async (db) =>
        db
          .select({ socialProofConfig: storeSettings.socialProofConfig })
          .from(storeSettings)
          .where(eq(storeSettings.key, "default"))
          .limit(1),
      ),
    );
    return {
      ...DEFAULT_SOCIAL_PROOF_CONFIG,
      ...(rows[0]?.socialProofConfig ?? {}),
    };
  });

export const updateSocialProofConfig = (config: SocialProofConfig) =>
  Effect.gen(function* ($) {
    const updated = yield* $(
      query(async (db) =>
        db
          .update(storeSettings)
          .set({ socialProofConfig: config, updatedAt: new Date() })
          .where(eq(storeSettings.key, "default"))
          .returning(),
      ),
    );
    if (updated.length > 0) {
      return {
        socialProofConfig: updated[0]!.socialProofConfig as SocialProofConfig,
      };
    }

    // No settings row yet (fresh install) — create it carrying just this config.
    const inserted = yield* $(
      query(async (db) =>
        db
          .insert(storeSettings)
          .values({ key: "default", socialProofConfig: config })
          .returning(),
      ),
    );
    if (!inserted[0]) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "FailedToUpdateSocialProofConfig",
            statusCode: 500,
            clientMessage: "Failed to save social proof settings",
          }),
        ),
      );
    }
    return {
      socialProofConfig: inserted[0].socialProofConfig as SocialProofConfig,
    };
  });
