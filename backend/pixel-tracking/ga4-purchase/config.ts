import { eq } from "drizzle-orm";
import { pixelConfig } from "#root/shared/database/drizzle/schema";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";

/**
 * The GA4 row of pixel_config, as the server-owned Purchase needs it:
 * measurement id (`pixel_id`), Measurement Protocol API secret
 * (`access_token`) and the consent settings.
 *
 * Independent of `enable_server_side` on purpose: that toggle belongs to the
 * legacy every-event mirror (GA4_MP_MODE=legacy_all), which stays off.
 */
export interface Ga4ServerConfig {
  measurementId: string;
  apiSecret: string | null;
  enabled: boolean;
  consentRequired: boolean;
  consentCategory: string | null;
}

const CACHE_MS = 60_000;
let cache: { at: number; value: Ga4ServerConfig | null } | null = null;

export function clearGa4ServerConfigCache(): void {
  cache = null;
}

type Reader = Pick<DatabaseClient, "select">;

export async function loadGa4ServerConfig(db: Reader, now: number = Date.now()): Promise<Ga4ServerConfig | null> {
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  const [row] = await db
    .select({
      pixelId: pixelConfig.pixelId,
      accessToken: pixelConfig.accessToken,
      enabled: pixelConfig.enabled,
      consentRequired: pixelConfig.consentRequired,
      consentCategory: pixelConfig.consentCategory,
    })
    .from(pixelConfig)
    .where(eq(pixelConfig.platform, "google_ga4"))
    .limit(1);
  const value: Ga4ServerConfig | null = row
    ? {
        measurementId: row.pixelId,
        apiSecret: row.accessToken?.trim() || null,
        enabled: row.enabled,
        consentRequired: row.consentRequired,
        consentCategory: row.consentCategory,
      }
    : null;
  cache = { at: now, value };
  return value;
}
