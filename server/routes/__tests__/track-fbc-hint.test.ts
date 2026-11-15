import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";

const processTrackingBeacon = vi.fn(async () => {});
vi.mock("#root/backend/pixel-tracking/delivery-pipeline", () => ({
  processTrackingBeacon: (...args: unknown[]) => processTrackingBeacon(...(args as [])),
}));

import { trackBeaconPlugin } from "#root/server/routes/track";

/**
 * META_FBC_FALLBACK at the route: the browser's `fbcHint` is taken off every
 * event before the pipeline runs (so it can never be persisted), and handed
 * over by event id only while the flag is on. A malformed hint never fails
 * the beacon.
 */
const HINT = "fb.1.1731600000000.IwAR_click-1";
const ev = (id: string, extra: Record<string, unknown> = {}) => ({
  eventId: id,
  eventName: "page_viewed",
  timestamp: Date.now(),
  pageUrl: "https://shop.test/shop",
  sessionId: "s1",
  ...extra,
});

async function post(events: unknown[]) {
  const app = Fastify();
  await app.register(trackBeaconPlugin, { prefix: "/api/track" });
  const res = await app.inject({ method: "POST", url: "/api/track", payload: { events } });
  await app.close();
  return res;
}

type Call = [Array<Record<string, unknown>>, unknown, unknown, { fbcHints?: Map<string, string> }];
const lastCall = () => processTrackingBeacon.mock.calls.at(-1) as unknown as Call;

describe("/api/track — fbcHint (META_FBC_FALLBACK)", () => {
  const prev = process.env.META_FBC_FALLBACK;
  beforeEach(() => processTrackingBeacon.mockClear());
  afterEach(() => {
    if (prev === undefined) Reflect.deleteProperty(process.env, "META_FBC_FALLBACK");
    else process.env.META_FBC_FALLBACK = prev;
  });

  it("flag unset (default on): hint removed from every event, passed by event id", async () => {
    Reflect.deleteProperty(process.env, "META_FBC_FALLBACK");
    const res = await post([ev("a", { fbcHint: HINT }), ev("b")]);
    expect(res.statusCode).toBe(204);
    const [events, , , options] = lastCall();
    expect(events.map((e) => e.eventId)).toEqual(["a", "b"]);
    expect(events.every((e) => !("fbcHint" in e))).toBe(true);
    expect([...(options.fbcHints ?? new Map())]).toEqual([["a", HINT]]);
  });

  it("flag off: hint still removed, nothing passed (previous behaviour)", async () => {
    process.env.META_FBC_FALLBACK = "false";
    await post([ev("a", { fbcHint: HINT })]);
    const [events, , , options] = lastCall();
    expect(events.every((e) => !("fbcHint" in e))).toBe(true);
    expect(options.fbcHints?.size ?? 0).toBe(0);
  });

  it("a malformed hint (wrong type, oversized) never fails the beacon and is dropped", async () => {
    Reflect.deleteProperty(process.env, "META_FBC_FALLBACK");
    const res = await post([ev("num", { fbcHint: 42 }), ev("obj", { fbcHint: { x: 1 } }), ev("big", { fbcHint: `fb.1.1731600000000.${"a".repeat(600)}` })]);
    expect(res.statusCode).toBe(204);
    const [events, , , options] = lastCall();
    expect(events.map((e) => e.eventId)).toEqual(["num", "obj", "big"]);
    expect(options.fbcHints?.size ?? 0).toBe(0);
  });
});
