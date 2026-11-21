import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { sql } from "drizzle-orm";

/**
 * Connection reuse, concurrency and recovery against a real Postgres
 * (TEST_DATABASE_URL — a disposable database, never production).
 *
 * Connections are counted from pg_stat_activity by application_name, so
 * the assertion is about what the SERVER sees, which is what produces
 * "FATAL: sorry, too many clients already".
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb("db() pool against Postgres (integration)", () => {
  const appName = `perce-pool-test-${process.pid}`;
  const POOL_MAX = 5;
  let observer: pg.Client;
  let dbModule: typeof import("#root/shared/database/drizzle/db");
  const saved = { url: process.env.DATABASE_URL, max: process.env.DB_POOL_MAX, app: process.env.DB_APPLICATION_NAME };

  async function serverConnections(): Promise<number> {
    const r = await observer.query<{ n: string }>(
      "select count(*)::text as n from pg_stat_activity where application_name = $1",
      [appName],
    );
    return Number(r.rows[0]!.n);
  }

  beforeAll(async () => {
    // A distinct URL (query string) guarantees a fresh pool with this test's
    // settings even if another suite already initialised db() in this worker.
    process.env.DATABASE_URL = `${TEST_DB_URL}${TEST_DB_URL!.includes("?") ? "&" : "?"}application_name=${appName}`;
    process.env.DB_POOL_MAX = String(POOL_MAX);
    process.env.DB_APPLICATION_NAME = appName;
    dbModule = await import("#root/shared/database/drizzle/db");
    observer = new pg.Client({ connectionString: TEST_DB_URL });
    await observer.connect();
  });

  afterAll(async () => {
    try {
      await dbModule.db().$client.end();
    } catch {}
    await observer?.end();
    process.env.DATABASE_URL = saved.url;
    if (saved.max === undefined) delete process.env.DB_POOL_MAX;
    else process.env.DB_POOL_MAX = saved.max;
    if (saved.app === undefined) delete process.env.DB_APPLICATION_NAME;
    else process.env.DB_APPLICATION_NAME = saved.app;
  });

  it("serves 300 concurrent db() callers with at most DB_POOL_MAX server connections", async () => {
    let peak = 0;
    const sampler = setInterval(() => {
      void serverConnections().then((n) => {
        peak = Math.max(peak, n);
      });
    }, 5);
    try {
      // Each caller calls db() itself, exactly like the ~60 call sites do.
      const results = await Promise.all(
        Array.from({ length: 300 }, (_, i) =>
          dbModule.db().execute(sql`select ${i}::int as i, pg_sleep(0.005)`),
        ),
      );
      expect(results).toHaveLength(300);
    } finally {
      clearInterval(sampler);
    }
    peak = Math.max(peak, await serverConnections());
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(POOL_MAX);
    expect(dbModule.db().$client.totalCount).toBeLessThanOrEqual(POOL_MAX);
  });

  it("runs a long sequential loop (email worker / trigger-scan shape) on one reused connection set", async () => {
    for (let i = 0; i < 200; i++) {
      await dbModule.db().execute(sql`select 1`);
    }
    expect(await serverConnections()).toBeLessThanOrEqual(POOL_MAX);
  });

  it("recovers after the server terminates every pooled connection (no crash, next query works)", async () => {
    await Promise.all(Array.from({ length: POOL_MAX }, () => dbModule.db().execute(sql`select pg_sleep(0.01)`)));
    const originalError = console.error;
    console.error = () => {};
    try {
      const killed = await observer.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where application_name = $1",
        [appName],
      );
      expect(killed.rowCount).toBeGreaterThan(0);
      // Give the pool a moment to observe the terminations (idle "error" events).
      await new Promise((r) => setTimeout(r, 200));

      const r = await dbModule.db().execute(sql`select 42 as answer`);
      expect((r.rows[0] as { answer: number }).answer).toBe(42);
    } finally {
      console.error = originalError;
    }
    expect(await serverConnections()).toBeLessThanOrEqual(POOL_MAX);
  });

  it("transactions on the shared pool still commit/roll back independently", async () => {
    const d = dbModule.db();
    const table = sql.raw(`_pool_tx_probe_${process.pid}`);
    await d.execute(sql`create table if not exists ${table} (v int)`);
    try {
      await d.transaction(async (tx) => {
        await tx.execute(sql`insert into ${table} values (1)`);
      });
      await d
        .transaction(async (tx) => {
          await tx.execute(sql`insert into ${table} values (2)`);
          throw new Error("rollback");
        })
        .catch(() => {});
      const rows = await d.execute(sql`select v from ${table} order by v`);
      expect(rows.rows.map((r) => (r as { v: number }).v)).toEqual([1]);
    } finally {
      await d.execute(sql`drop table if exists ${table}`);
    }
  });
});
