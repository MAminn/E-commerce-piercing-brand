import { afterEach, describe, expect, it } from "vitest";
import {
  DASHBOARD_URL_PATTERN,
  excludeDashboardDeliveries,
  excludeDashboardEvents,
} from "#root/backend/pixel-tracking/internal-traffic";
import { isDashboardPath } from "#root/shared/utils/tracking-routes";

const prev = process.env.TRACKING_EXCLUDE_INTERNAL;
afterEach(() => {
  if (prev === undefined) Reflect.deleteProperty(process.env, "TRACKING_EXCLUDE_INTERNAL");
  else process.env.TRACKING_EXCLUDE_INTERNAL = prev;
});

describe("A2 stats conditions", () => {
  it("are undefined (no-op in and()) while the flag is off", () => {
    Reflect.deleteProperty(process.env, "TRACKING_EXCLUDE_INTERNAL");
    expect(excludeDashboardEvents()).toBeUndefined();
    expect(excludeDashboardDeliveries()).toBeUndefined();
  });

  it("are SQL conditions while the flag is on", () => {
    process.env.TRACKING_EXCLUDE_INTERNAL = "true";
    expect(excludeDashboardEvents()).toBeDefined();
    expect(excludeDashboardDeliveries()).toBeDefined();
  });

  it("the SQL pattern agrees with isDashboardPath (JS regex check, case-insensitive)", () => {
    const re = new RegExp(DASHBOARD_URL_PATTERN, "i");
    for (const u of [
      "https://shop.test/dashboard",
      "https://shop.test/dashboard/orders",
      "https://shop.test/DASHBOARD?x=1",
      "/dashboard/admin/pixels",
      "https://shop.test/shop",
      "https://shop.test/dashboards",
      "https://shop.test/shop?next=/dashboard",
      "/bundles",
    ]) {
      expect(re.test(u)).toBe(isDashboardPath(u));
    }
  });
});
