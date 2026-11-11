import { describe, expect, it } from "vitest";
import { isDashboardPath } from "../tracking-routes";
import { isEnvFlagOn, readClientTrackingFlags } from "#root/shared/config/tracking-flags";

describe("isDashboardPath", () => {
  it.each([
    "/dashboard",
    "/dashboard/",
    "/dashboard/orders",
    "/dashboard/admin/pixels?tab=events",
    "https://shop.test/dashboard/admin/pixels/events",
    "/Dashboard/Orders",
  ])("treats %s as a dashboard route", (u) => {
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
    "",
    undefined,
  ])("treats %s as a storefront route", (u) => {
    expect(isDashboardPath(u)).toBe(false);
  });
});

describe("tracking flags", () => {
  it("default OFF when unset", () => {
    expect(readClientTrackingFlags({})).toEqual({ excludeDashboard: false });
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
