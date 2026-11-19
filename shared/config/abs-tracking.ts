/**
 * ABS_TRACKING_MODE — ABS courier tracking.
 *
 *   off (DEFAULT, and any unknown value) — nothing starts; no ABS request,
 *          no query against the abs_* tables. The app behaves as before.
 *   shadow — the poller reads ABS shipments, links them to website orders and
 *          RECORDS what it would do in abs_tracking_decision. It never writes
 *          to any existing table (order, order_item, product, order_log, …).
 *   live   — shadow, plus ONE automatic transition: an order whose ABS shipment
 *          is DELIVERED becomes Delivered through the admin status core
 *          (backend/shipping-tracking/abs/live.ts), when every eligibility rule
 *          passes. ABS_LIVE_REQUIRE_APPROVAL (default true) makes it wait for
 *          the owner's "Mark these N Delivered" button. A DB pause flag
 *          (abs_settings.live_paused) turns live back into shadow at runtime.
 *
 * Rollback: pause on the screen; then ABS_TRACKING_MODE=shadow (or off) and
 * restart.
 *
 * The REQUESTED mode comes from the env; the EFFECTIVE mode is what the app
 * actually runs. It stays `off` until the boot readiness check
 * (backend/shipping-tracking/abs/readiness.ts) has confirmed the abs_* tables
 * exist and ABS_API_BASE_URL / ABS_API_KEY are usable; `live` additionally
 * needs migration 0072 and a valid ABS_LIVE_TRANSITIONS, else it runs shadow.
 *
 * Dependency-free on purpose (like ga4-purchase-owner.ts).
 */
export type AbsTrackingRequestedMode = "off" | "shadow" | "live";
export type AbsTrackingMode = "off" | "shadow" | "live";

/** The only transition live mode may ever apply. Any other ABS_LIVE_TRANSITIONS value is rejected at boot. */
export const ABS_LIVE_ALLOWED_TRANSITIONS = ["delivered"] as const;
export const ABS_LIVE_SETTLE_MINUTES_DEFAULT = 30;
export const ABS_LIVE_MAX_AGE_DAYS_DEFAULT = 14;
export const ABS_LIVE_MAX_PER_TICK_DEFAULT = 10;
export const ABS_LIVE_DAILY_CAP_DEFAULT = 40;

export const ABS_POLL_INTERVAL_DEFAULT_MS = 600_000;
export const ABS_POLL_INTERVAL_MIN_MS = 300_000;
export const ABS_POLL_OVERLAP_DEFAULT_MS = 1_800_000;
export const ABS_BACKFILL_FROM_DEFAULT = "2026-11-01";
export const ABS_MATCH_WINDOW_DAYS_DEFAULT = 10;
export const ABS_COD_TOLERANCE_EGP_DEFAULT = 1;
/** ABS is the only courier for orders placed on/after this Cairo date (owner decision, 18 Nov 2026). */
export const ABS_ONLY_SINCE_DEFAULT = "2026-11-18";
export const ABS_MISSING_AWB_ALERT_DAYS_DEFAULT = 2;
/** Candidate window for REVERSE / EXCHANGE shipments (suggestions only, never auto). */
export const ABS_REVERSE_WINDOW_DAYS_DEFAULT = 45;
/** Pages of 100 per tick; a bigger window continues on the next tick (gentle first production run). */
export const ABS_MAX_PAGES_PER_TICK_DEFAULT = 20;
export const ABS_MAX_PAGES_PER_TICK_LIMIT = 50;
/** Total time budget of one tick (all ABS requests + processing). */
export const ABS_TICK_TIMEOUT_DEFAULT_MS = 300_000;
export const ABS_TICK_TIMEOUT_MIN_MS = 30_000;
/** Failure backoff ceiling. */
export const ABS_BACKOFF_MAX_MS = 3_600_000;

export interface AbsLiveConfig {
  /** ABS_LIVE_TRANSITIONS, parsed. Always ["delivered"] when valid. */
  transitions: string[];
  /** Set when ABS_LIVE_TRANSITIONS holds anything but `delivered`: live is refused (runs shadow). */
  transitionsError: string | null;
  settleMinutes: number;
  maxAgeDays: number;
  maxPerTick: number;
  dailyCap: number;
  /** ABS_LIVE_REQUIRE_APPROVAL — default true (canary): eligible items wait for the owner's button. */
  requireApproval: boolean;
}

export interface AbsTrackingConfig {
  requestedMode: AbsTrackingRequestedMode;
  /** The mode this config allows for the request (`live` → `shadow` when ABS_LIVE_TRANSITIONS is invalid). */
  mode: AbsTrackingMode;
  live: AbsLiveConfig;
  /** Normalised https base URL without trailing slash, or null if unusable. */
  baseUrl: string | null;
  /** Never logged. Null when unset. */
  apiKey: string | null;
  pollIntervalMs: number;
  overlapMs: number;
  backfillFrom: Date;
  matchWindowDays: number;
  codToleranceEgp: number;
  /** Orders placed on/after this instant must have an ABS shipment (missing-AWB alert). */
  absOnlySince: Date;
  missingAwbAlertDays: number;
  reverseWindowDays: number;
  maxPagesPerTick: number;
  tickTimeoutMs: number;
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
  return parseCairoDate(raw, ABS_BACKFILL_FROM_DEFAULT);
}

