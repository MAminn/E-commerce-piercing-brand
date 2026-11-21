import { ServerError } from "#root/shared/error/server.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { Context, Effect, pipe } from "effect";
import pg from "pg";
import * as schema from "./schema.js";

/** Positive integer from env, or the fallback when unset/invalid. */
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Pool settings. One pool per process is the whole connection budget of this
 * app, so `max` is a hard ceiling on its PostgreSQL connections (keep the sum
 * over every running container — two during a rolling deploy — well below the
 * server's max_connections).
 */
export function poolConfigFromEnv(connectionString: string): pg.PoolConfig {
  return {
    connectionString,
    max: intFromEnv("DB_POOL_MAX", 20),
    // Idle connections are closed after this; the pool reopens on demand.
    idleTimeoutMillis: intFromEnv("DB_POOL_IDLE_TIMEOUT_MS", 30_000),
    // Waiting for a free pooled connection fails explicitly after this
    // instead of hanging the request forever when the pool is saturated.
    connectionTimeoutMillis: intFromEnv("DB_POOL_CONNECTION_TIMEOUT_MS", 10_000),
    keepAlive: true,
    // Lets pg_stat_activity attribute connections to this app.
    application_name: process.env.DB_APPLICATION_NAME || "perce-store",
  };
}

function createDbClient(dbUrl: string) {
  const pool = new pg.Pool(poolConfigFromEnv(dbUrl));
  // An idle pooled connection dropped by the server (restart, admin
  // terminate, network) emits "error" on the pool; without a listener that
  // is an uncaught exception that kills the process. The pool discards the
  // broken client and opens a fresh one on the next checkout.
  pool.on("error", (err) => {
    console.error(
      "[DB] Idle pooled connection error (connection discarded):",
      err instanceof Error ? err.message : err,
    );
  });
  return drizzle({ client: pool, schema });
}

let sharedClient: ReturnType<typeof createDbClient> | null = null;
let sharedClientUrl: string | undefined;

/**
 * The process-wide database client: ONE bounded pg Pool per DATABASE_URL,
 * created on first use and reused by every caller.
 *
 * This used to build a brand-new pg Pool on every call (~60 call sites: the
 * email worker per row, the order activity log, the trigger scan per
 * customer, the ABS poller, ...). Each of those pools kept its connection
 * open for 10s after the query finished and had no "error" listener, so any
 * loop or burst opened one PostgreSQL connection per call with no upper
 * bound until the server answered "FATAL: sorry, too many clients already"
 * — which is exactly when an order email could not be queued or marked sent.
 */
export function db(): ReturnType<typeof createDbClient> {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("[DB Connection] ERROR: DATABASE_URL is not set");
    throw new Error("DATABASE_URL is not set");
  }

  // A script or test that called `$client.end()` must not leave every later
  // caller holding a dead pool.
  if (!sharedClient || sharedClientUrl !== dbUrl || sharedClient.$client.ended) {
    try {
      sharedClient = createDbClient(dbUrl);
      sharedClientUrl = dbUrl;
    } catch (error) {
      console.error(
        "[DB Connection] Failed to create database connection pool:",
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
  return sharedClient;
}

export class DatabaseClientService extends Context.Tag("DatabaseClientService")<
  DatabaseClientService,
  DatabaseClient
>() {}

export type DatabaseClient = ReturnType<typeof db>;

export const query = <A>(fn: (db: DatabaseClient) => Promise<A>) =>
  pipe(
    DatabaseClientService,
    Effect.flatMap((db) =>
      Effect.tryPromise({
        try: async () => await fn(db),
        catch: (err) => {
          // If it's already a ServerError, pass it through without re-wrapping
          if (err instanceof ServerError) {
            return err;
          }
          console.error("[Database Query Error]", err);
          return new ServerError({
            tag: "DatabaseQueryError",
            cause: err,
          });
        },
      }),
    ),
  );
