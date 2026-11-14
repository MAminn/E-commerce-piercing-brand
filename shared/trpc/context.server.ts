import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { pickGa4PurchaseCookies } from "#root/backend/pixel-tracking/ga4-purchase/identifiers";
export function createContext({ req }: CreateFastifyContextOptions) {
  const db = req.db;
  return {
    db,
    clientSession: req.clientSession,
    emailService: req.emailService,
    // req.ip respects Fastify's trustProxy config (set in server.ts), so
    // this is the real client IP behind Coolify/Traefik, not the proxy's.
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    // `_ga`, `_ga_<id>` and `_tracking_consent` only — read by order.create
    // for the server-owned GA4 purchase (GA4_PURCHASE_OWNER).
    ga4Cookies: pickGa4PurchaseCookies((req as { cookies?: Record<string, string | undefined> }).cookies),
  };
}
export type Context = Awaited<ReturnType<typeof createContext>>;
