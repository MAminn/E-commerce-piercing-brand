import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Nothing may be written or exported: the role gates run before either.
vi.mock("#root/backend/homepage/upload-hero-video/index", () => ({
  HeroVideoUploadError: class extends Error {},
  saveHeroVideoUpload: () => {
    throw new Error("hero video saved without an admin session");
  },
}));
vi.mock("#root/backend/env-sync/export", () => ({
  streamFullExport: () => {
    throw new Error("database exported without a superadmin session");
  },
}));
vi.mock("#root/backend/env-sync/import", () => ({
  importFullExport: () => {
    throw new Error("database imported without a superadmin session");
  },
}));

import { heroVideoUploadApiPlugin } from "#root/backend/homepage/upload-hero-video/api";
import { envSyncApiPlugin } from "#root/backend/env-sync/api";

/**
 * The admin-only REST routes (outside tRPC) enforce the role server-side,
 * from the session — never from anything the client sends.
 */
let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify();
  await app.register(import("@fastify/multipart"));
  // Stand-in for authFasitfyMiddleware: the role comes from a test header.
  app.decorateRequest("clientSession", undefined);
  app.addHook("onRequest", async (req) => {
    const role = req.headers["x-test-role"];
    req.clientSession =
      typeof role === "string" ? ({ id: "u1", role } as unknown as typeof req.clientSession) : undefined;
  });
  await app.register(heroVideoUploadApiPlugin, { prefix: "/api/homepage", rootDir: "." });
  await app.register(envSyncApiPlugin, { prefix: "/api/superadmin/sync", rootDir: "." });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const as = (role: string | null) => (role ? { "x-test-role": role } : {});

describe("POST /api/homepage/hero-video", () => {
  it.each([null, "user", "vendor"])("denies %s with 403", async (role) => {
    const res = await app.inject({ method: "POST", url: "/api/homepage/hero-video", headers: as(role) });
    expect(res.statusCode).toBe(403);
  });

  it.each(["admin", "superadmin"])("lets %s past the role gate", async (role) => {
    // Not multipart, so the route stops at body validation — after the gate.
    const res = await app.inject({ method: "POST", url: "/api/homepage/hero-video", headers: as(role) });
    expect(res.statusCode).toBe(400);
  });
});

describe("superadmin env-sync", () => {
  it.each([null, "user", "vendor", "admin"])("GET /export denies %s with 403", async (role) => {
    const res = await app.inject({ method: "GET", url: "/api/superadmin/sync/export", headers: as(role) });
    expect(res.statusCode).toBe(403);
  });

  it.each([null, "user", "vendor", "admin"])("POST /import denies %s with 403", async (role) => {
    const res = await app.inject({ method: "POST", url: "/api/superadmin/sync/import", headers: as(role) });
    expect(res.statusCode).toBe(403);
  });
});
