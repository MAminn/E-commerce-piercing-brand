import { readGa4MpMode, type Ga4MpMode } from "#root/backend/pixel-tracking/ga4-ownership";

/**
 * Platform health status, as shown by Pixels → Pixel Readiness and
 * Analytics → Platform Health.
 *
 * For every platform the status has always been computed from the last 7
 * days of server-side delivery rows (tracking_event_delivery). That still
 * holds — except GA4 in its normal client-owned mode (G1, GA4_MP_MODE=off):
 * the server deliberately sends nothing to GA4 there, so zero MP deliveries
 * is expected and old MP rows (e.g. "Missing api_secret" from before G1) say
 * nothing about today. GA4 health is then the browser tag's own state.
 */

export type PlatformHealthStatus = "healthy" | "degraded" | "down" | "no_data";

/** What the status was judged from. */
export type PlatformHealthBasis = "server_delivery" | "client";

export const GA4_CLIENT_OWNED_NOTE =
  "Client-side active · Server mirror disabled to prevent duplicate GA4 events";
export const GA4_CLIENT_OFF_NOTE =
  "Client-side off — GA4 receives no events (server mirror disabled to prevent duplicate GA4 events)";
export const GA4_NO_MEASUREMENT_ID_NOTE =
  "No valid GA4 Measurement ID (G-…) — GA4 receives no events";
export const PIXEL_DISABLED_NOTE = "Pixel disabled";

export interface PlatformHealthInput {
  platform: string;
  /** Configured pixel row, if any (absent: deliveries for a deleted config). */
  config?: { enabled: boolean; enableClientSide: boolean; pixelId: string } | null;
  successCount: number;
  failedCount: number;
  lastEventAt: Date | null;
}

export interface PlatformHealthRow {
  platform: string;
  enabled: boolean;
  successRate: number;
  successCount: number;
  failedCount: number;
  lastEventAt: string | null;
  status: PlatformHealthStatus;
  basis: PlatformHealthBasis;
  /** Human-readable explanation of the status (client-owned GA4 only). */
  note?: string;
}

/** The pre-G1 rule, unchanged: success rate of server deliveries (7 days). */
export function serverDeliveryStatus(success: number, failed: number): {
  status: PlatformHealthStatus;
  successRate: number;
} {
  const total = success + failed;
  const successRate = total > 0 ? (success / total) * 100 : 0;
  const status: PlatformHealthStatus =
    total === 0 ? "no_data" : successRate >= 99 ? "healthy" : successRate >= 90 ? "degraded" : "down";
  return { status, successRate: Math.round(successRate * 10) / 10 };
}

const GA4_MEASUREMENT_ID = /^G-[A-Z0-9]+$/i;

/** Whether GA4 health is judged from the browser tag (client-owned mode). */
export function isGa4ClientOwned(mode: Ga4MpMode = readGa4MpMode()): boolean {
  return mode !== "legacy_all";
}

export function evaluatePlatformHealth(
  input: PlatformHealthInput,
  ga4Mode: Ga4MpMode = readGa4MpMode(),
): PlatformHealthRow {
  const enabled = input.config?.enabled ?? false;

  if (input.platform === "google_ga4" && isGa4ClientOwned(ga4Mode)) {
    const cfg = input.config;
    let status: PlatformHealthStatus;
    let note: string;
    if (!cfg || !cfg.enabled) {
      status = "no_data";
      note = PIXEL_DISABLED_NOTE;
    } else if (!cfg.enableClientSide) {
      status = "down";
      note = GA4_CLIENT_OFF_NOTE;
    } else if (!GA4_MEASUREMENT_ID.test(cfg.pixelId.trim())) {
      status = "down";
      note = GA4_NO_MEASUREMENT_ID_NOTE;
    } else {
      status = "healthy";
      note = GA4_CLIENT_OWNED_NOTE;
    }
    // MP counts are history only in this mode; they never drive the status.
    return {
      platform: input.platform,
      enabled,
      successRate: 0,
      successCount: input.successCount,
      failedCount: input.failedCount,
      lastEventAt: input.lastEventAt?.toISOString() ?? null,
      status,
      basis: "client",
      note,
    };
  }

  const { status, successRate } = serverDeliveryStatus(input.successCount, input.failedCount);
  return {
    platform: input.platform,
    enabled,
    successRate,
    successCount: input.successCount,
    failedCount: input.failedCount,
    lastEventAt: input.lastEventAt?.toISOString() ?? null,
    status,
    basis: "server_delivery",
  };
}
