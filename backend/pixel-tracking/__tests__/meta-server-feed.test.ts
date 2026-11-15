import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyFbcHints,
  isRelayedToMetaCapi,
  readMetaServerFeedFlags,
} from "#root/backend/pixel-tracking/meta-server-feed";
import { processTrackingBeacon, SERVER_ADAPTERS } from "#root/backend/pixel-tracking/delivery-pipeline";
import { enrichEvents, type EnrichedTrackingEvent } from "#root/backend/pixel-tracking/event-logger";
import type { ServerContext } from "#root/server/routes/track";
import type { TrackingEvent } from "#root/shared/types/pixel-tracking";
import { buildFbcHint, FBC_HINT_MAX_FUTURE_MS, FBC_MAX_AGE_MS } from "#root/shared/tracking/fbc-hint";
import { makePipelineFakeDb } from "./pipeline-fake-db";

/**
 * Meta Conversions API relay copy:
 * A. META_CAPI_SKIP_ENGAGEMENT — scroll_depth / time_on_page stored, not relayed
 * B. META_FBC_FALLBACK — fbc from the browser's validated hint when the
 *    request has no _fbc cookie; no DB lookup; never persisted
 */
const NOW = Date.UTC(2026, 10, 15, 10, 0, 0);
const HINT = buildFbcHint("IwAR_click", NOW - 10 * 60_000);
const ctx = (over: Partial<ServerContext> = {}): ServerContext => ({ ip: "203.0.113.9", ipHash: "h", userAgent: "UA", fbp: "fb.1.1.2", ...over });
const ev = (over: Partial<TrackingEvent> = {}): TrackingEvent => ({
  eventId: `e-${Math.random()}`,
  eventName: "page_viewed",
  timestamp: NOW,
  pageUrl: "https://perce-eg.com/shop",
  sessionId: "S1",
  ...over,
});
const metaConfig = { id: "m", platform: "meta", pixelId: "123", accessToken: "t", enabled: true, enableServerSide: true };
const ON = { fbcFallback: true, skipEngagement: true };
const OFF = { fbcFallback: false, skipEngagement: false };

describe("flags", () => {
  it("both default ON; only an explicit off value turns each off", () => {
    expect(readMetaServerFeedFlags({})).toEqual(ON);
    expect(readMetaServerFeedFlags({ META_FBC_FALLBACK: "false", META_CAPI_SKIP_ENGAGEMENT: "0" })).toEqual(OFF);
    expect(readMetaServerFeedFlags({ META_FBC_FALLBACK: "maybe", META_CAPI_SKIP_ENGAGEMENT: "" })).toEqual(ON);
  });

  it("only scroll_depth and time_on_page are kept off the Conversions API", () => {
    expect(isRelayedToMetaCapi("scroll_depth", ON)).toBe(false);
    expect(isRelayedToMetaCapi("time_on_page", ON)).toBe(false);
    for (const name of ["page_viewed", "product_viewed", "product_added_to_cart", "checkout_started", "checkout_completed", "bundle_viewed", "my_custom_event"]) {
      expect(isRelayedToMetaCapi(name, ON)).toBe(true);
    }
    expect(isRelayedToMetaCapi("scroll_depth", OFF)).toBe(true);
  });
});

describe("applyFbcHints", () => {
  const hints = (e: EnrichedTrackingEvent, h: string) => new Map([[e.eventId, h]]);

  it("the _fbc cookie always wins over a hint", () => {
    const [e] = enrichEvents([ev()], ctx({ fbc: "fb.1.5.COOKIE" }));
    const [out] = applyFbcHints([e!], hints(e!, HINT), NOW);
    expect(out!.serverContext.fbc).toBe("fb.1.5.COOKIE");
  });

  it("no cookie + valid hint → relay copy gets fbc; input not mutated", () => {
    const [e] = enrichEvents([ev()], ctx());
    const snapshot = JSON.stringify(e);
    const [out] = applyFbcHints([e!], hints(e!, HINT), NOW);
    expect(out!.serverContext.fbc).toBe(HINT);
    expect(JSON.stringify(e)).toBe(snapshot);
    expect(out!.eventId).toBe(e!.eventId);
    expect(out!.eventName).toBe(e!.eventName);
  });

  it("malformed, future (> 5 min) or stale (> 90 d) hints are ignored", () => {
    const [e] = enrichEvents([ev()], ctx());
    for (const bad of [
      "garbage",
      "fb.1.123.X",
      buildFbcHint("X", NOW + FBC_HINT_MAX_FUTURE_MS + 1),
      buildFbcHint("X", NOW - FBC_MAX_AGE_MS - 1),
    ]) {
      const [out] = applyFbcHints([e!], hints(e!, bad), NOW);
      expect(out).toBe(e);
    }
  });

  it("events without a hint are returned as they came", () => {
    const events = enrichEvents([ev(), ev()], ctx());
    const out = applyFbcHints(events, new Map([[events[0]!.eventId, HINT]]), NOW);
    expect(out[0]!.serverContext.fbc).toBe(HINT);
    expect(out[1]).toBe(events[1]);
  });
});

