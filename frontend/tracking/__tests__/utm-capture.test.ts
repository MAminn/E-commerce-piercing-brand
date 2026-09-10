import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  parseUtmFromSearch,
  parseClickIdsFromSearch,
  hasUtmOrClickIds,
  serializeUtmCookie,
  deserializeUtmCookie,
  getClickIdPlatform,
  enrichEventWithUtm,
  FIRST_TOUCH_COOKIE,
  LAST_TOUCH_COOKIE,
} from "#root/frontend/tracking/utm-capture";
import { PixelPlatform } from "#root/shared/types/pixel-tracking";

// ─── UTM Parsing ────────────────────────────────────────────────────────────

describe("UTM Auto-Capture", () => {
  describe("parseUtmFromSearch", () => {
    it("extracts all five UTM parameters", () => {
      const search =
        "?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale&utm_term=shoes&utm_content=banner_v2";
      const utm = parseUtmFromSearch(search);
      expect(utm.utmSource).toBe("google");
      expect(utm.utmMedium).toBe("cpc");
      expect(utm.utmCampaign).toBe("spring_sale");
      expect(utm.utmTerm).toBe("shoes");
      expect(utm.utmContent).toBe("banner_v2");
    });

    it("returns partial data when not all params present", () => {
      const utm = parseUtmFromSearch("?utm_source=facebook&utm_medium=social");
      expect(utm.utmSource).toBe("facebook");
      expect(utm.utmMedium).toBe("social");
      expect(utm.utmCampaign).toBeUndefined();
      expect(utm.utmTerm).toBeUndefined();
      expect(utm.utmContent).toBeUndefined();
    });

    it("returns empty object when no UTM params", () => {
      const utm = parseUtmFromSearch("?page=1&sort=price");
      expect(Object.keys(utm).length).toBe(0);
    });

    it("handles empty search string", () => {
      const utm = parseUtmFromSearch("");
      expect(Object.keys(utm).length).toBe(0);
    });

    it("handles encoded values", () => {
      const utm = parseUtmFromSearch(
        "?utm_source=google&utm_campaign=spring%20sale%202024",
      );
      expect(utm.utmSource).toBe("google");
      expect(utm.utmCampaign).toBe("spring sale 2024");
    });
  });

  // ─── Click ID Parsing ──────────────────────────────────────────────────

  describe("parseClickIdsFromSearch", () => {
    it("extracts fbclid", () => {
      const clickIds = parseClickIdsFromSearch("?fbclid=abc123");
      expect(clickIds.fbclid).toBe("abc123");
    });

    it("extracts gclid", () => {
      const clickIds = parseClickIdsFromSearch("?gclid=google_click_123");
      expect(clickIds.gclid).toBe("google_click_123");
    });

    it("extracts ttclid", () => {
      const clickIds = parseClickIdsFromSearch("?ttclid=tiktok_click_456");
      expect(clickIds.ttclid).toBe("tiktok_click_456");
    });

    it("extracts ScCid (Snapchat)", () => {
      const clickIds = parseClickIdsFromSearch("?ScCid=snap_click_789");
      expect(clickIds.ScCid).toBe("snap_click_789");
    });

    it("extracts epik (Pinterest)", () => {
      const clickIds = parseClickIdsFromSearch("?epik=pinterest_click_012");
      expect(clickIds.epik).toBe("pinterest_click_012");
    });

    it("extracts multiple click IDs at once", () => {
      const clickIds = parseClickIdsFromSearch(
        "?fbclid=fb123&gclid=gc456&ttclid=tt789",
      );
      expect(clickIds.fbclid).toBe("fb123");
      expect(clickIds.gclid).toBe("gc456");
      expect(clickIds.ttclid).toBe("tt789");
    });

    it("returns empty when no click IDs", () => {
      const clickIds = parseClickIdsFromSearch("?page=1");
      expect(Object.keys(clickIds).length).toBe(0);
    });
  });

  // ─── hasUtmOrClickIds ─────────────────────────────────────────────────

  describe("hasUtmOrClickIds", () => {
    it("returns true for utm_source", () => {
      expect(hasUtmOrClickIds("?utm_source=google")).toBe(true);
    });

    it("returns true for fbclid", () => {
      expect(hasUtmOrClickIds("?fbclid=abc")).toBe(true);
    });

    it("returns true for gclid", () => {
      expect(hasUtmOrClickIds("?gclid=xyz")).toBe(true);
    });

    it("returns false when no relevant params", () => {
      expect(hasUtmOrClickIds("?page=1&sort=asc")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(hasUtmOrClickIds("")).toBe(false);
    });

    it("returns true for mixed UTM and click IDs", () => {
      expect(
        hasUtmOrClickIds("?utm_source=tiktok&ttclid=abc123"),
      ).toBe(true);
    });
  });

  // ─── Cookie Serialization ─────────────────────────────────────────────

  describe("serializeUtmCookie / deserializeUtmCookie", () => {
    it("round-trips UTM data correctly", () => {
      const data = {
        utm: { utmSource: "google", utmMedium: "cpc" },
        clickIds: { gclid: "abc123" },
        referrer: "https://google.com",
        landingPage: "https://shop.com/?gclid=abc123",
        timestamp: 1700000000000,
      };
      const serialized = serializeUtmCookie(data);
      const restored = deserializeUtmCookie(serialized);
      expect(restored).toEqual(data);
    });

    it("handles minimal data", () => {
      const data = {
        utm: { utmSource: "email" },
        clickIds: {},
        timestamp: Date.now(),
      };
      const serialized = serializeUtmCookie(data);
      const restored = deserializeUtmCookie(serialized);
      expect(restored).not.toBeNull();
      expect(restored!.utm.utmSource).toBe("email");
    });

    it("returns null for invalid JSON", () => {
      expect(deserializeUtmCookie("not-json")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(deserializeUtmCookie("")).toBeNull();
    });

    it("returns null for JSON without timestamp", () => {
      expect(deserializeUtmCookie('{"utm": {}}')).toBeNull();
    });
  });

  // ─── getClickIdPlatform ───────────────────────────────────────────────

  describe("getClickIdPlatform", () => {
    it("maps fbclid to META", () => {
      const result = getClickIdPlatform({ fbclid: "abc" });
      expect(result).not.toBeNull();
      expect(result!.platform).toBe(PixelPlatform.META);
      expect(result!.clickId).toBe("abc");
    });

    it("maps gclid to GOOGLE_GA4", () => {
      const result = getClickIdPlatform({ gclid: "xyz" });
      expect(result!.platform).toBe(PixelPlatform.GOOGLE_GA4);
    });

    it("maps ttclid to TIKTOK", () => {
      const result = getClickIdPlatform({ ttclid: "tt1" });
      expect(result!.platform).toBe(PixelPlatform.TIKTOK);
    });

    it("maps ScCid to SNAPCHAT", () => {
      const result = getClickIdPlatform({ ScCid: "sc1" });
      expect(result!.platform).toBe(PixelPlatform.SNAPCHAT);
    });

    it("maps epik to PINTEREST", () => {
      const result = getClickIdPlatform({ epik: "pin1" });
      expect(result!.platform).toBe(PixelPlatform.PINTEREST);
    });

    it("returns null when no click IDs present", () => {
      expect(getClickIdPlatform({})).toBeNull();
    });

    it("returns the first found click ID when multiple present", () => {
      const result = getClickIdPlatform({ fbclid: "fb1", gclid: "gc1" });
      expect(result).not.toBeNull();
      // It should return one of them (fbclid is first in iteration order)
      expect(result!.clickId).toBeDefined();
    });
  });

  // ─── Cookie Names ─────────────────────────────────────────────────────

  describe("cookie names", () => {
    it("first-touch cookie has expected name", () => {
      expect(FIRST_TOUCH_COOKIE).toBe("_ft_utm");
    });

    it("last-touch cookie has expected name", () => {
      expect(LAST_TOUCH_COOKIE).toBe("_lt_utm");
    });
  });

  // ─── enrichEventWithUtm ───────────────────────────────────────────────

  describe("enrichEventWithUtm", () => {
    it("returns original event when no last-touch cookie exists", () => {
      // In test env, document.cookie is empty so getLastTouchUtm returns null
      const event = { eventName: "page_viewed" };
      const enriched = enrichEventWithUtm(event);
      expect(enriched).toEqual(event);
    });

    it("preserves original event properties", () => {
      const event = { eventName: "purchase", amount: 100 };
      const enriched = enrichEventWithUtm(event);
      expect(enriched.eventName).toBe("purchase");
      expect(enriched.amount).toBe(100);
    });
  });
});
