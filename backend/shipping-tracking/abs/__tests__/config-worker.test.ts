import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ABS_POLL_INTERVAL_MIN_MS,
  effectiveAbsTrackingMode,
  parseAbsBaseUrl,
  readAbsTrackingConfig,
  setEffectiveAbsTrackingMode,
} from "#root/shared/config/abs-tracking";
import { initAbsTracking } from "../readiness";
import { runAbsTrackingTick, startAbsTrackingWorker } from "../worker";

const ENV_OK = { ABS_TRACKING_MODE: "shadow", ABS_API_BASE_URL: "https://abs.example.test", ABS_API_KEY: "k-NOT-REAL-1234" };

/** A database double that fails the test if anything at all is asked of it. */
function untouchableDb() {
  const calls: string[] = [];
  const db = new Proxy(
    {},
    {
      get(_t, prop) {
        calls.push(String(prop));
        return () => {
          throw new Error(`db.${String(prop)} must not be called`);
        };
      },
    },
  );
  return { db: db as never, calls };
}

const quietLog = () => {
  const lines: string[] = [];
  return { lines, log: { info: (m: string) => lines.push(m), warn: (m: string) => lines.push(m) } };
};

afterEach(() => setEffectiveAbsTrackingMode("off"));

describe("config", () => {
  it("defaults to off; unknown values are off", () => {
    expect(readAbsTrackingConfig({}).mode).toBe("off");
    for (const v of ["", "on", "true", "SHADOWS", "1", "server"]) expect(readAbsTrackingConfig({ ABS_TRACKING_MODE: v }).mode).toBe("off");
    expect(readAbsTrackingConfig({ ABS_TRACKING_MODE: " Shadow " }).mode).toBe("shadow");
  });

  it("live → shadow with one warning", () => {
    const c = readAbsTrackingConfig({ ...ENV_OK, ABS_TRACKING_MODE: "live" });
    expect(c.requestedMode).toBe("live");
    expect(c.mode).toBe("shadow");
    expect(c.warnings).toEqual(["live requested but not available in this build; running shadow"]);
  });

  it("defaults and the interval floor", () => {
    const c = readAbsTrackingConfig(ENV_OK);
    expect(c.pollIntervalMs).toBe(600_000);
    expect(c.overlapMs).toBe(1_800_000);
    expect(c.backfillFrom.toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(c.matchWindowDays).toBe(10);
    expect(c.codToleranceEgp).toBe(1);
    const low = readAbsTrackingConfig({ ...ENV_OK, ABS_POLL_INTERVAL_MS: "1000" });
    expect(low.pollIntervalMs).toBe(ABS_POLL_INTERVAL_MIN_MS);
    expect(low.warnings.join()).toMatch(/floor/);
    expect(readAbsTrackingConfig({ ...ENV_OK, ABS_POLL_INTERVAL_MS: "900000" }).pollIntervalMs).toBe(900_000);
    expect(readAbsTrackingConfig({ ...ENV_OK, ABS_POLL_INTERVAL_MS: "abc" }).pollIntervalMs).toBe(600_000);
    expect(readAbsTrackingConfig({ ...ENV_OK, ABS_BACKFILL_FROM: "2026-11-10" }).backfillFrom.toISOString()).toBe("2026-11-09T22:00:00.000Z");
    expect(readAbsTrackingConfig({ ...ENV_OK, ABS_BACKFILL_FROM: "garbage" }).backfillFrom.toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(readAbsTrackingConfig({ ...ENV_OK, ABS_COD_TOLERANCE_EGP: "2.5" }).codToleranceEgp).toBe(2.5);
  });

  it("base URL must be https, no credentials/query; there is no default", () => {
    expect(parseAbsBaseUrl("https://abs.example.test/")).toBe("https://abs.example.test");
    expect(parseAbsBaseUrl("https://abs.example.test/client/")).toBe("https://abs.example.test/client");
    for (const bad of ["", "http://abs.example.test", "ftp://x", "https://u:p@abs.example.test", "https://abs.example.test/?k=1", "not a url"]) {
      expect(parseAbsBaseUrl(bad)).toBeNull();
    }
    expect(readAbsTrackingConfig({ ABS_TRACKING_MODE: "shadow" }).missing).toEqual(["ABS_API_BASE_URL not set", "ABS_API_KEY not set"]);
    expect(readAbsTrackingConfig({ ...ENV_OK, ABS_API_BASE_URL: "http://abs.example.test" }).missing).toEqual(["ABS_API_BASE_URL must be an https:// URL"]);
  });

  it("config never exposes the key in warnings / missing", () => {
    const c = readAbsTrackingConfig({ ...ENV_OK, ABS_TRACKING_MODE: "live", ABS_POLL_INTERVAL_MS: "5" });
    expect([...c.warnings, ...c.missing].join(" ")).not.toContain(ENV_OK.ABS_API_KEY);
  });
});

describe("boot: mode off / missing config → nothing starts, no query", () => {
  it("off: initAbsTracking makes no DB call, logs one line, effective stays off", async () => {
    const { db, calls } = untouchableDb();
    const { lines, log } = quietLog();
    const init = await initAbsTracking(db, {}, log);
    expect(init.effective).toBe("off");
    expect(effectiveAbsTrackingMode()).toBe("off");
    expect(calls).toEqual([]);
    expect(lines).toEqual(["[ABS tracking] off (ABS_TRACKING_MODE is off or unset)"]);
  });

  it("shadow without URL/key: off, no DB call", async () => {
    const { db, calls } = untouchableDb();
    const { lines, log } = quietLog();
    const init = await initAbsTracking(db, { ABS_TRACKING_MODE: "shadow" }, log);
    expect(init.effective).toBe("off");
    expect(calls).toEqual([]);
    expect(lines[0]).toMatch(/^\[ABS tracking\] off \(ABS_API_BASE_URL not set, ABS_API_KEY not set\)$/);
  });

  it("shadow but tables missing (readiness fails) → stays off", async () => {
    const { lines, log } = quietLog();
    const db = { execute: vi.fn(async () => ({ rows: [{ missing_tables: ["abs_shipment"], missing_indexes: [] }] })) };
    const init = await initAbsTracking(db as never, ENV_OK, log);
    expect(init.effective).toBe("off");
    expect(effectiveAbsTrackingMode()).toBe("off");
    expect(lines.join()).toMatch(/not ready: table abs_shipment/);
  });

  it("shadow, ready → shadow; live → shadow + warning", async () => {
    const { lines, log } = quietLog();
    const db = { execute: vi.fn(async () => ({ rows: [{ missing_tables: [], missing_indexes: [] }] })) };
    expect((await initAbsTracking(db as never, ENV_OK, log)).effective).toBe("shadow");
    expect(effectiveAbsTrackingMode()).toBe("shadow");
    expect((await initAbsTracking(db as never, { ...ENV_OK, ABS_TRACKING_MODE: "live" }, log)).effective).toBe("shadow");
    expect(lines).toContain("[ABS tracking] live requested but not available in this build; running shadow");
    for (const l of lines) expect(l).not.toContain(ENV_OK.ABS_API_KEY);
  });

  it("a failing readiness query → off, never throws", async () => {
    const { log } = quietLog();
    const db = { execute: vi.fn(async () => Promise.reject(new Error("boom"))) };
    expect((await initAbsTracking(db as never, ENV_OK, log)).effective).toBe("off");
  });

  it("startAbsTrackingWorker in mode off: no timer, no query, no fetch", async () => {
    vi.useFakeTimers();
    try {
      const { db, calls } = untouchableDb();
      const fetchImpl = vi.fn();
      const h = startAbsTrackingWorker({ db, config: readAbsTrackingConfig(ENV_OK), mode: () => "off", fetchImpl: fetchImpl as never, handleSignals: false });
      expect(h.started).toBe(false);
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(await h.tick()).toBeNull();
      expect(calls).toEqual([]);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("startAbsTrackingWorker in shadow without a key: not started", () => {
    const { db, calls } = untouchableDb();
    const { lines, log } = quietLog();
    const h = startAbsTrackingWorker({ db, config: readAbsTrackingConfig({ ABS_TRACKING_MODE: "shadow" }), mode: () => "shadow", log, handleSignals: false });
    expect(h.started).toBe(false);
    expect(calls).toEqual([]);
    expect(lines[0]).toMatch(/off/);
  });

  it("a tick never throws, even when the database is unusable", async () => {
    const { db } = untouchableDb();
    const logs: string[] = [];
    const report = await runAbsTrackingTick({ db, config: readAbsTrackingConfig(ENV_OK), source: { listChangedShipments: vi.fn() }, log: (m) => logs.push(m) });
    expect(report.outcome).toBe("failed");
    expect(report.error).toBeTruthy();
    expect(logs.join()).not.toContain(ENV_OK.ABS_API_KEY);
  });
});
