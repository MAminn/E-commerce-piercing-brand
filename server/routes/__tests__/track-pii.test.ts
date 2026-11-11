import { describe, expect, it, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const processTrackingBeacon = vi.fn(async () => {});
vi.mock("#root/backend/pixel-tracking/delivery-pipeline", () => ({
  processTrackingBeacon: (...args: unknown[]) => processTrackingBeacon(...(args as [])),
}));

import { trackBeaconPlugin, sanitizeBeaconEvents } from "#root/server/routes/track";

const ORDER = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f";

const event = (pageUrl: string, referrer?: string) => ({
  eventId: "e1",
  eventName: "checkout_completed",
  timestamp: Date.now(),
  pageUrl,
  referrer,
  sessionId: "s1",
});

describe("/api/track strips PII from client URLs before persisting or relaying", () => {
  beforeEach(() => processTrackingBeacon.mockClear());

  it("sanitizeBeaconEvents removes email from pageUrl and referrer", () => {
    const [out] = sanitizeBeaconEvents([
      event(
        `https://shop.test/order-confirmation?id=${ORDER}&email=a%40b.test`,
        "https://shop.test/x?email=a%40b.test&utm_source=meta",
      ),
    ]);
    expect(out?.pageUrl).toBe(`https://shop.test/order-confirmation?id=${ORDER}`);
    expect(out?.referrer).toBe("https://shop.test/x?utm_source=meta");
  });

  it("the route hands the pipeline sanitised events (an old cached bundle cannot leak the email)", async () => {
    const app = Fastify();
    await app.register(trackBeaconPlugin, { prefix: "/api/track" });
    const res = await app.inject({
      method: "POST",
      url: "/api/track",
      headers: { referer: "https://shop.test/checkout?email=a%40b.test" },
      payload: { events: [event(`https://shop.test/order-confirmation?id=${ORDER}&total=1&email=a%40b.test`)] },
    });
    expect(res.statusCode).toBe(204);
    expect(processTrackingBeacon).toHaveBeenCalledTimes(1);
    const [events, ctx] = processTrackingBeacon.mock.calls[0] as unknown as [
      Array<{ pageUrl: string }>,
      { referrer?: string },
    ];
    expect(events[0]?.pageUrl).toBe(`https://shop.test/order-confirmation?id=${ORDER}&total=1`);
    expect(ctx.referrer).toBe("https://shop.test/checkout");
    await app.close();
  });
});
