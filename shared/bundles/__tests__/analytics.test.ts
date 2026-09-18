import { describe, expect, it } from "vitest";
import {
  BEST_SELLING_PERIOD_DAYS,
  bundleAnalyticsBucket,
  computeBundleSalesMetrics,
  historicalCampaignKey,
  isDiscountGranted,
  parseUtcDay,
  rankBestSellingCampaignIds,
  resolveBundleAnalyticsRange,
} from "../analytics";

const NOW = new Date("2026-09-18T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("resolveBundleAnalyticsRange", () => {
  it("measures relative periods backwards from now in whole days", () => {
    expect(resolveBundleAnalyticsRange("7d", NOW).start).toEqual(
      new Date(NOW.getTime() - 7 * DAY),
    );
    expect(resolveBundleAnalyticsRange("30d", NOW).start).toEqual(
      new Date(NOW.getTime() - 30 * DAY),
    );
    expect(resolveBundleAnalyticsRange("90d", NOW).start).toEqual(
      new Date(NOW.getTime() - 90 * DAY),
    );
  });

  it("ends every relative range at now, so nothing in the future is counted", () => {
    for (const period of ["7d", "30d", "90d", "all"] as const) {
      expect(resolveBundleAnalyticsRange(period, NOW).end).toEqual(NOW);
    }
  });

  it("leaves all-time unbounded below", () => {
    expect(resolveBundleAnalyticsRange("all", NOW).start).toBeNull();
  });

  it("reads a custom range as UTC days and makes the end EXCLUSIVE", () => {
    const range = resolveBundleAnalyticsRange("custom", NOW, {
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(range.start).toEqual(new Date("2026-03-01T00:00:00.000Z"));
    // The inclusive last day becomes the following midnight: an order at
    // 2026-03-31T23:59:59Z is IN, one at 2026-04-01T00:00:00Z is OUT.
    expect(range.end).toEqual(new Date("2026-04-01T00:00:00.000Z"));
  });

  it("falls back to an unbounded start rather than silently selecting nothing", () => {
    const backwards = resolveBundleAnalyticsRange("custom", NOW, {
      from: "2026-05-01",
      to: "2026-04-01",
    });
    expect(backwards.start).toBeNull();
  });

  it("ignores malformed custom dates instead of rolling them over", () => {
    expect(parseUtcDay("2026-02-31")).toBeNull();
    expect(parseUtcDay("18/09/2026")).toBeNull();
    expect(parseUtcDay("")).toBeNull();
    expect(parseUtcDay("2026-09-18")).toEqual(new Date("2026-09-18T00:00:00.000Z"));
  });
});

describe("bundleAnalyticsBucket", () => {
  it("uses daily buckets for 7/30/90-day ranges", () => {
    for (const period of ["7d", "30d", "90d"] as const) {
      expect(bundleAnalyticsBucket(resolveBundleAnalyticsRange(period, NOW))).toBe("day");
    }
  });

  it("uses monthly buckets for all time", () => {
    expect(bundleAnalyticsBucket(resolveBundleAnalyticsRange("all", NOW))).toBe("month");
  });

  it("steps up to weekly then monthly as a custom range grows", () => {
    expect(bundleAnalyticsBucket({ start: new Date(NOW.getTime() - 200 * DAY), end: NOW })).toBe(
      "week",
    );
    expect(bundleAnalyticsBucket({ start: new Date(NOW.getTime() - 900 * DAY), end: NOW })).toBe(
      "month",
    );
  });
});

describe("computeBundleSalesMetrics", () => {
  it("derives the average from charged revenue, not child prices", () => {
    const m = computeBundleSalesMetrics({
      instances: 3,
      orders: 2,
      pieces: 15,
      revenue: 1300,
      regularValue: 1600,
    });
    expect(m.revenue).toBe(1300);
    expect(m.averageBundleValue).toBeCloseTo(433.33, 2);
    expect(m.savings).toBe(300);
  });

  it("returns zeros — never NaN — when nothing sold", () => {
    const m = computeBundleSalesMetrics({});
    expect(m).toMatchObject({
      instances: 0,
      orders: 0,
      pieces: 0,
      revenue: 0,
      regularValue: 0,
      averageBundleValue: 0,
      savings: 0,
    });
  });

  it("reports a negative difference truthfully instead of clamping it", () => {
    const m = computeBundleSalesMetrics({ instances: 1, revenue: 600, regularValue: 500 });
    expect(m.savings).toBe(-100);
    expect(isDiscountGranted(m.savings)).toBe(false);
  });

  it("does not call a zero difference a discount", () => {
    expect(isDiscountGranted(0)).toBe(false);
    expect(isDiscountGranted(0.004)).toBe(false);
    expect(isDiscountGranted(0.01)).toBe(true);
  });

  it("keeps money free of float artefacts", () => {
    const m = computeBundleSalesMetrics({ instances: 3, revenue: 0.1 + 0.2, regularValue: 0 });
    expect(m.revenue).toBe(0.3);
    expect(m.averageBundleValue).toBe(0.1);
  });
});

describe("rankBestSellingCampaignIds", () => {
  const live = ["a", "b", "c"];

  it("ranks by bundle instances sold, descending", () => {
    const ranked = rankBestSellingCampaignIds(
      [
        { campaignId: "a", instances: 30, revenue: 9000 },
        { campaignId: "b", instances: 80, revenue: 24000 },
        { campaignId: "c", instances: 50, revenue: 15000 },
      ],
      live,
      10,
    );
    expect(ranked).toEqual(["b", "c", "a"]);
  });

  it("breaks an instance tie on revenue", () => {
    const ranked = rankBestSellingCampaignIds(
      [
        { campaignId: "a", instances: 10, revenue: 1000 },
        { campaignId: "b", instances: 10, revenue: 5000 },
      ],
      live,
      10,
    );
    expect(ranked.slice(0, 2)).toEqual(["b", "a"]);
  });

  it("breaks a full tie on campaign id, so the order is never SQL-dependent", () => {
    const sales = [
      { campaignId: "c", instances: 4, revenue: 400 },
      { campaignId: "a", instances: 4, revenue: 400 },
      { campaignId: "b", instances: 4, revenue: 400 },
    ];
    expect(rankBestSellingCampaignIds(sales, live, 10).slice(0, 3)).toEqual(["a", "b", "c"]);
    // Same input in a different order must produce the same output.
    expect(rankBestSellingCampaignIds([...sales].reverse(), live, 10).slice(0, 3)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("drops campaigns that are no longer live, however well they sold", () => {
    const ranked = rankBestSellingCampaignIds(
      [
        { campaignId: "deleted", instances: 999, revenue: 999999 },
        { campaignId: "a", instances: 1, revenue: 100 },
      ],
      live,
      10,
    );
    expect(ranked).not.toContain("deleted");
    expect(ranked[0]).toBe("a");
  });

  it("backfills unsold live campaigns in CMS order so the rail never empties", () => {
    expect(rankBestSellingCampaignIds([], live, 10)).toEqual(["a", "b", "c"]);
    expect(
      rankBestSellingCampaignIds([{ campaignId: "c", instances: 2, revenue: 200 }], live, 10),
    ).toEqual(["c", "a", "b"]);
  });

  it("respects the limit", () => {
    expect(rankBestSellingCampaignIds([], live, 2)).toEqual(["a", "b"]);
    expect(rankBestSellingCampaignIds([], live, 0)).toEqual([]);
  });

  it("ignores rows with no sales rather than ranking them above unsold campaigns", () => {
    expect(
      rankBestSellingCampaignIds([{ campaignId: "c", instances: 0, revenue: 0 }], live, 10),
    ).toEqual(["a", "b", "c"]);
  });

  it("defaults the merchandising window to 30 days", () => {
    expect(BEST_SELLING_PERIOD_DAYS).toBe(30);
  });
});

describe("historicalCampaignKey", () => {
  it("groups a renamed campaign under its stable id", () => {
    expect(historicalCampaignKey("id-1", "old-slug")).toBe(
      historicalCampaignKey("id-1", "new-slug"),
    );
  });

  it("keeps a deleted campaign's sales under its snapshotted slug", () => {
    expect(historicalCampaignKey(null, "ear-stack")).toBe("slug:ear-stack");
    // A deleted campaign never collides with a live one that has an id.
    expect(historicalCampaignKey(null, "ear-stack")).not.toBe(
      historicalCampaignKey("id-1", "ear-stack"),
    );
  });
});
