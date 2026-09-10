import { describe, it, expect } from "vitest";
import type { AttributionModel } from "#root/shared/types/pixel-tracking";

// ─── Analytics Dashboard Tests ──────────────────────────────────────────────
// Tests the data structures and logic used by the analytics dashboard.
// We don't render the React component in a unit test, but we validate
// the underlying data shapes, computations, and type safety.

// ── Funnel Data ─────────────────────────────────────────────────────────────

interface FunnelStage {
  name: string;
  value: number;
  fill: string;
}

const FUNNEL_DATA: FunnelStage[] = [
  { name: "Page Viewed", value: 48293, fill: "#6366f1" },
  { name: "Product Viewed", value: 18742, fill: "#8b5cf6" },
  { name: "Added to Cart", value: 5621, fill: "#a78bfa" },
  { name: "Checkout Started", value: 2103, fill: "#c4b5fd" },
  { name: "Purchase Completed", value: 1562, fill: "#ddd6fe" },
];

// ── Channel Data ────────────────────────────────────────────────────────────

interface ChannelRow {
  channel: string;
  sessions: number;
  conversions: number;
  revenue: number;
  roas: number;
}

const CHANNEL_DATA_SAMPLE: ChannelRow[] = [
  { channel: "Organic", sessions: 4200, conversions: 180, revenue: 15840, roas: 0 },
  { channel: "Paid Meta", sessions: 3100, conversions: 142, revenue: 12430, roas: 4.1 },
  { channel: "Paid Google", sessions: 2800, conversions: 128, revenue: 11200, roas: 3.7 },
  { channel: "Direct", sessions: 1500, conversions: 65, revenue: 5688, roas: 0 },
  { channel: "Email", sessions: 800, conversions: 48, revenue: 4200, roas: 8.4 },
  { channel: "Social", sessions: 447, conversions: 15, revenue: 1313, roas: 0 },
];

// ── Platform Health ─────────────────────────────────────────────────────────

interface PlatformHealth {
  platform: string;
  successRate: number;
  failedDeliveries: number;
  lastEventAt: string | null;
  status: "healthy" | "degraded" | "down";
}

