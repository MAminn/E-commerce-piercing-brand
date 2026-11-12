/**
 * How the Pixels admin shows server-side state, given GA4's ownership mode
 * (G1, backend/pixel-tracking/ga4-ownership.ts).
 *
 * In the normal client-owned mode (GA4_MP_MODE=off — the default) the server
 * never sends to GA4, whatever the GA4 row's "server-side" switch or API
 * secret say. The admin must not present that switch as if it sent events,
 * nor warn about a missing GA4 secret. In legacy_all the old display applies.
 */

export const GA4_SERVER_MIRROR_DISABLED_TITLE =
  "Server mirror disabled to prevent duplicate GA4 events (GA4_MP_MODE=off). The browser tag sends every GA4 event, purchases included.";

/** Minimal shape of a platform-health row (backend/analytics/platform-health.ts). */
export interface HealthBasisRow {
  platform: string;
  basis?: "server_delivery" | "client";
}

/**
 * Whether GA4 runs client-owned. Read from the GA4 health row's basis; with
 * no GA4 row yet (no GA4 pixel configured) the server default applies —
 * client-owned.
 */
export function isGa4ClientOwnedFrom(rows: readonly HealthBasisRow[]): boolean {
  const ga4 = rows.find((r) => r.platform === "google_ga4");
  return ga4?.basis !== "server_delivery";
}

export type ServerSideDisplay = "active" | "missing_token" | "off" | "mirror_disabled";

export function serverSideDisplay(
  cfg: { platform: string; enabled: boolean; enableServerSide: boolean; hasAccessToken: boolean },
  ga4ClientOwned: boolean,
): ServerSideDisplay {
  if (cfg.platform === "google_ga4" && ga4ClientOwned) return "mirror_disabled";
  if (cfg.enableServerSide && cfg.hasAccessToken && cfg.enabled) return "active";
  if (cfg.enableServerSide && !cfg.hasAccessToken) return "missing_token";
  return "off";
}

/** The "server-side on but no secret" warning — never for client-owned GA4. */
export function showsMissingTokenWarning(
  configs: ReadonlyArray<{ platform: string; enableServerSide: boolean; hasAccessToken: boolean }>,
  ga4ClientOwned: boolean,
): boolean {
  return configs.some(
    (c) => c.enableServerSide && !c.hasAccessToken && !(c.platform === "google_ga4" && ga4ClientOwned),
  );
}
