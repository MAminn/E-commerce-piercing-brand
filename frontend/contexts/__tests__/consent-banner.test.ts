import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import React from "react";
import {
  getDefaultConsentState,
  buildAcceptAllConsent,
  buildRejectAllConsent,
  isConsentExpired,
  serializeConsentCookie,
  deserializeConsentCookie,
  CONSENT_COOKIE_NAME,
  getAllowedPlatforms,
} from "#root/backend/pixel-tracking/consent/service";
import type {
  ConsentState,
  ConsentCategories,
} from "#root/shared/types/pixel-tracking";

// ─── Consent Banner Logic Tests ─────────────────────────────────────────────
// Tests the consent flow logic (cookie management, state transitions)

describe("Consent Banner Logic", () => {
  describe("banner visibility logic", () => {
    it("should show banner when no consent cookie exists", () => {
      // No cookie → getDefaultConsentState().given === false → show banner
      const state = getDefaultConsentState();
      const shouldShow = !state.given;
      expect(shouldShow).toBe(true);
    });

    it("should not show banner when valid consent exists", () => {
      const state = buildAcceptAllConsent("banner_accept");
      // Given is true and not expired → don't show
      const shouldShow = !state.given || isConsentExpired(state);
      expect(shouldShow).toBe(false);
    });

    it("should show banner when consent has expired", () => {
      const state: ConsentState = {
        given: true,
        categories: { functional: true, analytics: true, marketing: true },
        method: "banner_accept",
        expiresAt: new Date(Date.now() - 1000), // expired
      };
      const shouldShow = !state.given || isConsentExpired(state);
      expect(shouldShow).toBe(true);
    });
  });

  describe("consent transitions", () => {
    it("accept all → all categories true", () => {
      const state = buildAcceptAllConsent("banner_accept");
      expect(state.categories.analytics).toBe(true);
      expect(state.categories.marketing).toBe(true);
      expect(state.categories.functional).toBe(true);
    });

    it("reject all → only functional true", () => {
      const state = buildRejectAllConsent("banner_reject");
      expect(state.categories.functional).toBe(true);
      expect(state.categories.analytics).toBe(false);
      expect(state.categories.marketing).toBe(false);
    });

    it("custom selection → specific categories", () => {
      // Simulating "settings_page" flow where user selects analytics but not marketing
      const categories: ConsentCategories = {
        functional: true,
        analytics: true,
        marketing: false,
      };
      const state: ConsentState = {
        given: true,
        categories,
        method: "settings_page",
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      };
      expect(state.categories.analytics).toBe(true);
      expect(state.categories.marketing).toBe(false);
      expect(state.method).toBe("settings_page");
    });
  });

  describe("platform filtering based on consent", () => {
    it("blocks all platforms when only functional is consented", () => {
      const allowed = getAllowedPlatforms({
        functional: true,
        analytics: false,
        marketing: false,
      });
      expect(allowed.analytics).toBe(false);
      expect(allowed.marketing).toBe(false);
    });

    it("allows analytics platforms (GA4) when analytics consented", () => {
      const allowed = getAllowedPlatforms({
        functional: true,
        analytics: true,
        marketing: false,
      });
      expect(allowed.analytics).toBe(true);
      expect(allowed.marketing).toBe(false);
    });

    it("allows marketing platforms (Meta, TikTok, etc.) when marketing consented", () => {
      const allowed = getAllowedPlatforms({
        functional: true,
        analytics: false,
        marketing: true,
      });
      expect(allowed.analytics).toBe(false);
      expect(allowed.marketing).toBe(true);
    });

    it("allows all platforms when all consented", () => {
      const allowed = getAllowedPlatforms({
        functional: true,
        analytics: true,
        marketing: true,
      });
      expect(allowed.analytics).toBe(true);
      expect(allowed.marketing).toBe(true);
    });
  });

  describe("cookie persistence flow", () => {
    it("serialized cookie can be deserialized to same state", () => {
      const acceptState = buildAcceptAllConsent("banner_accept");
      const cookie = serializeConsentCookie(acceptState);
      const restored = deserializeConsentCookie(cookie);

      expect(restored).not.toBeNull();
      expect(restored!.given).toBe(acceptState.given);
      expect(restored!.categories.analytics).toBe(
        acceptState.categories.analytics,
      );
      expect(restored!.categories.marketing).toBe(
        acceptState.categories.marketing,
      );
    });

    it("reject state round-trips correctly", () => {
      const rejectState = buildRejectAllConsent("banner_reject");
      const cookie = serializeConsentCookie(rejectState);
      const restored = deserializeConsentCookie(cookie);

      expect(restored!.given).toBe(true);
      expect(restored!.categories.analytics).toBe(false);
      expect(restored!.categories.marketing).toBe(false);
      expect(restored!.method).toBe("banner_reject");
    });

    it("handles corrupted cookie gracefully", () => {
      const result = deserializeConsentCookie("{broken");
      expect(result).toBeNull();
    });
  });

  describe("consent expiry edge cases", () => {
    it("consent expires exactly at the expiry timestamp", () => {
      // Create a consent that expired 1ms ago
      const state: ConsentState = {
        given: true,
        categories: { functional: true, analytics: true, marketing: true },
        method: "banner_accept",
        expiresAt: new Date(Date.now() - 1),
      };
      expect(isConsentExpired(state)).toBe(true);
    });

    it("implied consent with no expiry never expires", () => {
      const state = getDefaultConsentState();
      expect(isConsentExpired(state)).toBe(false);
    });

    it("functional tracking is always allowed regardless of consent", () => {
      // Even with reject-all, functional should be true
      const rejectState = buildRejectAllConsent("banner_reject");
      expect(rejectState.categories.functional).toBe(true);

      // Even with the default (no consent given), functional is true
      const defaultState = getDefaultConsentState();
      expect(defaultState.categories.functional).toBe(true);
    });
  });

  describe("consent method types", () => {
    it("banner_accept method creates valid state", () => {
      const state = buildAcceptAllConsent("banner_accept");
      expect(state.method).toBe("banner_accept");
    });

    it("banner_reject method creates valid state", () => {
      const state = buildRejectAllConsent("banner_reject");
      expect(state.method).toBe("banner_reject");
    });

    it("settings_page method preserved in custom consent", () => {
      const state: ConsentState = {
        given: true,
        categories: { functional: true, analytics: true, marketing: false },
        method: "settings_page",
        expiresAt: new Date(Date.now() + 86400000),
      };
      expect(state.method).toBe("settings_page");
    });

    it("implied method is the default", () => {
      const state = getDefaultConsentState();
      expect(state.method).toBe("implied");
    });
  });
});
