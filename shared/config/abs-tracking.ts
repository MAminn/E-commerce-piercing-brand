/**
 * ABS_TRACKING_MODE — read-only ABS courier tracking (Phase 1: shadow only).
 *
 *   off (DEFAULT, and any unknown value) — nothing starts; no ABS request,
 *          no query against the abs_* tables. The app behaves as before.
 *   shadow — the poller reads ABS shipments, links them to website orders and
 *          RECORDS what it would do in abs_tracking_decision. It never writes
 *          to any existing table (order, order_item, product, order_log, …).
 *   live   — NOT AVAILABLE in this build: treated as `shadow`, with one boot
 *          warning.
 *
 * Rollback: set ABS_TRACKING_MODE=off (or remove it) and restart.
 *
 * The REQUESTED mode comes from the env; the EFFECTIVE mode is what the app
 * actually runs. It stays `off` until the boot readiness check
 * (backend/shipping-tracking/abs/readiness.ts) has confirmed the abs_* tables
 * exist and ABS_API_BASE_URL / ABS_API_KEY are usable.
 *
 * Dependency-free on purpose (like ga4-purchase-owner.ts).
 */
export type AbsTrackingRequestedMode = "off" | "shadow" | "live";
export type AbsTrackingMode = "off" | "shadow";

export const ABS_POLL_INTERVAL_DEFAULT_MS = 600_000;
export const ABS_POLL_INTERVAL_MIN_MS = 300_000;
export const ABS_POLL_OVERLAP_DEFAULT_MS = 1_800_000;
export const ABS_BACKFILL_FROM_DEFAULT = "2026-11-01";
export const ABS_MATCH_WINDOW_DAYS_DEFAULT = 10;
export const ABS_COD_TOLERANCE_EGP_DEFAULT = 1;

export interface AbsTrackingConfig {
  requestedMode: AbsTrackingRequestedMode;
  /** The mode this build can run for the request (`live` → `shadow`). */
  mode: AbsTrackingMode;
  /** Normalised https base URL without trailing slash, or null if unusable. */
  baseUrl: string | null;
  /** Never logged. Null when unset. */
  apiKey: string | null;
  pollIntervalMs: number;
  overlapMs: number;
  backfillFrom: Date;
  matchWindowDays: number;
  codToleranceEgp: number;
  /** Why the poller cannot start even though a mode was requested. */
  missing: string[];
  /** One-line notes for the boot log (never contain the key). */
  warnings: string[];
}

type Env = Record<string, string | undefined>;

export function readAbsTrackingMode(env: Env = process.env): AbsTrackingRequestedMode {
  const v = (env.ABS_TRACKING_MODE ?? "").trim().toLowerCase();
  return v === "shadow" || v === "live" ? v : "off";
}

/** https only, no credentials, no query/fragment. Returns null when unusable. */
export function parseAbsBaseUrl(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function intFrom(raw: string | undefined, fallback: number): number {
  const v = (raw ?? "").trim();
  if (!/^\d+$/.test(v)) return fallback;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : fallback;
}

function numberFrom(raw: string | undefined, fallback: number): number {
  const v = (raw ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(v)) return fallback;
  return Number(v);
}

/**
 * `YYYY-MM-DD` is midnight Africa/Cairo (UTC+2 outside DST — Nov 2026 is
 * standard time); a full ISO timestamp WITH an offset is used as given.
 */
export function parseBackfillFrom(raw: string | undefined): Date {
  const v = (raw ?? "").trim();
  const fallback = new Date(`${ABS_BACKFILL_FROM_DEFAULT}T00:00:00+02:00`);
  if (!v) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00+02:00`);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  return fallback;
}

export function readAbsTrackingConfig(env: Env = process.env): AbsTrackingConfig {
  const requestedMode = readAbsTrackingMode(env);
  const warnings: string[] = [];
  const missing: string[] = [];
  if (requestedMode === "live") {
    warnings.push("live requested but not available in this build; running shadow");
  }
  const mode: AbsTrackingMode = requestedMode === "off" ? "off" : "shadow";

  const rawBase = env.ABS_API_BASE_URL;
  const baseUrl = parseAbsBaseUrl(rawBase);
  if (!(rawBase ?? "").trim()) missing.push("ABS_API_BASE_URL not set");
  else if (!baseUrl) missing.push("ABS_API_BASE_URL must be an https:// URL");
  const apiKey = (env.ABS_API_KEY ?? "").trim() || null;
  if (!apiKey) missing.push("ABS_API_KEY not set");

  let pollIntervalMs = intFrom(env.ABS_POLL_INTERVAL_MS, ABS_POLL_INTERVAL_DEFAULT_MS);
  if (pollIntervalMs < ABS_POLL_INTERVAL_MIN_MS) {
    if ((env.ABS_POLL_INTERVAL_MS ?? "").trim()) {
      warnings.push(`ABS_POLL_INTERVAL_MS below the ${ABS_POLL_INTERVAL_MIN_MS} ms floor; using the floor`);
    }
    pollIntervalMs = ABS_POLL_INTERVAL_MIN_MS;
  }

  return {
    requestedMode,
    mode,
    baseUrl,
    apiKey,
    pollIntervalMs,
    overlapMs: intFrom(env.ABS_POLL_OVERLAP_MS, ABS_POLL_OVERLAP_DEFAULT_MS),
    backfillFrom: parseBackfillFrom(env.ABS_BACKFILL_FROM),
    matchWindowDays: Math.max(1, intFrom(env.ABS_MATCH_WINDOW_DAYS, ABS_MATCH_WINDOW_DAYS_DEFAULT)),
    codToleranceEgp: numberFrom(env.ABS_COD_TOLERANCE_EGP, ABS_COD_TOLERANCE_EGP_DEFAULT),
    missing,
    warnings,
  };
}

let effective: AbsTrackingMode = "off";

/** The mode the app is running — `off` until readiness confirmed more. */
export function effectiveAbsTrackingMode(): AbsTrackingMode {
  return effective;
}

/** Set by the boot readiness check only (and by tests). */
export function setEffectiveAbsTrackingMode(mode: AbsTrackingMode): void {
  effective = mode;
}
