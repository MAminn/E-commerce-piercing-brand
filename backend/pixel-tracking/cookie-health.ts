/**
 * Cookie-presence diagnostics (admin-only, read-only).
 *
 * Question: do the first-party tracking cookies `_ga`, `_fbc` and `_fbp`
 * reach /api/track for the whole of a VISIT, per browser kind?
 *
 * HYPOTHESIS under test (not established): in a share of iOS
 * Facebook/Instagram in-app browser visits the cookies arrive on the first
 * beacons and then stop arriving, while localStorage keeps working. Other
 * explanations this report cannot rule out on its own: the browser's own
 * cookie expiry (Safari caps script-written cookies), consent changes, and a
 * transport that sends a request without cookies (e.g. sendBeacon on page
 * hide) while the cookie is still in the jar.
 *
 * Method:
 * - Only PRESENCE is read (`jsonb ?` on tracking_event.event_data
 *   ->'serverContext'). No cookie value, IP or user-agent string ever leaves
 *   the query; user agents are reduced to a coarse app / OS bucket in SQL.
 * - Unit = beacon: the events one beacon stored share created_at and the
 *   same request cookies, so they are collapsed to one observation.
 * - Unit of analysis = visit: a tracking session (a long-lived localStorage
 *   id) is split wherever ≥ 30 minutes pass between two beacons.
 * - Per visit and cookie, the sequence of beacons (P = present, A = absent)
 *   is classified, in this order:
 *     never        — no P
 *     intermittent — P, then A, then P again somewhere (`PA+P`)
 *     lost         — P, then A to the end of the visit (`PA+$`, no recovery)
 *     ok           — P on every beacon from its first appearance on
 *   (A…AP…P — e.g. `_ga` only set after the first beacon — is ok.)
 * - Window: at most 7 days.
 */
import { sql } from "drizzle-orm";
import type { DatabaseClient } from "#root/shared/database/drizzle/db";

export type CookieName = "ga" | "fbc" | "fbp";
export const COOKIE_NAMES: readonly CookieName[] = ["ga", "fbc", "fbp"];

export interface CookieVisitStats {
  ok: number;
  lost: number;
  intermittent: number;
  never: number;
}

export interface CookieHealthBucket {
  app: "facebook_inapp" | "instagram_inapp" | "other";
  os: "ios" | "android" | "other";
  visits: number;
  cookies: Record<CookieName, CookieVisitStats>;
}

export interface CookieHealthReport {
  windowDays: number;
  minBeaconsPerVisit: number;
  visitGapMinutes: number;
  buckets: CookieHealthBucket[];
  /**
   * GA4 purchase candidates held for missing_client_id in the window, and
   * whether the browser's purchase beacon (tracking_event
   * `purchase-<order id>`) carried `_ga`. Null when the GA4 purchase outbox
   * table does not exist (migration 0069 not applied).
   */
  heldPurchases: { held: number; beaconWithGa: number; beaconWithoutGa: number; noBeacon: number } | null;
}

export const COOKIE_HEALTH_MAX_DAYS = 7;
export const VISIT_GAP_MINUTES = 30;

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;
const n = (v: string | number | null | undefined) => Number(v ?? 0);

const APP_SQL = sql`CASE WHEN ua ~* 'Instagram' THEN 'instagram_inapp'
  WHEN ua ~* 'FBAN|FBAV|FB_IAB|FB4A' THEN 'facebook_inapp' ELSE 'other' END`;
const OS_SQL = sql`CASE WHEN ua ~* 'iPhone|iPad|iPod' THEN 'ios' WHEN ua ~* 'Android' THEN 'android' ELSE 'other' END`;

/** never / intermittent / lost / ok counts for one cookie's pattern column. */
const classify = (col: string) => {
  const c = sql.raw(col);
  return sql`
    count(*) FILTER (WHERE ${c} !~ 'P')::text AS ${sql.raw(`${col}_never`)},
    count(*) FILTER (WHERE ${c} ~ 'PA+P')::text AS ${sql.raw(`${col}_intermittent`)},
    count(*) FILTER (WHERE ${c} ~ 'PA+$' AND ${c} !~ 'PA+P')::text AS ${sql.raw(`${col}_lost`)},
    count(*) FILTER (WHERE ${c} ~ 'P' AND ${c} !~ 'PA')::text AS ${sql.raw(`${col}_ok`)}`;
};

