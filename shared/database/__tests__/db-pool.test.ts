import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Unit tests for the process-wide pool in shared/database/drizzle/db.ts.
 * No database needed: constructing a pg Pool does not connect.
 *
 * Regression: db() used to build a NEW pg Pool on every call, so every call
 * site (~60, including per-row loops in the email worker and trigger scan)
 * opened its own PostgreSQL connection, which then sat idle for 10s —
 * unbounded, until "FATAL: sorry, too many clients already" — and none of
 * those pools had an "error" listener (a dropped idle connection crashed
 * the process).
 */

const ENV_KEYS = [
  "DATABASE_URL",
  "DB_POOL_MAX",
  "DB_POOL_IDLE_TIMEOUT_MS",
  "DB_POOL_CONNECTION_TIMEOUT_MS",
  "DB_APPLICATION_NAME",
] as const;

describe("db() process-wide pool", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:1/unit_pool_a";
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns the same client (one pg Pool) on every call", async () => {
    const { db } = await import("#root/shared/database/drizzle/db");
    const first = db();
    const clients = Array.from({ length: 500 }, () => db());
    expect(clients.every((c) => c === first)).toBe(true);
    expect(clients.every((c) => c.$client === first.$client)).toBe(true);
  });

  it("bounds the pool and attaches an idle-error listener (no crash on a dropped connection)", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:1/unit_pool_b";
    const { db } = await import("#root/shared/database/drizzle/db");
    const pool = db().$client;
    expect(pool.options.max).toBe(20);
    expect(pool.options.idleTimeoutMillis).toBe(30_000);
    expect(pool.options.connectionTimeoutMillis).toBe(10_000);
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    // An idle client error must be logged, not thrown as an uncaught exception.
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => pool.emit("error", new Error("terminating connection due to administrator command"))).not.toThrow();
    } finally {
      console.error = originalError;
    }
  });

  it("creates a separate pool only when DATABASE_URL changes", async () => {
    const { db } = await import("#root/shared/database/drizzle/db");
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:1/unit_pool_c";
    const c = db();
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:1/unit_pool_d";
    const d = db();
    expect(d).not.toBe(c);
    expect(db()).toBe(d);
  });

  it("replaces a pool that a script or test has ended", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:1/unit_pool_e";
    const { db } = await import("#root/shared/database/drizzle/db");
    const first = db();
    await first.$client.end();
    const second = db();
    expect(second).not.toBe(first);
    expect(second.$client.ended).toBe(false);
    expect(db()).toBe(second);
  });

  it("reads pool limits from env and ignores invalid values", async () => {
    const { poolConfigFromEnv } = await import("#root/shared/database/drizzle/db");
    process.env.DB_POOL_MAX = "7";
    process.env.DB_POOL_IDLE_TIMEOUT_MS = "5000";
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS = "2500";
    process.env.DB_APPLICATION_NAME = "perce-test";
    expect(poolConfigFromEnv("postgresql://x")).toMatchObject({
      max: 7,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 2500,
      application_name: "perce-test",
    });
    process.env.DB_POOL_MAX = "0";
    process.env.DB_POOL_IDLE_TIMEOUT_MS = "abc";
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS = "-1";
    delete process.env.DB_APPLICATION_NAME;
    expect(poolConfigFromEnv("postgresql://x")).toMatchObject({
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "perce-store",
    });
  });

  it("throws clearly when DATABASE_URL is missing", async () => {
    const { db } = await import("#root/shared/database/drizzle/db");
    delete process.env.DATABASE_URL;
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => db()).toThrow("DATABASE_URL is not set");
    } finally {
      console.error = originalError;
    }
  });
});
