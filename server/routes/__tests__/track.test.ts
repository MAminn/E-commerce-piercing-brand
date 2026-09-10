import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extractServerContext,
  hashIp,
  isRateLimited,
  beaconBodySchema,
  type ServerContext,
} from "#root/server/routes/track";

describe("Beacon endpoint — server/routes/track.ts", () => {
  describe("beaconBodySchema", () => {
    it("validates a correct payload with one event", () => {
      const result = beaconBodySchema.safeParse({
        events: [
          {
            eventId: "abc-123",
            eventName: "page_viewed",
            timestamp: Date.now(),
            pageUrl: "https://shop.test/",
            sessionId: "sess-1",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("validates a payload with ecommerce data", () => {
      const result = beaconBodySchema.safeParse({
        events: [
          {
            eventId: "abc-456",
            eventName: "checkout_completed",
            timestamp: Date.now(),
            pageUrl: "https://shop.test/checkout",
            sessionId: "sess-1",
            ecommerce: {
              currency: "USD",
              value: 99.99,
              items: [
                {
                  itemId: "SKU-001",
                  itemName: "Blue Widget",
                  price: 99.99,
                  quantity: 1,
                },
              ],
              transactionId: "T-001",
            },
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects payload without events array", () => {
      const result = beaconBodySchema.safeParse({ foo: "bar" });
      expect(result.success).toBe(false);
    });

    it("rejects events missing required fields", () => {
      const result = beaconBodySchema.safeParse({
        events: [{ eventName: "page_viewed" }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts an empty events array", () => {
      const result = beaconBodySchema.safeParse({ events: [] });
      expect(result.success).toBe(true);
    });
  });

  describe("hashIp", () => {
    it("returns a consistent 16-char hex string", () => {
      const hash1 = hashIp("127.0.0.1");
      const hash2 = hashIp("127.0.0.1");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
      expect(/^[0-9a-f]+$/.test(hash1)).toBe(true);
    });

    it("produces different hashes for different IPs", () => {
      expect(hashIp("127.0.0.1")).not.toBe(hashIp("192.168.1.1"));
    });
  });

  describe("extractServerContext", () => {
    it("extracts user agent from headers", () => {
      const ctx = extractServerContext({
        ip: "10.0.0.1",
        headers: { "user-agent": "TestBot/1.0" },
      });
      expect(ctx.userAgent).toBe("TestBot/1.0");
      expect(ctx.ip).toBe("10.0.0.1");
      expect(ctx.ipHash).toHaveLength(16);
    });

    it("extracts Meta cookies (_fbp, _fbc)", () => {
      const ctx = extractServerContext({
        ip: "10.0.0.1",
        headers: {},
        cookies: {
          _fbp: "fb.1.1234567890.987654321",
          _fbc: "fb.1.1234567890.AbCdEf",
        },
      });
      expect(ctx.fbp).toBe("fb.1.1234567890.987654321");
      expect(ctx.fbc).toBe("fb.1.1234567890.AbCdEf");
    });

    it("extracts gclid from cookies", () => {
      const ctx = extractServerContext({
        ip: "10.0.0.1",
        headers: {},
        cookies: { gclid: "CjwKCAjw" },
      });
      expect(ctx.gclid).toBe("CjwKCAjw");
    });

    it("extracts gclid from query params when no cookie", () => {
      const ctx = extractServerContext({
        ip: "10.0.0.1",
        headers: {},
        query: { gclid: "query-gclid" },
      });
      expect(ctx.gclid).toBe("query-gclid");
    });

    it("extracts referrer from headers", () => {
      const ctx = extractServerContext({
        ip: "10.0.0.1",
        headers: { referer: "https://google.com" },
      });
      expect(ctx.referrer).toBe("https://google.com");
    });

    it("defaults to empty string for missing user-agent", () => {
      const ctx = extractServerContext({
        ip: "10.0.0.1",
        headers: {},
      });
      expect(ctx.userAgent).toBe("");
    });
  });

  describe("isRateLimited", () => {
    // Note: rate limiter uses module-level state.
    // Use unique IPs per test to avoid pollution.

    it("allows requests under the limit", () => {
      const ip = "rate-test-allow-" + Date.now();
      expect(isRateLimited(ip)).toBe(false);
      expect(isRateLimited(ip)).toBe(false);
    });

    it("blocks after exceeding 100 requests from the same IP", () => {
      const ip = "rate-test-block-" + Date.now();
      for (let i = 0; i < 100; i++) {
        isRateLimited(ip);
      }
      // 101st call should be blocked
      expect(isRateLimited(ip)).toBe(true);
    });

    it("allows traffic from different IPs independently", () => {
      const ipA = "rate-a-" + Date.now();
      const ipB = "rate-b-" + Date.now();
      for (let i = 0; i < 100; i++) {
        isRateLimited(ipA);
      }
      // ipA is now at limit, ipB should still be fine
      expect(isRateLimited(ipA)).toBe(true);
      expect(isRateLimited(ipB)).toBe(false);
    });
  });
});