export async function getCookieHealth(
  db: Pick<DatabaseClient, "execute">,
  windowDays = 3,
  minBeaconsPerVisit = 2,
): Promise<CookieHealthReport> {
  const days = Math.min(Math.max(Math.trunc(windowDays), 1), COOKIE_HEALTH_MAX_DAYS);
  const minBeacons = Math.min(Math.max(Math.trunc(minBeaconsPerVisit), 2), 50);

  const buckets = rowsOf<Record<string, string>>(
    await db.execute(sql`
      WITH b AS (
        SELECT session_id, created_at, max(user_agent) AS ua,
               bool_or(event_data->'serverContext' ? 'ga')  AS ga,
               bool_or(event_data->'serverContext' ? 'fbc') AS fbc,
               bool_or(event_data->'serverContext' ? 'fbp') AS fbp
        FROM tracking_event
        WHERE created_at >= now() - make_interval(days => ${days})
        GROUP BY session_id, created_at
      ),
      g AS (
        SELECT b.*,
               CASE WHEN lag(created_at) OVER w IS NULL
                      OR created_at - lag(created_at) OVER w >= make_interval(mins => ${VISIT_GAP_MINUTES})
                    THEN 1 ELSE 0 END AS new_visit
        FROM b WINDOW w AS (PARTITION BY session_id ORDER BY created_at)
      ),
      v AS (
        SELECT g.*, sum(new_visit) OVER (PARTITION BY session_id ORDER BY created_at ROWS UNBOUNDED PRECEDING) AS visit_no
        FROM g
      ),
      p AS (
        SELECT max(ua) AS ua,
               string_agg(CASE WHEN ga  THEN 'P' ELSE 'A' END, '' ORDER BY created_at) AS ga,
               string_agg(CASE WHEN fbc THEN 'P' ELSE 'A' END, '' ORDER BY created_at) AS fbc,
               string_agg(CASE WHEN fbp THEN 'P' ELSE 'A' END, '' ORDER BY created_at) AS fbp
        FROM v GROUP BY session_id, visit_no
        HAVING count(*) >= ${minBeacons}
      )
      SELECT ${APP_SQL} AS app, ${OS_SQL} AS os, count(*)::text AS visits,
        ${classify("ga")},
        ${classify("fbc")},
        ${classify("fbp")}
      FROM p GROUP BY 1, 2 ORDER BY 1, 2`),
  );

  // Unqualified on purpose: resolves through search_path like every other
  // query here (the integration test runs in an isolated schema).
  const [table] = rowsOf<{ present: boolean }>(
    await db.execute(sql`SELECT to_regclass('ga4_purchase_outbox') IS NOT NULL AS present`),
  );
  const [held] = !table?.present
    ? []
    : rowsOf<Record<string, string>>(
        await db.execute(sql`
          SELECT count(*)::text AS held,
                 count(*) FILTER (WHERE t.id IS NOT NULL AND (t.event_data->'serverContext' ? 'ga'))::text AS with_ga,
                 count(*) FILTER (WHERE t.id IS NOT NULL AND NOT (t.event_data->'serverContext' ? 'ga'))::text AS without_ga,
                 count(*) FILTER (WHERE t.id IS NULL)::text AS no_beacon
          FROM ga4_purchase_outbox x
          LEFT JOIN LATERAL (
            SELECT id, event_data FROM tracking_event WHERE event_id = 'purchase-' || x.order_id::text LIMIT 1
          ) t ON true
          WHERE x.held_reason = 'missing_client_id'
            AND x.created_at >= now() - make_interval(days => ${days})`),
      );

  const stats = (r: Record<string, string>, k: CookieName): CookieVisitStats => ({
    ok: n(r[`${k}_ok`]),
    lost: n(r[`${k}_lost`]),
    intermittent: n(r[`${k}_intermittent`]),
    never: n(r[`${k}_never`]),
  });

  return {
    windowDays: days,
    minBeaconsPerVisit: minBeacons,
    visitGapMinutes: VISIT_GAP_MINUTES,
    buckets: buckets.map((r) => ({
      app: r.app as CookieHealthBucket["app"],
      os: r.os as CookieHealthBucket["os"],
      visits: n(r.visits),
      cookies: { ga: stats(r, "ga"), fbc: stats(r, "fbc"), fbp: stats(r, "fbp") },
    })),
    heldPurchases: !table?.present
      ? null
      : {
          held: n(held?.held),
          beaconWithGa: n(held?.with_ga),
          beaconWithoutGa: n(held?.without_ga),
          noBeacon: n(held?.no_beacon),
        },
  };
}
