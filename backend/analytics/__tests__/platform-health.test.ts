import { afterEach, describe, expect, it } from "vitest";
import {
  GA4_CLIENT_OFF_NOTE,
  GA4_CLIENT_OWNED_NOTE,
  GA4_NO_MEASUREMENT_ID_NOTE,
  PIXEL_DISABLED_NOTE,
  evaluatePlatformHealth,
  isGa4ClientOwned,
  type PlatformHealthInput,
} from "#root/backend/analytics/platform-health";

/**
 * Pixel Readiness / Platform Health after G1: GA4 in its client-owned mode
 * (GA4_MP_MODE=off, the default) is judged by the browser tag, not by server
 * Measurement Protocol deliveries — which are intentionally zero, and whose
 * old "Missing api_secret" failures say nothing about today.
 */

const GA4_CFG = { enabled: true, enableClientSide: true, pixelId: "G-TZZRFSD70Q" };
const ga4 = (over: Partial<PlatformHealthInput> = {}): PlatformHealthInput => ({
  platform: "google_ga4",
  config: GA4_CFG,
  successCount: 0,
  failedCount: 0,
  lastEventAt: null,
  ...over,
});

/** The pre-change rule, copied verbatim from backend/analytics/service.ts @ f29538c. */
function legacyRow(platform: string, enabled: boolean, success: number, failed: number, lastEvent: Date | null) {
  const total = success + failed;
  const successRate = total > 0 ? (success / total) * 100 : 0;
  const status: "healthy" | "degraded" | "down" | "no_data" =
    total === 0 ? "no_data" : successRate >= 99 ? "healthy" : successRate >= 90 ? "degraded" : "down";
  return {
    platform,
    enabled,
    successRate: Math.round(successRate * 10) / 10,
    successCount: success,
    failedCount: failed,
    lastEventAt: lastEvent?.toISOString() ?? null,
    status,
  };
}

const prev = process.env.GA4_MP_MODE;
afterEach(() => {
  if (prev === undefined) Reflect.deleteProperty(process.env, "GA4_MP_MODE");
  else process.env.GA4_MP_MODE = prev;
});

describe("GA4 client-owned (GA4_MP_MODE=off, default)", () => {
  it("is the mode when GA4_MP_MODE is unset", () => {
    Reflect.deleteProperty(process.env, "GA4_MP_MODE");
    expect(isGa4ClientOwned()).toBe(true);
    expect(evaluatePlatformHealth(ga4()).basis).toBe("client");
  });

  it("client-side ON + valid Measurement ID = healthy, labelled", () => {
    const row = evaluatePlatformHealth(ga4(), "off");
    expect(row.status).toBe("healthy");
    expect(row.basis).toBe("client");
    expect(row.note).toBe("Client-side active · Server mirror disabled to prevent duplicate GA4 events");
    expect(row.note).toBe(GA4_CLIENT_OWNED_NOTE);
  });

  it("zero MP deliveries is not DOWN (nor 'no data')", () => {
    const row = evaluatePlatformHealth(ga4({ successCount: 0, failedCount: 0 }), "off");
    expect(row.status).toBe("healthy");
  });

  it("historical MP failures (e.g. 'Missing api_secret') do not make it unhealthy", () => {
    const row = evaluatePlatformHealth(
      ga4({ successCount: 0, failedCount: 1843, lastEventAt: new Date("2026-11-10T10:00:00Z") }),
      "off",
    );
    expect(row.status).toBe("healthy");
    // History stays visible as data, but never drives the badge.
    expect(row.failedCount).toBe(1843);
    const mixed = evaluatePlatformHealth(ga4({ successCount: 57, failedCount: 300 }), "off");
    expect(mixed.status).toBe("healthy");
  });

  it("is DOWN only when GA4 really measures nothing: client-side off, or no G- id", () => {
    const off = evaluatePlatformHealth(ga4({ config: { ...GA4_CFG, enableClientSide: false } }), "off");
    expect(off.status).toBe("down");
    expect(off.note).toBe(GA4_CLIENT_OFF_NOTE);
    const badId = evaluatePlatformHealth(ga4({ config: { ...GA4_CFG, pixelId: "UA-123-1" } }), "off");
    expect(badId.status).toBe("down");
    expect(badId.note).toBe(GA4_NO_MEASUREMENT_ID_NOTE);
  });

  it("a disabled GA4 pixel is 'no data', not DOWN", () => {
    const row = evaluatePlatformHealth(ga4({ config: { ...GA4_CFG, enabled: false }, failedCount: 50 }), "off");
    expect(row.status).toBe("no_data");
    expect(row.note).toBe(PIXEL_DISABLED_NOTE);
    expect(row.enabled).toBe(false);
  });
});

describe("GA4 with GA4_MP_MODE=legacy_all: server-delivery health applies as before", () => {
  it.each([
    [0, 0, "no_data"],
    [0, 500, "down"],
    [80, 20, "down"],
    [950, 50, "degraded"],
    [995, 5, "healthy"],
  ] as const)("%i sent / %i failed → %s", (success, failed, status) => {
    process.env.GA4_MP_MODE = "legacy_all";
    expect(isGa4ClientOwned()).toBe(false);
    const row = evaluatePlatformHealth(ga4({ successCount: success, failedCount: failed }));
    expect(row.status).toBe(status);
    expect(row.basis).toBe("server_delivery");
    expect(row.note).toBeUndefined();
    const { basis: _b, ...rest } = row;
    expect(rest).toEqual(legacyRow("google_ga4", true, success, failed, null));
  });
});

describe("Meta (and every non-GA4 platform) is unchanged", () => {
  const cases: Array<[number, number]> = [
    [0, 0],
    [1000, 0],
    [990, 10],
    [989, 11],
    [900, 100],
    [899, 101],
    [0, 7],
  ];
  const last = new Date("2026-11-12T08:00:00Z");

  for (const mode of ["off", "legacy_all"] as const) {
    it(`matches the pre-change rule exactly in GA4_MP_MODE=${mode}`, () => {
      for (const platform of ["meta", "tiktok", "snapchat", "pinterest", "clarity"]) {
        for (const [success, failed] of cases) {
          for (const enabled of [true, false]) {
            const row = evaluatePlatformHealth(
              {
                platform,
                config: { enabled, enableClientSide: true, pixelId: "123" },
                successCount: success,
                failedCount: failed,
                lastEventAt: last,
              },
              mode,
            );
            const { basis, ...rest } = row;
            expect(basis).toBe("server_delivery");
            expect(rest).toEqual(legacyRow(platform, enabled, success, failed, last));
          }
        }
      }
    });
  }

  it("a delivery-only platform with no config row keeps enabled=false, as before", () => {
    const row = evaluatePlatformHealth(
      { platform: "meta", config: null, successCount: 3, failedCount: 0, lastEventAt: null },
      "off",
    );
    expect(row.enabled).toBe(false);
    expect(row.status).toBe("healthy");
  });
});
