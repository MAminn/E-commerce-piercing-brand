/**
 * Tracking feature flags, read from the server environment (Coolify).
 *
 * Flags default OFF unless documented otherwise below; flipping one and
 * restarting the app is the rollback for the change it guards.
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

/** An explicit "switch it off" value. Unset / empty / anything else is not. */
export function isEnvFlagOff(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "false" || v === "0" || v === "no" || v === "off";
}

export interface ClientTrackingFlags {
  /**
   * TRACKING_EXCLUDE_INTERNAL — no pixels, no beacon, no engagement tracking
   * and no GA4 tag on internal routes (/dashboard*, /admin* — see
   * shared/utils/tracking-routes.ts); /api/track drops events whose page is
   * an internal URL. Storefront events are never dropped by role.
   *
   * DEFAULT ON (since 2026-11-12): only an explicit false/0/no/off turns it
   * off. A1 shipped default-off and the production env never set it, so
   * staff dashboard traffic kept reaching GA4/Meta.
   */
  excludeDashboard: boolean;
  /**
   * META_ADVANCED_MATCHING — Meta match quality (EMQ):
   * - browser pixel: manual advanced matching at `init` with pre-hashed
   *   external_id (our random tracking id) and, for a signed-in shopper,
   *   their account em / ph / fn / ln; a first-party _fbc cookie from
   *   ?fbclid=; the first beacon briefly waits for Meta's _fbp cookie
   * - Conversions API: hashed external_id on every event, hashed account
   *   fields for a signed-in shopper, and for a Purchase the hashed fields of
   *   the verified order it names
   *
   * DEFAULT ON (2026-11-13): only an explicit false/0/no/off turns it off,
   * which restores the previous user_data exactly (IP, UA, fbp, fbc).
   */
  metaAdvancedMatching: boolean;
}

export function readClientTrackingFlags(env: Env = process.env): ClientTrackingFlags {
  return {
    excludeDashboard: !isEnvFlagOff(env.TRACKING_EXCLUDE_INTERNAL),
    metaAdvancedMatching: !isEnvFlagOff(env.META_ADVANCED_MATCHING),
  };
}
