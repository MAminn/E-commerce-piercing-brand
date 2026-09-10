import type { UtmData, ClickIds } from "#root/shared/types/pixel-tracking";
import { CLICK_ID_PLATFORM_MAP } from "#root/shared/types/pixel-tracking";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Cookie name for first-touch UTM params. Set only once per visitor. */
export const FIRST_TOUCH_COOKIE = "_ft_utm";

/** Cookie name for last-touch UTM params. Overwritten on every new UTM visit. */
export const LAST_TOUCH_COOKIE = "_lt_utm";

/** Cookie max age in days. */
const COOKIE_DAYS = 90;

// ─── UTM Parameter Parsing ──────────────────────────────────────────────────

const UTM_PARAM_MAP: Record<string, keyof UtmData> = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_term: "utmTerm",
  utm_content: "utmContent",
};

const CLICK_ID_PARAMS = ["fbclid", "gclid", "ttclid", "ScCid", "epik"];

/**
 * Parse UTM parameters from a URL search string.
 */
export function parseUtmFromSearch(search: string): UtmData {
  const params = new URLSearchParams(search);
  const utm: UtmData = {};

  for (const [paramName, key] of Object.entries(UTM_PARAM_MAP)) {
    const value = params.get(paramName);
    if (value) {
      utm[key] = value;
    }
  }

  return utm;
}

/**
 * Parse click IDs from a URL search string.
 */
export function parseClickIdsFromSearch(search: string): ClickIds {
  const params = new URLSearchParams(search);
  const clickIds: ClickIds = {};

  for (const param of CLICK_ID_PARAMS) {
    const value = params.get(param);
    if (value) {
      (clickIds as Record<string, string>)[param] = value;
    }
  }

  return clickIds;
}

/**
 * Check whether any UTM or click ID parameters are present.
 */
export function hasUtmOrClickIds(search: string): boolean {
  const params = new URLSearchParams(search);
  for (const paramName of Object.keys(UTM_PARAM_MAP)) {
    if (params.has(paramName)) return true;
  }
  for (const param of CLICK_ID_PARAMS) {
    if (params.has(param)) return true;
  }
  return false;
}

// ─── Cookie Helpers ─────────────────────────────────────────────────────────

function setCookie(name: string, value: string, days: number): void {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;expires=${expires.toUTCString()};SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

// ─── Cookie Serialization ───────────────────────────────────────────────────

interface UtmCookieData {
  utm: UtmData;
  clickIds: ClickIds;
  referrer?: string;
  landingPage?: string;
  timestamp: number;
}

export function serializeUtmCookie(data: UtmCookieData): string {
  return JSON.stringify(data);
}

export function deserializeUtmCookie(value: string): UtmCookieData | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || !parsed.timestamp) return null;
    return parsed as UtmCookieData;
  } catch {
    return null;
  }
}

// ─── First-Touch / Last-Touch Management ────────────────────────────────────

/**
 * Get the first-touch UTM data from cookie (if set).
 */
export function getFirstTouchUtm(): UtmCookieData | null {
  const cookie = getCookie(FIRST_TOUCH_COOKIE);
  if (!cookie) return null;
  return deserializeUtmCookie(cookie);
}

/**
 * Get the last-touch UTM data from cookie.
 */
export function getLastTouchUtm(): UtmCookieData | null {
  const cookie = getCookie(LAST_TOUCH_COOKIE);
  if (!cookie) return null;
  return deserializeUtmCookie(cookie);
}

/**
 * Capture UTM params and click IDs from the current URL.
 * Sets first-touch cookie (if not already set) and always overwrites last-touch.
 *
 * Returns the captured data, or null if no UTM/click ID params were present.
 */
export function captureUtmParams(
  search?: string,
  referrer?: string,
  landingPage?: string,
): UtmCookieData | null {
  const searchStr =
    search ??
    (typeof window !== "undefined" ? window.location.search : "");
  const ref =
    referrer ??
    (typeof document !== "undefined" ? document.referrer : undefined);
  const page =
    landingPage ??
    (typeof window !== "undefined" ? window.location.href : undefined);

  if (!hasUtmOrClickIds(searchStr)) return null;

  const data: UtmCookieData = {
    utm: parseUtmFromSearch(searchStr),
    clickIds: parseClickIdsFromSearch(searchStr),
    referrer: ref || undefined,
    landingPage: page || undefined,
    timestamp: Date.now(),
  };

  const serialized = serializeUtmCookie(data);

  // First-touch: only set if cookie doesn't already exist
  if (!getCookie(FIRST_TOUCH_COOKIE)) {
    setCookie(FIRST_TOUCH_COOKIE, serialized, COOKIE_DAYS);
  }

  // Last-touch: always overwrite
  setCookie(LAST_TOUCH_COOKIE, serialized, COOKIE_DAYS);

  return data;
}

/**
 * Get the first click ID found and its associated platform.
 */
export function getClickIdPlatform(
  clickIds: ClickIds,
): { clickId: string; platform: string } | null {
  for (const [key, value] of Object.entries(clickIds)) {
    if (value) {
      const platform = CLICK_ID_PLATFORM_MAP[key];
      if (platform) {
        return { clickId: value, platform };
      }
    }
  }
  return null;
}

/**
 * Enrich a tracking event payload with UTM data from last-touch cookie.
 */
export function enrichEventWithUtm(
  event: Record<string, unknown>,
): Record<string, unknown> {
  const lastTouch = getLastTouchUtm();
  if (!lastTouch) return event;

  return {
    ...event,
    ...lastTouch.utm,
    ...(lastTouch.clickIds.fbclid
      ? { fbclid: lastTouch.clickIds.fbclid }
      : {}),
    ...(lastTouch.clickIds.gclid
      ? { gclid: lastTouch.clickIds.gclid }
      : {}),
    ...(lastTouch.clickIds.ttclid
      ? { ttclid: lastTouch.clickIds.ttclid }
      : {}),
    ...(lastTouch.clickIds.ScCid
      ? { ScCid: lastTouch.clickIds.ScCid }
      : {}),
    ...(lastTouch.clickIds.epik
      ? { epik: lastTouch.clickIds.epik }
      : {}),
  };
}
