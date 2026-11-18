import { afterEach, describe, expect, it, vi } from "vitest";
import { getAbsTrackingBootStatus, readAbsTrackingConfig, setAbsTrackingBootStatus, setEffectiveAbsTrackingMode, effectiveAbsTrackingMode } from "#root/shared/config/abs-tracking";
import { initAbsTracking } from "../readiness";
import { computeBackoffUntil, startAbsTrackingWorker } from "../worker";

/** Part D: gentle first production tick and safe boot. */

afterEach(() => {
  setEffectiveAbsTrackingMode("off");
  setAbsTrackingBootStatus(null);
});

describe("failure backoff", () => {
  const t = new Date("2026-11-20T10:00:00Z");
  const at = (ms: number) => new Date(t.getTime() + ms).toISOString();
  it("doubles from the poll interval and caps at 1 hour", () => {
    expect(computeBackoffUntil(1, t, 600_000).toISOString()).toBe(at(600_000));
    expect(computeBackoffUntil(2, t, 600_000).toISOString()).toBe(at(1_200_000));
    expect(computeBackoffUntil(3, t, 600_000).toISOString()).toBe(at(2_400_000));
    expect(computeBackoffUntil(4, t, 600_000).toISOString()).toBe(at(3_600_000));
    expect(computeBackoffUntil(12, t, 600_000).toISOString()).toBe(at(3_600_000));
  });
  it("a longer Retry-After wins, still capped at 1 hour", () => {
    expect(computeBackoffUntil(1, t, 300_000, 900_000).toISOString()).toBe(at(900_000));
    expect(computeBackoffUntil(1, t, 300_000, 60_000).toISOString()).toBe(at(300_000));
    expect(computeBackoffUntil(1, t, 300_000, 7_200_000).toISOString()).toBe(at(3_600_000));
  });
});

describe("gentle first tick: config", () => {
  it("defaults: 20 pages per tick, 5-minute tick budget, backfill from 2026-11-01", () => {
    const c = readAbsTrackingConfig({});
    expect(c.maxPagesPerTick).toBe(20);
    expect(c.tickTimeoutMs).toBe(300_000);
    expect(c.backfillFrom.toISOString()).toBe("2026-10-31T22:00:00.000Z");
  });
  it("bounds: pages 1–50, budget ≥ 30 s; junk falls back to the default", () => {
    expect(readAbsTrackingConfig({ ABS_MAX_PAGES_PER_TICK: "500" }).maxPagesPerTick).toBe(50);
    expect(readAbsTrackingConfig({ ABS_MAX_PAGES_PER_TICK: "0" }).maxPagesPerTick).toBe(1);
    expect(readAbsTrackingConfig({ ABS_MAX_PAGES_PER_TICK: "ten" }).maxPagesPerTick).toBe(20);
    expect(readAbsTrackingConfig({ ABS_TICK_TIMEOUT_MS: "1000" }).tickTimeoutMs).toBe(30_000);
  });
});

describe("boot: shadow requested but not usable → effective off, no crash", () => {
  const noDb = { execute: vi.fn(async () => { throw new Error("must not query"); }) };
  const quiet = () => ({ info: vi.fn(), warn: vi.fn() });

  it.each([
    [{ ABS_TRACKING_MODE: "shadow" }, /ABS_API_BASE_URL not set, ABS_API_KEY not set/],
    [{ ABS_TRACKING_MODE: "shadow", ABS_API_BASE_URL: "https://abs.example.test" }, /ABS_API_KEY not set/],
    [{ ABS_TRACKING_MODE: "shadow", ABS_API_BASE_URL: "http://abs.example.test", ABS_API_KEY: "k-NOT-REAL" }, /must be an https:\/\/ URL/],
    [{ ABS_TRACKING_MODE: "live", ABS_API_KEY: "k-NOT-REAL" }, /ABS_API_BASE_URL not set/],
  ])("%j", async (env, reason) => {
    const log = quiet();
    const init = await initAbsTracking(noDb as never, env, log);
    expect(init.effective).toBe("off");
    expect(effectiveAbsTrackingMode()).toBe("off");
    expect(init.reason).toMatch(reason);
    expect(noDb.execute).not.toHaveBeenCalled();
    // One clear boot line, never the key.
    expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/^\[ABS tracking\] off \(/));
    expect(JSON.stringify(log.info.mock.calls)).not.toContain("k-NOT-REAL");
    // Visible in absTracking.overview.
    expect(getAbsTrackingBootStatus()).toMatchObject({ requestedMode: env.ABS_TRACKING_MODE, effective: "off", ready: null });
    expect(getAbsTrackingBootStatus()?.reason).toMatch(reason);
    // The worker does not start: no timer, no tick, no crash loop.
    const h = startAbsTrackingWorker({ db: {} as never, config: init.config, handleSignals: false, log: quiet() });
    expect(h.started).toBe(false);
    expect(await h.tick()).toBeNull();
  });

  it("readiness failure (tables missing) also stays off and is published", async () => {
    const db = { execute: vi.fn(async () => ({ rows: [{ missing_tables: ["abs_audit_log"], missing_indexes: [], missing_columns: ["abs_sync_run.backoff_until"] }] })) };
    const init = await initAbsTracking(db as never, { ABS_TRACKING_MODE: "shadow", ABS_API_BASE_URL: "https://abs.example.test", ABS_API_KEY: "k-NOT-REAL" }, quiet());
    expect(init.effective).toBe("off");
    expect(getAbsTrackingBootStatus()).toMatchObject({ effective: "off", ready: false, missing: ["table abs_audit_log", "column abs_sync_run.backoff_until"] });
  });

  it("a readiness query that throws stays off (no throw out of boot)", async () => {
    const db = { execute: vi.fn(async () => { throw new Error("connection refused"); }) };
    const init = await initAbsTracking(db as never, { ABS_TRACKING_MODE: "shadow", ABS_API_BASE_URL: "https://abs.example.test", ABS_API_KEY: "k-NOT-REAL" }, quiet());
    expect(init.effective).toBe("off");
    expect(init.reason).toMatch(/readiness query failed/);
  });
});
