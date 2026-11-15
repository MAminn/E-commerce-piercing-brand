/**
 * Meta Conversions API relay copies — two adjustments made ONLY to the copy
 * sent to Meta. Persisted tracking_event rows, the browser pixel and every
 * other platform are untouched; event_id and event_name never change, so
 * pixel ↔ CAPI deduplication is unaffected.
 *
 * 1. META_CAPI_SKIP_ENGAGEMENT (default ON): scroll_depth and time_on_page
 *    are not relayed to the Conversions API. The browser pixel still sends
 *    them (fbq trackCustom with their eventID) and they are still stored in
 *    tracking_event. A beacon holding only such events makes no Meta call and
 *    they get no Meta delivery-log row.
 *
 * 2. META_FBC_FALLBACK (default ON): when the request carries no `_fbc`
 *    cookie, the relay copy uses the event's `fbcHint` — the landing click id
 *    the browser kept in localStorage (frontend/tracking/fbc-hint.ts) — if it
 *    passes shared/tracking/fbc-hint.ts `acceptFbcHint`. No database query,
 *    no cache, no index dependency. The hint is never persisted
 *    (server/routes/track.ts removes it before the pipeline runs).
 *
 * Rollback for either: set the flag to false/0/no/off and restart.
 */
import type { EnrichedTrackingEvent } from "#root/backend/pixel-tracking/event-logger";
import { isEnvFlagOff } from "#root/shared/config/tracking-flags";
import { acceptFbcHint } from "#root/shared/tracking/fbc-hint";

type Env = Record<string, string | undefined>;

export interface MetaServerFeedFlags {
  fbcFallback: boolean;
  skipEngagement: boolean;
}

export function readMetaServerFeedFlags(env: Env = process.env): MetaServerFeedFlags {
  return {
    fbcFallback: !isEnvFlagOff(env.META_FBC_FALLBACK),
    skipEngagement: !isEnvFlagOff(env.META_CAPI_SKIP_ENGAGEMENT),
  };
}

/** Engagement events kept off the Conversions API (the browser pixel still sends them). */
export const META_CAPI_EXCLUDED_EVENTS: ReadonlySet<string> = new Set(["scroll_depth", "time_on_page"]);

export function isRelayedToMetaCapi(eventName: string, flags: Pick<MetaServerFeedFlags, "skipEngagement">): boolean {
  return !(flags.skipEngagement && META_CAPI_EXCLUDED_EVENTS.has(eventName));
}

/**
 * Relay copies with `serverContext.fbc` filled from the event's hint where
 * the request had no `_fbc` cookie and the hint is valid against the server
 * clock. A cookie always wins. Events without a usable hint are returned as
 * they came. Never mutates its input.
 */
export function applyFbcHints(
  events: EnrichedTrackingEvent[],
  hints: ReadonlyMap<string, string>,
  nowMs: number = Date.now(),
): EnrichedTrackingEvent[] {
  if (hints.size === 0) return events;
  return events.map((event) => {
    if (event.serverContext.fbc) return event;
    const fbc = acceptFbcHint(hints.get(event.eventId), nowMs);
    if (!fbc) return event;
    return { ...event, serverContext: { ...event.serverContext, fbc } };
  });
}
