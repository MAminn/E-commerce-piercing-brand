import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
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
  };
}
export type Context = Awaited<ReturnType<typeof createContext>>;
