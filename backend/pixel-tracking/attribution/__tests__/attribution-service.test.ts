import { describe, it, expect } from "vitest";
import {
  detectChannel,
  firstTouchAttribution,
  lastTouchAttribution,
  linearAttribution,
  calculateAttribution,
  createTouchpointSchema,
} from "#root/backend/pixel-tracking/attribution/service";
import type { AttributionTouchpointData } from "#root/shared/types/pixel-tracking";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTouchpoint(
  overrides?: Partial<AttributionTouchpointData>,
): AttributionTouchpointData {
  return {
    id: "tp-1",
    sessionId: "sess-1",
    userId: null,
    channel: "direct",
    source: null,
    medium: null,
    campaign: null,
    term: null,
    content: null,
    landingPage: null,
    referrer: null,
    clickId: null,
    clickIdType: null,
    createdAt: new Date("2024-01-01T10:00:00Z"),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Attribution Service", () => {
  // ── Channel Detection ─────────────────────────────────────────────────

  describe("detectChannel", () => {
    it("should detect paid_meta from fbclid", () => {
      expect(detectChannel({ clickIdType: "fbclid" })).toBe("paid_meta");
    });

    it("should detect paid_google from gclid", () => {
      expect(detectChannel({ clickIdType: "gclid" })).toBe("paid_google");
    });

    it("should detect paid_tiktok from ttclid", () => {
      expect(detectChannel({ clickIdType: "ttclid" })).toBe("paid_tiktok");
    });

    it("should detect paid_snapchat from ScCid", () => {
      expect(detectChannel({ clickIdType: "ScCid" })).toBe("paid_snapchat");
    });

    it("should detect paid_pinterest from epik", () => {
      expect(detectChannel({ clickIdType: "epik" })).toBe("paid_pinterest");
    });

    it("should detect paid_meta from facebook + cpc", () => {
      expect(
        detectChannel({ source: "facebook", medium: "cpc" }),
      ).toBe("paid_meta");
    });

    it("should detect paid_google from google + ppc", () => {
      expect(
        detectChannel({ source: "google", medium: "ppc" }),
      ).toBe("paid_google");
    });

    it("should detect email from email medium", () => {
      expect(detectChannel({ medium: "email" })).toBe("email");
    });

    it("should detect email from email source", () => {
      expect(detectChannel({ source: "email" })).toBe("email");
    });

    it("should detect social from social medium", () => {
      expect(detectChannel({ medium: "social" })).toBe("social");
    });

    it("should detect social from facebook.com referrer", () => {
      expect(
        detectChannel({ referrer: "https://facebook.com/post/123" }),
      ).toBe("social");
    });

    it("should detect social from tiktok.com referrer", () => {
      expect(
        detectChannel({ referrer: "https://tiktok.com/@user/video/123" }),
      ).toBe("social");
    });

    it("should detect organic from google referrer", () => {
      expect(
        detectChannel({ referrer: "https://www.google.com/search?q=test" }),
      ).toBe("organic");
    });

    it("should detect organic from organic medium", () => {
      expect(detectChannel({ medium: "organic" })).toBe("organic");
    });

    it("should detect referral from unknown referrer", () => {
      expect(
        detectChannel({ referrer: "https://blog.example.com/article" }),
      ).toBe("referral");
    });

    it("should default to direct with no params", () => {
      expect(detectChannel({})).toBe("direct");
    });
  });

  // ── First-Touch Attribution ───────────────────────────────────────────

  describe("firstTouchAttribution", () => {
    it("should return empty array for no touchpoints", () => {
      expect(firstTouchAttribution([])).toEqual([]);
    });

    it("should give 100% credit to the first touchpoint", () => {
      const touchpoints = [
        makeTouchpoint({
          id: "tp-1",
          channel: "paid_meta",
          createdAt: new Date("2024-01-01T10:00:00Z"),
        }),
        makeTouchpoint({
          id: "tp-2",
          channel: "organic",
          createdAt: new Date("2024-01-02T10:00:00Z"),
        }),
        makeTouchpoint({
          id: "tp-3",
          channel: "direct",
          createdAt: new Date("2024-01-03T10:00:00Z"),
        }),
      ];

      const result = firstTouchAttribution(touchpoints);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        channel: "paid_meta",
        credit: 1,
        touchpointId: "tp-1",
      });
    });

    it("should handle single touchpoint", () => {
      const result = firstTouchAttribution([
        makeTouchpoint({ id: "tp-only", channel: "email" }),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]!.credit).toBe(1);
      expect(result[0]!.channel).toBe("email");
    });
  });

  // ── Last-Touch Attribution ────────────────────────────────────────────

  describe("lastTouchAttribution", () => {
    it("should return empty array for no touchpoints", () => {
      expect(lastTouchAttribution([])).toEqual([]);
    });

    it("should give 100% credit to the last touchpoint", () => {
      const touchpoints = [
        makeTouchpoint({
          id: "tp-1",
          channel: "paid_meta",
          createdAt: new Date("2024-01-01T10:00:00Z"),
        }),
        makeTouchpoint({
          id: "tp-2",
          channel: "organic",
          createdAt: new Date("2024-01-02T10:00:00Z"),
        }),
        makeTouchpoint({
          id: "tp-3",
          channel: "direct",
          createdAt: new Date("2024-01-03T10:00:00Z"),
        }),
      ];

      const result = lastTouchAttribution(touchpoints);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        channel: "direct",
        credit: 1,
        touchpointId: "tp-3",
      });
    });
  });

  // ── Linear Attribution ────────────────────────────────────────────────

  describe("linearAttribution", () => {
    it("should return empty array for no touchpoints", () => {
      expect(linearAttribution([])).toEqual([]);
    });

    it("should split credit equally across all touchpoints", () => {
      const touchpoints = [
        makeTouchpoint({ id: "tp-1", channel: "paid_meta" }),
        makeTouchpoint({ id: "tp-2", channel: "organic" }),
        makeTouchpoint({ id: "tp-3", channel: "direct" }),
      ];

      const result = linearAttribution(touchpoints);
      expect(result).toHaveLength(3);

      for (const r of result) {
        expect(r.credit).toBeCloseTo(1 / 3, 10);
      }
    });

    it("should give 100% to single touchpoint", () => {
      const result = linearAttribution([
        makeTouchpoint({ id: "tp-only", channel: "email" }),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]!.credit).toBe(1);
    });

    it("should sum credits to 1.0", () => {
      const touchpoints = [
        makeTouchpoint({ id: "tp-1", channel: "paid_meta" }),
        makeTouchpoint({ id: "tp-2", channel: "organic" }),
        makeTouchpoint({ id: "tp-3", channel: "direct" }),
        makeTouchpoint({ id: "tp-4", channel: "email" }),
      ];

      const result = linearAttribution(touchpoints);
      const totalCredit = result.reduce((sum, r) => sum + r.credit, 0);
      expect(totalCredit).toBeCloseTo(1, 10);
    });
  });

  // ── calculateAttribution dispatcher ───────────────────────────────────

  describe("calculateAttribution", () => {
    const touchpoints = [
      makeTouchpoint({
        id: "tp-1",
        channel: "paid_meta",
        createdAt: new Date("2024-01-01"),
      }),
      makeTouchpoint({
        id: "tp-2",
        channel: "direct",
        createdAt: new Date("2024-01-02"),
      }),
    ];

    it("should dispatch to first_touch model", () => {
      const result = calculateAttribution(touchpoints, "first_touch");
      expect(result).toHaveLength(1);
      expect(result[0]!.channel).toBe("paid_meta");
    });

    it("should dispatch to last_touch model", () => {
      const result = calculateAttribution(touchpoints, "last_touch");
      expect(result).toHaveLength(1);
      expect(result[0]!.channel).toBe("direct");
    });

    it("should dispatch to linear model", () => {
      const result = calculateAttribution(touchpoints, "linear");
      expect(result).toHaveLength(2);
      for (const r of result) {
        expect(r.credit).toBe(0.5);
      }
    });
  });

  // ── Schema Validation ─────────────────────────────────────────────────

  describe("createTouchpointSchema", () => {
    it("should accept valid input", () => {
      const result = createTouchpointSchema.safeParse({
        sessionId: "sess-123",
        channel: "paid_meta",
        source: "facebook",
        medium: "cpc",
        campaign: "spring_sale",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid channel", () => {
      const result = createTouchpointSchema.safeParse({
        sessionId: "sess-123",
        channel: "invalid_channel",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty sessionId", () => {
      const result = createTouchpointSchema.safeParse({
        sessionId: "",
        channel: "direct",
      });
      expect(result.success).toBe(false);
    });

    it("should accept all valid channels", () => {
      const channels = [
        "organic",
        "paid_meta",
        "paid_google",
        "paid_tiktok",
        "paid_snapchat",
        "paid_pinterest",
        "direct",
        "email",
        "referral",
        "social",
      ];
      for (const channel of channels) {
        const result = createTouchpointSchema.safeParse({
          sessionId: "sess-1",
          channel,
        });
        expect(result.success).toBe(true);
      }
    });
  });
});
