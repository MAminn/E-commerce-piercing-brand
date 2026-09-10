import type { FastifyInstance } from "fastify";
import { db } from "./drizzle/db.js";
import fp from "fastify-plugin";
import { runMigrations } from "./auto-migrate.js";

declare module "fastify" {
  interface FastifyInstance {
    db: ReturnType<typeof db>;
  }
  interface FastifyRequest {
    db: ReturnType<typeof db>;
  }
}

const drizzleFastifyPlugin = fp(async (app: FastifyInstance) => {
  try {
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    // Run migrations before creating the Drizzle instance
    await runMigrations();

    const dbInstance = db();

    // Test the connection
    try {
      await dbInstance.execute("SELECT 1");
    } catch (connectionError) {
      console.error(
        "[DB Middleware] ERROR: Failed to connect to database:",
        connectionError,
      );
      throw connectionError;
    }

    app.decorate("db", {
      getter() {
        return dbInstance;
      },
    });

    app.decorateRequest("db", {
      getter() {
        return dbInstance;
      },
    });
  } catch (error) {
    console.error(
      "[DB Middleware] FATAL ERROR during database middleware initialization:",
      error,
    );
    throw error; // Rethrow to prevent server startup with a broken DB connection
  }
});

export default drizzleFastifyPlugin;
