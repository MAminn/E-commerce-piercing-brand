import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";

const processTrackingBeacon = vi.fn(async () => {});
vi.mock("#root/backend/pixel-tracking/delivery-pipeline", () => ({
  processTrackingBeacon: (...args: unknown[]) => processTrackingBeacon(...(args as [])),
}));

import { trackBeaconPlugin } from "#root/server/routes/track";

const ev = (id: string, pageUrl: string) => ({
  eventId: id,
  eventName: "page_viewed",
  timestamp: Date.now(),
  pageUrl,
  sessionId: "s1",
});

async function post(events: unknown[], role?: string) {
  const app = Fastify();
  if (role) {
    // Stands in for the auth middleware's clientSession.
    app.addHook("onRequest", async (req) => {
      (req as unknown as { clientSession: unknown }).clientSession = { role };
    });
  }
  await app.register(trackBeaconPlugin, { prefix: "/api/track" });
  const res = await app.inject({ method: "POST", url: "/api/track", payload: { events } });
  await app.close();
  return res;
}

const relayedIds = () =>
  (processTrackingBeacon.mock.calls.flatMap((c) => (c as unknown as [Array<{ eventId: string }>])[0]) ?? []).map(
    (e) => e.eventId,
  );

describe("/api/track — TRACKING_EXCLUDE_INTERNAL (route-based)", () => {
  const prev = process.env.TRACKING_EXCLUDE_INTERNAL;
  beforeEach(() => processTrackingBeacon.mockClear());
  afterEach(() => {
    if (prev === undefined) Reflect.deleteProperty(process.env, "TRACKING_EXCLUDE_INTERNAL");
    else process.env.TRACKING_EXCLUDE_INTERNAL = prev;
  });

  it("flag OFF (default): dashboard events still flow exactly as before", async () => {
    Reflect.deleteProperty(process.env, "TRACKING_EXCLUDE_INTERNAL");
    await post([ev("a", "https://shop.test/dashboard/orders"), ev("b", "https://shop.test/shop")]);
    expect(relayedIds()).toEqual(["a", "b"]);
  });

  it("flag ON: /dashboard* events are dropped, storefront events kept", async () => {
    process.env.TRACKING_EXCLUDE_INTERNAL = "true";
    await post([
      ev("a", "https://shop.test/dashboard/admin/pixels"),
      ev("b", "https://shop.test/shop"),
      ev("c", "https://shop.test/dashboard"),
    ]);
    expect(relayedIds()).toEqual(["b"]);
  });

  it("flag ON: an admin session on a storefront page is NOT filtered (staff may place real orders)", async () => {
    process.env.TRACKING_EXCLUDE_INTERNAL = "true";
    await post(
      [ev("buy", "https://shop.test/order-confirmation?id=1"), ev("dash", "https://shop.test/dashboard/orders")],
      "admin",
    );
    expect(relayedIds()).toEqual(["buy"]);
  });

  it("flag ON: a beacon with only dashboard events reaches no pipeline call with events", async () => {
    process.env.TRACKING_EXCLUDE_INTERNAL = "true";
    const res = await post([ev("a", "https://shop.test/dashboard/orders")]);
    expect(res.statusCode).toBe(204);
    expect(relayedIds()).toEqual([]);
  });
});
