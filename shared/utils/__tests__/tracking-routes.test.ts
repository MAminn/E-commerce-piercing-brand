import { describe, expect, it } from "vitest";
import { isDashboardPath } from "../tracking-routes";
import { isEnvFlagOff, isEnvFlagOn, readClientTrackingFlags } from "#root/shared/config/tracking-flags";

describe("isDashboardPath", () => {
  it.each([
    "/dashboard",
    "/dashboard/",
    "/dashboard/orders",
    "/dashboard/admin/pixels?tab=events",
    "https://shop.test/dashboard/admin/pixels/events",
    "/Dashboard/Orders",
    "/admin",
    "/admin/",
    "/Admin/login",
    "https://shop.test/admin?next=/dashboard",
  ])("treats %s as an internal route", (u) => {
    expect(isDashboardPath(u)).toBe(true);
  });

  it.each([
    "/",
    "/shop",
    "/dashboards",
    "/dashboard-preview",
    "/bundles/pick-your-3",
    "https://shop.test/order-confirmation?id=1",
    "https://shop.test/shop?ref=/dashboard",
    "/administrator",
    "/admins",
    "/shop/admin-ring",
    "/account",
    "/checkout",
    "/order-confirmation",
    "",
    undefined,
  ])("treats %s as a storefront route", (u) => {
    expect(isDashboardPath(u)).toBe(false);
  });
});

describe("tracking flags", () => {
  it("default ON when unset (production never set it — internal traffic must be excluded)", () => {
    expect(readClientTrackingFlags({})).toEqual({ excludeDashboard: true, metaAdvancedMatching: true });
    expect(readClientTrackingFlags({ TRACKING_EXCLUDE_INTERNAL: "" }).excludeDashboard).toBe(true);
  });

  it("META_ADVANCED_MATCHING: default ON; only an explicit false/0/no/off disables it", () => {
    expect(readClientTrackingFlags({}).metaAdvancedMatching).toBe(true);
    expect(readClientTrackingFlags({ META_ADVANCED_MATCHING: "" }).metaAdvancedMatching).toBe(true);
    expect(readClientTrackingFlags({ META_ADVANCED_MATCHING: "true" }).metaAdvancedMatching).toBe(true);
    for (const v of ["false", "0", "no", "off", " OFF "]) {
      expect(readClientTrackingFlags({ META_ADVANCED_MATCHING: v }).metaAdvancedMatching).toBe(false);
    }
    // Independent of the internal-traffic switch.
    expect(readClientTrackingFlags({ TRACKING_EXCLUDE_INTERNAL: "off" }).metaAdvancedMatching).toBe(true);
  });

  it("only an explicit false/0/no/off switches it off", () => {
    for (const v of ["false", "FALSE", "0", "no", "off", " off "]) {
      expect(readClientTrackingFlags({ TRACKING_EXCLUDE_INTERNAL: v }).excludeDashboard).toBe(false);
      expect(isEnvFlagOff(v)).toBe(true);
    }
    for (const v of ["true", "1", "garbage", "", undefined]) expect(isEnvFlagOff(v)).toBe(false);
  });

  it("TRACKING_EXCLUDE_INTERNAL=true switches dashboard exclusion on", () => {
    expect(readClientTrackingFlags({ TRACKING_EXCLUDE_INTERNAL: "true" }).excludeDashboard).toBe(true);
  });

  it("accepts true/1/yes/on, anything else is off", () => {
    for (const v of ["true", "TRUE", "1", "yes", "on", " true "]) expect(isEnvFlagOn(v)).toBe(true);
    for (const v of ["false", "0", "no", "", "off", "enabled"]) expect(isEnvFlagOn(v)).toBe(false);
    expect(isEnvFlagOn(undefined)).toBe(false);
  });
});
