import { describe, it, expect } from "vitest";
import {
  createCustomEventSchema,
  updateCustomEventSchema,
} from "#root/backend/pixel-tracking/custom-events/service";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Custom Events Service — Schema Validation", () => {
  // ── createCustomEventSchema ─────────────────────────────────────────────

  describe("createCustomEventSchema", () => {
    it("should accept a valid manual event", () => {
      const result = createCustomEventSchema.safeParse({
        name: "loyalty_signup",
        displayName: "Loyalty Signup",
        triggerType: "manual",
      });
      expect(result.success).toBe(true);
    });

    it("should accept a valid css_selector event", () => {
      const result = createCustomEventSchema.safeParse({
        name: "size_guide_click",
        displayName: "Size Guide Clicked",
        triggerType: "css_selector",
        triggerConfig: { selector: ".size-guide-btn" },
      });
      expect(result.success).toBe(true);
    });

    it("should accept a valid url_match event", () => {
      const result = createCustomEventSchema.safeParse({
        name: "promo_page_viewed",
        displayName: "Promo Page Viewed",
        triggerType: "url_match",
        triggerConfig: { pattern: "\\/promo" },
      });
      expect(result.success).toBe(true);
    });

    it("should accept a valid time_on_page event", () => {
      const result = createCustomEventSchema.safeParse({
        name: "engaged_reader",
        displayName: "Engaged Reader",
        triggerType: "time_on_page",
        triggerConfig: { seconds: 30 },
      });
      expect(result.success).toBe(true);
    });

    it("should accept event with custom data and platform mapping", () => {
      const result = createCustomEventSchema.safeParse({
        name: "wishlist_add",
        displayName: "Added to Wishlist",
        triggerType: "manual",
        eventData: { category: "wishlist" },
        platformMapping: { meta: "AddToWishlist", google_ga4: "add_to_wishlist" },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventData).toEqual({ category: "wishlist" });
        expect(result.data.platformMapping).toEqual({
          meta: "AddToWishlist",
          google_ga4: "add_to_wishlist",
        });
      }
    });

    it("should reject event with invalid name format", () => {
      const result = createCustomEventSchema.safeParse({
        name: "Invalid Name!",
        displayName: "Test",
        triggerType: "manual",
      });
      expect(result.success).toBe(false);
    });

    it("should reject event name starting with number", () => {
      const result = createCustomEventSchema.safeParse({
        name: "123_event",
        displayName: "Test",
        triggerType: "manual",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty event name", () => {
      const result = createCustomEventSchema.safeParse({
        name: "",
        displayName: "Test",
        triggerType: "manual",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid trigger type", () => {
      const result = createCustomEventSchema.safeParse({
        name: "test_event",
        displayName: "Test",
        triggerType: "invalid_type",
      });
      expect(result.success).toBe(false);
    });

    it("should default isActive to true", () => {
      const result = createCustomEventSchema.safeParse({
        name: "test_event",
        displayName: "Test",
        triggerType: "manual",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isActive).toBe(true);
      }
    });

    it("should default eventData and platformMapping to empty objects", () => {
      const result = createCustomEventSchema.safeParse({
        name: "test_event",
        displayName: "Test",
        triggerType: "manual",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventData).toEqual({});
        expect(result.data.platformMapping).toEqual({});
      }
    });
  });

  // ── updateCustomEventSchema ─────────────────────────────────────────────

  describe("updateCustomEventSchema", () => {
    it("should accept partial updates with only id required", () => {
      const result = updateCustomEventSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("should accept a name update", () => {
      const result = updateCustomEventSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "new_event_name",
      });
      expect(result.success).toBe(true);
    });

    it("should accept isActive toggle", () => {
      const result = updateCustomEventSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    it("should accept nullable description", () => {
      const result = updateCustomEventSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        description: null,
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid UUID", () => {
      const result = updateCustomEventSchema.safeParse({
        id: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });
  });
});
