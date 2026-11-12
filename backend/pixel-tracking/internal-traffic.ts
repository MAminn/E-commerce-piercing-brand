import { sql, type SQL } from "drizzle-orm";
import {
  trackingEvent,
  trackingEventDelivery,
} from "#root/shared/database/drizzle/schema";
import { readClientTrackingFlags } from "#root/shared/config/tracking-flags";

/**
 * An internal page URL (/dashboard*, /admin*) — absolute
 * (`https://host/dashboard…`) or a bare path — matching
 * shared/utils/tracking-routes.ts isDashboardPath.
 * POSIX regex for Postgres `~*` (case-insensitive).
 */
export const DASHBOARD_URL_PATTERN = "^([a-z][a-z0-9+.-]*://[^/]+)?/(dashboard|admin)([/?#]|$)";

/**
 * TRACKING_EXCLUDE_INTERNAL (A2): a WHERE condition that keeps only
 * tracking_event rows NOT recorded on a /dashboard* page — so the stats,
 * the readiness panel and the funnel stop counting staff dashboard traffic
 * that was logged before A1 stopped it at the source.
 *
 * `undefined` when the flag is off; drizzle's `and()` drops undefined
 * conditions, so the query is then exactly what it was before.
 */
export function excludeDashboardEvents(): SQL | undefined {
  if (!readClientTrackingFlags().excludeDashboard) return undefined;
  return sql`(${trackingEvent.pageUrl} IS NULL OR ${trackingEvent.pageUrl} !~* ${DASHBOARD_URL_PATTERN})`;
}

/** Same rule for tracking_event_delivery rows, through their event. */
export function excludeDashboardDeliveries(): SQL | undefined {
  if (!readClientTrackingFlags().excludeDashboard) return undefined;
  return sql`NOT EXISTS (SELECT 1 FROM ${trackingEvent} WHERE ${trackingEvent.id} = ${trackingEventDelivery.trackingEventId} AND ${trackingEvent.pageUrl} ~* ${DASHBOARD_URL_PATTERN})`;
}
