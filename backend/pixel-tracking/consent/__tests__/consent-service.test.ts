import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDefaultConsentState,
  buildAcceptAllConsent,
  buildRejectAllConsent,
  isConsentExpired,
  getAllowedPlatforms,
  serializeConsentCookie,
  deserializeConsentCookie,
  CONSENT_COOKIE_NAME,
} from "#root/backend/pixel-tracking/consent/service";
import type {
  ConsentState,
  ConsentCategories,
} from "#root/shared/types/pixel-tracking";

// ─── Default Consent State ──────────────────────────────────────────────────

describe("Consent Service", () => {
  describe("getDefaultConsentState", () => {
    it("returns functional=true, analytics=false, marketing=false", () => {
      const state = getDefaultConsentState();
      expect(state.given).toBe(false);
      expect(state.categories.functional).toBe(true);
      expect(state.categories.analytics).toBe(false);
      expect(state.categories.marketing).toBe(false);
      expect(state.method).toBe("implied");
      expect(state.expiresAt).toBeNull();
    });
  });

  // ─── buildAcceptAllConsent ──────────────────────────────────────────────

  describe("buildAcceptAllConsent", () => {
    it("sets all categories to true", () => {
      const state = buildAcceptAllConsent("banner_accept");
      expect(state.given).toBe(true);
      expect(state.categories.functional).toBe(true);
      expect(state.categories.analytics).toBe(true);
      expect(state.categories.marketing).toBe(true);
      expect(state.method).toBe("banner_accept");
    });

    it("sets an expiry date in the future", () => {
      const state = buildAcceptAllConsent("banner_accept");
      expect(state.expiresAt).toBeDefined();
      expect(state.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it("uses the provided method", () => {
      const state = buildAcceptAllConsent("settings_page");
      expect(state.method).toBe("settings_page");
    });
  });

  // ─── buildRejectAllConsent ─────────────────────────────────────────────

  describe("buildRejectAllConsent", () => {
    it("sets functional=true but analytics and marketing=false", () => {
      const state = buildRejectAllConsent("banner_reject");
      expect(state.given).toBe(true); // User made a choice
      expect(state.categories.functional).toBe(true);
      expect(state.categories.analytics).toBe(false);
      expect(state.categories.marketing).toBe(false);
      expect(state.method).toBe("banner_reject");
    });

    it("sets an expiry date in the future", () => {
      const state = buildRejectAllConsent("banner_reject");
      expect(state.expiresAt).toBeDefined();
      expect(state.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  // ─── isConsentExpired ──────────────────────────────────────────────────

  describe("isConsentExpired", () => {
    it("returns false when no expiresAt is set", () => {
      const state: ConsentState = {
        given: false,
        categories: { functional: true, analytics: false, marketing: false },
        method: "implied",
        expiresAt: null,
      };
      expect(isConsentExpired(state)).toBe(false);
    });

    it("returns false when expiresAt is in the future", () => {
      const state: ConsentState = {
        given: true,
        categories: { functional: true, analytics: true, marketing: true },
        method: "banner_accept",
        expiresAt: new Date(Date.now() + 86400000), // +1 day
      };
      expect(isConsentExpired(state)).toBe(false);
    });

    it("returns true when expiresAt is in the past", () => {
      const state: ConsentState = {
        given: true,
        categories: { functional: true, analytics: true, marketing: true },
        method: "banner_accept",
        expiresAt: new Date(Date.now() - 86400000), // -1 day
      };
      expect(isConsentExpired(state)).toBe(true);
    });
  });

  // ─── getAllowedPlatforms ───────────────────────────────────────────────

  describe("getAllowedPlatforms", () => {
    it("returns both false when consent is default", () => {
      const categories: ConsentCategories = {
        functional: true,
        analytics: false,
        marketing: false,
      };
      const allowed = getAllowedPlatforms(categories);
      expect(allowed.analytics).toBe(false);
      expect(allowed.marketing).toBe(false);
    });

    it("returns analytics=true when analytics is consented", () => {
      const allowed = getAllowedPlatforms({
        functional: true,
        analytics: true,
        marketing: false,
      });
      expect(allowed.analytics).toBe(true);
      expect(allowed.marketing).toBe(false);
    });

    it("returns marketing=true when marketing is consented", () => {
      const allowed = getAllowedPlatforms({
        functional: true,
        analytics: false,
        marketing: true,
      });
      expect(allowed.analytics).toBe(false);
      expect(allowed.marketing).toBe(true);
    });

    it("returns both true when all consented", () => {
      const allowed = getAllowedPlatforms({
        functional: true,
        analytics: true,
        marketing: true,
      });
      expect(allowed.analytics).toBe(true);
      expect(allowed.marketing).toBe(true);
    });
  });

  // ─── Cookie Serialization ─────────────────────────────────────────────

  describe("serializeConsentCookie", () => {
    it("serializes accept-all consent to compact JSON", () => {
      const state = buildAcceptAllConsent("banner_accept");
      const cookie = serializeConsentCookie(state);
      const parsed = JSON.parse(cookie);
      expect(parsed.g).toBe(1);
      expect(parsed.a).toBe(1);
      expect(parsed.m).toBe(1);
      expect(parsed.mt).toBe("banner_accept");
      expect(parsed.ex).toBeGreaterThan(0);
    });

    it("serializes reject-all consent correctly", () => {
      const state = buildRejectAllConsent("banner_reject");
      const cookie = serializeConsentCookie(state);
      const parsed = JSON.parse(cookie);
      expect(parsed.g).toBe(1); // given is true (user made a choice)
      expect(parsed.a).toBe(0);
      expect(parsed.m).toBe(0);
      expect(parsed.mt).toBe("banner_reject");
    });

    it("serializes null expiresAt as null", () => {
      const state = getDefaultConsentState();
      const cookie = serializeConsentCookie(state);
      const parsed = JSON.parse(cookie);
      expect(parsed.ex).toBeNull();
    });
  });

  describe("deserializeConsentCookie", () => {
    it("round-trips accept-all correctly", () => {
      const original = buildAcceptAllConsent("banner_accept");
      const cookie = serializeConsentCookie(original);
      const restored = deserializeConsentCookie(cookie);
      expect(restored).not.toBeNull();
      expect(restored!.given).toBe(true);
      expect(restored!.categories.functional).toBe(true);
      expect(restored!.categories.analytics).toBe(true);
      expect(restored!.categories.marketing).toBe(true);
      expect(restored!.method).toBe("banner_accept");
    });

    it("round-trips reject-all correctly", () => {
      const original = buildRejectAllConsent("banner_reject");
      const cookie = serializeConsentCookie(original);
      const restored = deserializeConsentCookie(cookie);
      expect(restored).not.toBeNull();
      expect(restored!.given).toBe(true);
      expect(restored!.categories.analytics).toBe(false);
      expect(restored!.categories.marketing).toBe(false);
    });

    it("round-trips custom categories correctly", () => {
      const state: ConsentState = {
        given: true,
        categories: { functional: true, analytics: true, marketing: false },
        method: "settings_page",
        expiresAt: new Date(Date.now() + 86400000),
      };
      const cookie = serializeConsentCookie(state);
      const restored = deserializeConsentCookie(cookie);
      expect(restored!.categories.analytics).toBe(true);
      expect(restored!.categories.marketing).toBe(false);
      expect(restored!.method).toBe("settings_page");
    });

    it("returns null for invalid JSON", () => {
      expect(deserializeConsentCookie("not-json")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(deserializeConsentCookie("")).toBeNull();
    });

    it("handles missing method gracefully", () => {
      const cookie = JSON.stringify({ g: 1, a: 1, m: 0, ex: null });
      const restored = deserializeConsentCookie(cookie);
      expect(restored).not.toBeNull();
      expect(restored!.method).toBe("implied");
    });
  });

  // ─── CONSENT_COOKIE_NAME ──────────────────────────────────────────────

  describe("CONSENT_COOKIE_NAME", () => {
    it("is a non-empty string", () => {
      expect(CONSENT_COOKIE_NAME).toBe("_tracking_consent");
    });
  });
});