describe("processTrackingBeacon — Meta relay copy", () => {
  let spy: { mockRestore(): void } | null = null;
  afterEach(() => {
    spy?.mockRestore();
    spy = null;
  });
  const capture = () => {
    const calls: EnrichedTrackingEvent[][] = [];
    spy = vi.spyOn(SERVER_ADAPTERS.meta!, "sendEvents").mockImplementation(async (events) => {
      calls.push(events as EnrichedTrackingEvent[]);
      return { platform: "meta" as never, success: true };
    });
    return calls;
  };

  it("engagement events are stored, not relayed, and get no Meta delivery row", async () => {
    const calls = capture();
    const fake = makePipelineFakeDb({ configs: [metaConfig] });
    const events = [
      ev({ eventId: "pv" }),
      ev({ eventId: "sd", eventName: "scroll_depth" }),
      ev({ eventId: "tp", eventName: "time_on_page" }),
      ev({ eventId: "atc", eventName: "product_added_to_cart" }),
    ];
    await processTrackingBeacon(events, ctx(), fake.db, { metaAdvancedMatching: false, metaServerFeed: ON });
    expect(fake.persisted.map((r) => r.eventId)).toEqual(["pv", "sd", "tp", "atc"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.map((e) => e.eventId)).toEqual(["pv", "atc"]);
    const idOf = (eventId: string) => fake.persisted.find((r) => r.eventId === eventId)!.id;
    expect(fake.deliveries.map((d) => d.trackingEventId).sort()).toEqual([idOf("pv"), idOf("atc")].sort());
  });

  it("a beacon of engagement events only makes no Meta call and logs no Meta row", async () => {
    const calls = capture();
    const fake = makePipelineFakeDb({ configs: [metaConfig] });
    await processTrackingBeacon([ev({ eventId: "sd2", eventName: "scroll_depth" })], ctx(), fake.db, {
      metaAdvancedMatching: false,
      metaServerFeed: ON,
    });
    expect(calls).toHaveLength(0);
    expect(fake.deliveries).toHaveLength(0);
    expect(fake.persisted).toHaveLength(1);
  });

  it("hint used only when the cookie is absent; persisted rows carry neither fbc nor the hint", async () => {
    const calls = capture();
    const fake = makePipelineFakeDb({ configs: [metaConfig] });
    const a = ev({ eventId: "a" });
    const b = ev({ eventId: "b", eventName: "product_added_to_cart" });
    await processTrackingBeacon([a, b], ctx(), fake.db, {
      metaAdvancedMatching: true,
      metaServerFeed: ON,
      fbcHints: new Map([["a", HINT], ["b", HINT]]),
      nowMs: NOW,
    });
    expect(calls[0]!.map((e) => e.serverContext.fbc)).toEqual([HINT, HINT]);
    // dedup ids and names unchanged
    expect(calls[0]!.map((e) => [e.eventId, e.eventName])).toEqual([["a", "page_viewed"], ["b", "product_added_to_cart"]]);
    for (const row of fake.persisted) {
      const data = row.eventData as { serverContext: ServerContext; fbcHint?: unknown };
      expect(data.serverContext.fbc).toBeUndefined();
      expect("fbcHint" in data).toBe(false);
      expect(JSON.stringify(row)).not.toContain("IwAR_click");
    }
  });

  it("request with an _fbc cookie: the cookie is relayed, the hint ignored", async () => {
    const calls = capture();
    const fake = makePipelineFakeDb({ configs: [metaConfig] });
    await processTrackingBeacon([ev({ eventId: "c" })], ctx({ fbc: "fb.1.1731000000000.COOKIE" }), fake.db, {
      metaAdvancedMatching: false,
      metaServerFeed: ON,
      fbcHints: new Map([["c", HINT]]),
      nowMs: NOW,
    });
    expect(calls[0]![0]!.serverContext.fbc).toBe("fb.1.1731000000000.COOKIE");
  });

  it("both flags off → exactly the previous relay: every event, no fbc, even with hints supplied", async () => {
    const callsOff = capture();
    const fakeOff = makePipelineFakeDb({ configs: [metaConfig] });
    const events = [ev({ eventId: "x" }), ev({ eventId: "y", eventName: "scroll_depth" })];
    await processTrackingBeacon(events, ctx(), fakeOff.db, {
      metaAdvancedMatching: false,
      metaServerFeed: OFF,
      fbcHints: new Map([["x", HINT]]),
      nowMs: NOW,
    });
    expect(callsOff[0]!.map((e) => e.eventId)).toEqual(["x", "y"]);
    expect(callsOff[0]!.every((e) => e.serverContext.fbc === undefined)).toBe(true);
    expect(fakeOff.deliveries).toHaveLength(2);
    // Same relay as a pipeline that knows nothing about hints.
    expect(callsOff[0]).toEqual(enrichEvents(events, ctx()));
  });
});
