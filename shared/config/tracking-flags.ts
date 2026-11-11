/**
 * Tracking feature flags, read from the server environment (Coolify).
 *
 * Every flag defaults OFF, so a deploy without them changes nothing. Flipping
 * one and restarting the app is the rollback for the change it guards.
 *
 * Only the flags in ClientTrackingFlags reach the browser (via
 * pageContext.trackingFlags, see pages/+config.ts passToClient). None of them
 * is a secret.
 */

type Env = Record<string, string | undefined>;

export function isEnvFlagOn(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

export interface ClientTrackingFlags {
  /**
   * TRACKING_EXCLUDE_INTERNAL — no pixels, no beacon, no engagement tracking
   * and no GA4 tag on /dashboard* routes; /api/track drops events whose page
   * is a /dashboard* URL. Storefront events are never dropped by role.
   */
  excludeDashboard: boolean;
}

export function readClientTrackingFlags(env: Env = process.env): ClientTrackingFlags {
  return {
    excludeDashboard: isEnvFlagOn(env.TRACKING_EXCLUDE_INTERNAL),
  };
}
