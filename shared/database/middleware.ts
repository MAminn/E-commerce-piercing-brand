import type { Get, UniversalMiddleware } from "@universal-middleware/core";
import {
  type DatabaseClient,
  db as getDb,
} from "#root/shared/database/drizzle/db";
import { createMiddleware } from "hono/factory";

declare module "hono" {
  interface Variables {
    db: DatabaseClient;
  }
}

export const dbHonoMiddleware = createMiddleware(
  async (c, next) => {
    c.set("db", getDb());
    await next();
  }
);