// ── formatTimeAgo (replicating dashboard helper) ────────────────────────────

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Analytics Dashboard", () => {
  describe("funnel data", () => {
    it("has 5 stages", () => {
      expect(FUNNEL_DATA.length).toBe(5);
    });

    it("stages are in descending order by value", () => {
      for (let i = 1; i < FUNNEL_DATA.length; i++) {
        expect(FUNNEL_DATA[i]!.value).toBeLessThan(FUNNEL_DATA[i - 1]!.value);
      }
    });

    it("each stage has a name, value, and fill color", () => {
      for (const stage of FUNNEL_DATA) {
        expect(stage.name).toBeTruthy();
        expect(stage.value).toBeGreaterThan(0);
        expect(stage.fill).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it("calculates drop-off percentages correctly", () => {
      // Page Viewed → Product Viewed drop-off
      const dropOff =
        ((1 - FUNNEL_DATA[1]!.value / FUNNEL_DATA[0]!.value) * 100);
      expect(dropOff).toBeGreaterThan(0);
      expect(dropOff).toBeLessThan(100);
      // ~61.2% drop from 48293 to 18742
      expect(Math.round(dropOff)).toBe(61);
    });

    it("starts with Page Viewed and ends with Purchase Completed", () => {
      expect(FUNNEL_DATA[0]!.name).toBe("Page Viewed");
      expect(FUNNEL_DATA[FUNNEL_DATA.length - 1]!.name).toBe("Purchase Completed");
    });
  });

  describe("channel data", () => {
    it("has at least one channel", () => {
      expect(CHANNEL_DATA_SAMPLE.length).toBeGreaterThan(0);
    });

    it("each channel has required fields", () => {
      for (const row of CHANNEL_DATA_SAMPLE) {
        expect(row.channel).toBeTruthy();
        expect(row.sessions).toBeGreaterThanOrEqual(0);
        expect(row.conversions).toBeGreaterThanOrEqual(0);
        expect(row.revenue).toBeGreaterThanOrEqual(0);
        expect(typeof row.roas).toBe("number");
      }
    });

    it("conversions never exceeds sessions", () => {
      for (const row of CHANNEL_DATA_SAMPLE) {
        expect(row.conversions).toBeLessThanOrEqual(row.sessions);
      }
    });

    it("paid channels have ROAS > 0", () => {
      const paidChannels = CHANNEL_DATA_SAMPLE.filter((r) =>
        r.channel.startsWith("Paid"),
      );
      for (const row of paidChannels) {
        expect(row.roas).toBeGreaterThan(0);
      }
    });

    it("organic and direct channels have ROAS = 0", () => {
      const organicChannels = CHANNEL_DATA_SAMPLE.filter(
        (r) => r.channel === "Organic" || r.channel === "Direct" || r.channel === "Social",
      );
      for (const row of organicChannels) {
        expect(row.roas).toBe(0);
      }
    });
  });

  describe("attribution model selection", () => {
    const validModels: AttributionModel[] = [
      "first_touch",
      "last_touch",
      "linear",
    ];

    it("has exactly 3 valid models", () => {
      expect(validModels.length).toBe(3);
    });

    it("each model name matches expected format", () => {
      for (const model of validModels) {
        expect(model).toMatch(/^[a-z_]+$/);
      }
    });
  });

  describe("platform health", () => {
    const platforms: PlatformHealth[] = [
      {
        platform: "Meta (CAPI)",
        successRate: 99.8,
        failedDeliveries: 3,
        lastEventAt: new Date(Date.now() - 45000).toISOString(),
        status: "healthy",
      },
      {
        platform: "TikTok Events",
        successRate: 97.2,
        failedDeliveries: 42,
        lastEventAt: new Date(Date.now() - 300000).toISOString(),
        status: "degraded",
      },
      {
        platform: "Pinterest CAPI",
        successRate: 0,
        failedDeliveries: 0,
        lastEventAt: null,
        status: "down",
      },
    ];

    it("healthy platforms have high success rate", () => {
      const healthy = platforms.filter((p) => p.status === "healthy");
      for (const p of healthy) {
        expect(p.successRate).toBeGreaterThan(99);
      }
    });

    it("degraded platforms have lower success rate", () => {
      const degraded = platforms.filter((p) => p.status === "degraded");
      for (const p of degraded) {
        expect(p.successRate).toBeLessThan(99);
        expect(p.successRate).toBeGreaterThan(0);
      }
    });

    it("down platforms have zero success rate", () => {
      const down = platforms.filter((p) => p.status === "down");
      for (const p of down) {
        expect(p.successRate).toBe(0);
      }
    });

    it("down platforms have no last event timestamp", () => {
      const down = platforms.filter((p) => p.status === "down");
      for (const p of down) {
        expect(p.lastEventAt).toBeNull();
      }
    });
  });

  describe("conversion rate", () => {
    it("calculates purchase rate from sessions", async () => {
      const { computeConversionRate } = await import(
        "#root/backend/analytics/service"
      );
      expect(computeConversionRate(28, 2030)).toBe(1.4);
      expect(computeConversionRate(0, 100)).toBe(0);
      expect(computeConversionRate(10, 0)).toBe(0);
    });
  });

  describe("formatTimeAgo", () => {
    it("formats seconds ago", () => {
      const now = new Date(Date.now() - 30000).toISOString(); // 30s ago
      const result = formatTimeAgo(now);
      expect(result).toMatch(/^\d+s ago$/);
    });

    it("formats minutes ago", () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const result = formatTimeAgo(fiveMinAgo);
      expect(result).toMatch(/^\d+m ago$/);
    });

    it("formats hours ago", () => {
      const twoHoursAgo = new Date(
        Date.now() - 2 * 60 * 60 * 1000,
      ).toISOString();
      const result = formatTimeAgo(twoHoursAgo);
      expect(result).toMatch(/^\d+h ago$/);
    });

    it("formats days ago", () => {
      const threeDaysAgo = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const result = formatTimeAgo(threeDaysAgo);
      expect(result).toMatch(/^\d+d ago$/);
    });
  });
});
