import { pixelConfig } from "#root/shared/database/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";

/**
 * Direct database query for SSR pixel config injection.
 * Returns only the fields needed for script injection (no access tokens).
 * This is intentionally a thin function, NOT an Effect — it's called
 * directly from the Fastify handler where we don't have the Effect runtime.
 */
export async function listActiveClientConfigsRaw(db: DatabaseClient) {
  try {
    return await db
      .select({
        id: pixelConfig.id,
        platform: pixelConfig.platform,
        pixelId: pixelConfig.pixelId,
      })
      .from(pixelConfig)
      .where(
        and(
          eq(pixelConfig.enabled, true),
          eq(pixelConfig.enableClientSide, true),
        ),
      )
      .execute();
  } catch {
    // SSR pixel injection is an enhancement — failures must not break page rendering
    return [];
  }
}