/** Same rules as ABS_BACKFILL_FROM, with its own default. */
export function parseCairoDate(raw: string | undefined, fallbackDay: string): Date {
  const v = (raw ?? "").trim();
  const fallback = new Date(`${fallbackDay}T00:00:00+02:00`);
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

/**
 * ABS_LIVE_TRANSITIONS: comma-separated target statuses. Unset = `delivered`.
 * Only `delivered` is valid; anything else (cancelled, shipped, returned, a
 * typo) is an error that keeps live mode off.
 */
export function parseLiveTransitions(raw: string | undefined): { transitions: string[]; error: string | null } {
  const v = (raw ?? "").trim();
  if (!v) return { transitions: ["delivered"], error: null };
  const parts = [...new Set(v.toLowerCase().split(/[\s,;]+/).filter(Boolean))];
  const bad = parts.filter((p) => !(ABS_LIVE_ALLOWED_TRANSITIONS as readonly string[]).includes(p));
  if (bad.length > 0 || parts.length === 0) {
    return { transitions: [], error: `ABS_LIVE_TRANSITIONS may only be "delivered" (got ${parts.length} value(s), ${bad.length} not allowed)` };
  }
  return { transitions: parts, error: null };
}

/** true unless explicitly false / 0 / no / off. */
function boolDefaultTrue(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "no" || v === "off");
}

export function readAbsLiveConfig(env: Env = process.env): AbsLiveConfig {
  const t = parseLiveTransitions(env.ABS_LIVE_TRANSITIONS);
  return {
    transitions: t.transitions,
    transitionsError: t.error,
    settleMinutes: intFrom(env.ABS_LIVE_SETTLE_MINUTES, ABS_LIVE_SETTLE_MINUTES_DEFAULT),
    maxAgeDays: Math.max(1, intFrom(env.ABS_LIVE_MAX_AGE_DAYS, ABS_LIVE_MAX_AGE_DAYS_DEFAULT)),
    maxPerTick: Math.max(1, intFrom(env.ABS_LIVE_MAX_PER_TICK, ABS_LIVE_MAX_PER_TICK_DEFAULT)),
    dailyCap: Math.max(1, intFrom(env.ABS_LIVE_DAILY_CAP, ABS_LIVE_DAILY_CAP_DEFAULT)),
    requireApproval: boolDefaultTrue(env.ABS_LIVE_REQUIRE_APPROVAL),
  };
}

export function readAbsTrackingConfig(env: Env = process.env): AbsTrackingConfig {
  const requestedMode = readAbsTrackingMode(env);
  const warnings: string[] = [];
  const missing: string[] = [];
  const live = readAbsLiveConfig(env);
  let mode: AbsTrackingMode = requestedMode;
  if (requestedMode === "live" && live.transitionsError) {
    warnings.push(`live refused: ${live.transitionsError}; running shadow`);
    mode = "shadow";
  }

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
    live,
    baseUrl,
    apiKey,
    pollIntervalMs,
    overlapMs: intFrom(env.ABS_POLL_OVERLAP_MS, ABS_POLL_OVERLAP_DEFAULT_MS),
    backfillFrom: parseBackfillFrom(env.ABS_BACKFILL_FROM),
    matchWindowDays: Math.max(1, intFrom(env.ABS_MATCH_WINDOW_DAYS, ABS_MATCH_WINDOW_DAYS_DEFAULT)),
    codToleranceEgp: numberFrom(env.ABS_COD_TOLERANCE_EGP, ABS_COD_TOLERANCE_EGP_DEFAULT),
    absOnlySince: parseCairoDate(env.ABS_ONLY_SINCE, ABS_ONLY_SINCE_DEFAULT),
    missingAwbAlertDays: intFrom(env.ABS_MISSING_AWB_ALERT_DAYS, ABS_MISSING_AWB_ALERT_DAYS_DEFAULT),
    reverseWindowDays: Math.max(1, intFrom(env.ABS_REVERSE_WINDOW_DAYS, ABS_REVERSE_WINDOW_DAYS_DEFAULT)),
    maxPagesPerTick: Math.min(ABS_MAX_PAGES_PER_TICK_LIMIT, Math.max(1, intFrom(env.ABS_MAX_PAGES_PER_TICK, ABS_MAX_PAGES_PER_TICK_DEFAULT))),
    tickTimeoutMs: Math.max(ABS_TICK_TIMEOUT_MIN_MS, intFrom(env.ABS_TICK_TIMEOUT_MS, ABS_TICK_TIMEOUT_DEFAULT_MS)),
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

/** What the boot check decided, for absTracking.overview (no secrets: reasons name env vars only). */
export interface AbsTrackingBootStatus {
  requestedMode: AbsTrackingRequestedMode;
  effective: AbsTrackingMode;
  /** Why the mode is off (null when running). */
  reason: string | null;
  /** Readiness result when it was checked (null when the mode was off before the check). */
  ready: boolean | null;
  missing: string[];
  checkedAt: string;
  /** Migration 0072 (live tables) present — lets Undo / "Done automatically" work after a rollback to shadow. */
  liveTablesReady?: boolean | null;
}
let bootStatus: AbsTrackingBootStatus | null = null;
export function setAbsTrackingBootStatus(status: AbsTrackingBootStatus | null): void {
  bootStatus = status;
}
export function getAbsTrackingBootStatus(): AbsTrackingBootStatus | null {
  return bootStatus;
}
