import Fastify from "fastify";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDevMiddleware, renderPage } from "vike/server";
import { pipe } from "effect";
import drizzleFastifyPlugin from "#root/shared/database/middleware.server.js";
import "dotenv/config";
import { fastifyTRPCMiddleware } from "#root/shared/trpc/middleware.server.js";
import { authFasitfyMiddleware } from "#root/backend/auth/middleware.js";
import { authFastifyPlugin } from "#root/backend/auth/api.js";
import { auth } from "#root/backend/auth/auth.server.js";
import { uploadFileApiPlugin } from "#root/backend/file/upload-file/api";
import { emailServiceMiddleware } from "#root/shared/email/middleware.server";
import { fincartWebhookPlugin } from "#root/backend/orders/fincart-webhook/api.js";
import { bostaWebhookPlugin } from "#root/backend/orders/bosta/webhook-api.js";
import { stripeWebhookPlugin } from "#root/backend/payments/stripe-webhook.js";
import { paymobWebhookPlugin } from "#root/backend/payments/paymob-webhook.js";
import { ensureDefaultStoreVendor } from "#root/shared/database/bootstrap.js";
import { backfillProductSlugs } from "#root/backend/products/slug.js";
import { getTemplateSelectionRaw } from "#root/backend/settings/get-template-selection-raw.js";
import { getLayoutSettingsRaw } from "#root/backend/layout/get-layout-settings-raw.js";
import { getLinkTreeConfigRaw } from "#root/backend/settings/get-link-tree-config.js";
import {
  getTypographySettingsRaw,
  listCustomFontsRaw,
} from "#root/backend/typography/service.js";
import { listActiveClientConfigsRaw } from "#root/backend/pixel-tracking/pixel-config/ssr.js";
import { PixelPlatform } from "#root/shared/types/pixel-tracking.js";
import { getStoreOwnerId } from "#root/shared/config/store.js";
import { trackBeaconPlugin } from "#root/server/routes/track.js";
import { envSyncApiPlugin } from "#root/backend/env-sync/api.js";
import { bootstrapSuperadmin } from "#root/backend/auth/superadmin-bootstrap.js";
import { startEmailAutomationWorker } from "#root/backend/email-automations/worker.js";
import { emailUnsubscribeApiPlugin } from "#root/backend/email-subscription/api.js";

// Normalize env vars — Coolify sometimes injects a leading '=' into values
function normalizeEnv(key: string): string {
  const val = (process.env[key] || "").replace(/^=/, "").trim();
  process.env[key] = val; // Write back so downstream code sees the clean value
  return val;
}
for (const key of [
  "NODE_ENV",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "SUPERADMIN_EMAIL",
  "SUPERADMIN_PASSWORD",
  "PROD_ASSET_ORIGIN",
  "DATABASE_URL",
  "BASE_URL",
  "PUBLIC_ORIGIN",
  "PORT",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM_ADDRESS",
  "EMAIL_FROM_NAME",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "VITE_STRIPE_PUBLIC_KEY",
  "PAYMOB_API_KEY",
  "PAYMOB_INTEGRATION_ID",
  "PAYMOB_IFRAME_ID",
  "PAYMOB_HMAC_SECRET",
]) {
  if (process.env[key]) normalizeEnv(key);
}

const isProduction = process.env.NODE_ENV === "production";

const getRootPath = () => {
  const serverDir = dirname(fileURLToPath(import.meta.url));
  // When running from source (tsx ./server/server.ts), go one level up.
  // When running from build (node build/server/server.js), go two levels up.
  const isBuildDir = serverDir.includes("build");
  return resolve(serverDir, isBuildDir ? "../.." : "..");
};

const root = getRootPath();

const productionFastifyConfig = { logger: true };
const developmentFastifyConfig = {
  logger: {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
};

const port = Number.parseInt(process.env.PORT || "3000", 10) || 3000;
const hmrPort = Number.parseInt(process.env.HMR_PORT || "24678", 10) || 24678;

export const instance = Fastify({
  ...(isProduction ? productionFastifyConfig : developmentFastifyConfig),
  // Fastify's default logger:true logs an "incoming request"/"request
  // completed" pair for every single request, including every static JS
  // chunk and image — floods production logs with noise. Errors/warnings
  // and any explicit request.log.*() calls elsewhere are unaffected; this
  // only silences the automatic per-request info-level pair.
  disableRequestLogging: isProduction,
  trustProxy: true, // Required: app runs behind Coolify/Traefik reverse proxy
  bodyLimit: 100 * 1024 * 1024,
  routerOptions: {
    maxParamLength: 1000, // tRPC batch requests encode comma-separated procedure names in a single :path param
  },
});

// Configure body size limit for all routes
instance.addHook("onRoute", (routeOptions) => {
  // env-sync's /import route sets its own (much larger) bodyLimit at
  // registration time — a full DB+assets snapshot routinely exceeds 100MB.
  if (routeOptions.url?.startsWith("/api/superadmin/sync")) {
    return;
  }
  if (
    routeOptions.method === "POST" ||
    routeOptions.method === "PUT" ||
    routeOptions.method === "PATCH"
  ) {
    routeOptions.bodyLimit = 100 * 1024 * 1024; // 100MB
  }
});

async function buildServer() {
  // Health check endpoint - registered FIRST so it's always reachable
  instance.get("/health", async (_request, reply) => {
    return reply.send({ status: "ok", timestamp: Date.now() });
  });

  // Security headers (CSP is disabled because Vike injects inline scripts)
  await instance.register(import("@fastify/helmet"), {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  // Global rate limiting — generous default, tighter limits on auth routes below
  await instance.register(import("@fastify/rate-limit"), {
    max: 600,
    timeWindow: "1 minute",
  });

  await instance.register(import("@fastify/compress"), {
    global: true,
  });

  await instance.register(import("@fastify/cookie"));

  await instance.register(import("@fastify/multipart"), {
    limits: {
      fileSize: 100 * 1024 * 1024, // 30MB per file
      files: 10, // Allow up to 10 files
      fieldSize: 5 * 1024 * 1024, // 5MB for non-file fields
      parts: 50, // Allow up to 50 parts in the request
      headerPairs: 100, // Allow up to 100 header pairs
    },
  });

  if (isProduction) {
    await instance.register(import("@fastify/static"), {
      root: `${root}/dist/client`,
      decorateReply: false,
      wildcard: false,
    });

    await instance.register(import("@fastify/static"), {
      root: `${root}/assets`,
      decorateReply: false,
      wildcard: false,
      prefix: "/assets",
    });
  } else {
    // Do not use Connect-style middleware
    // in production if possible
    // to preserve performance
    await instance.register(import("@fastify/middie"));

    const viteDevMiddleware = (
      await createDevMiddleware({
        root,
        viteConfig: {
          server: {
            middlewareMode: true,
            hmr: { port: hmrPort },
          },
        },
      })
    ).devMiddleware;

    await instance.use(viteDevMiddleware);
  }

  await instance.register(import("@fastify/static"), {
    root: `${root}/uploads`,
    decorateReply: false,
    wildcard: false,
    prefix: "/uploads",
    // helmet's default Cross-Origin-Resource-Policy: same-origin blocks any
    // cross-origin embedder from loading these files — but uploads (logos,
    // product photos, share images) are deliberately public assets meant to
    // be embedded elsewhere: marketing emails (Gmail/Outlook render message
    // bodies as an opaque/foreign origin), social-preview scrapers, and this
    // admin's own sandboxed (`sandbox=""`, opaque-origin) preview iframe.
    // Same-origin CORP was silently breaking all three.
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  });

  // Dynamic route for uploaded files (wildcard: false only registers files existing at boot)
  instance.get("/uploads/*", async (request, reply) => {
    const filePath = (request.params as { "*": string })["*"];
    const fullPath = `${root}/uploads/${filePath}`;
    reply.header("Cross-Origin-Resource-Policy", "cross-origin");
    const { createReadStream, existsSync } = await import("node:fs");
    if (!existsSync(fullPath)) {
      // Dev-only: DB records synced down from prod (see env-sync) reference
      // files that intentionally stay on prod's storage rather than being
      // copied locally. Fetch the real file from there and stream it back
      // same-origin — a redirect would send the browser straight to prod,
      // and prod's Cross-Origin-Resource-Policy: same-origin header (from
      // helmet) makes browsers silently block that cross-origin image load.
      const fallbackOrigin = !isProduction ? process.env.PROD_ASSET_ORIGIN : "";
      if (fallbackOrigin) {
        try {
          const upstream = await fetch(`${fallbackOrigin}/uploads/${filePath}`);
          if (!upstream.ok || !upstream.body) {
            return reply.code(404).send({ error: "File not found" });
          }
          reply.header(
            "Content-Type",
            upstream.headers.get("content-type") ?? "application/octet-stream",
          );
          const { Readable } = await import("node:stream");
          return reply.send(Readable.fromWeb(upstream.body as import("stream/web").ReadableStream));
        } catch (err) {
          console.error("[uploads fallback] failed to fetch from PROD_ASSET_ORIGIN:", err);
          return reply.code(404).send({ error: "File not found" });
        }
      }
      return reply.code(404).send({ error: "File not found" });
    }
    const stream = createReadStream(fullPath);
    // Determine content type from extension
    const ext = fullPath.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      avif: "image/avif",
      ico: "image/x-icon",
    };
    const contentType = mimeTypes[ext || ""] || "application/octet-stream";
    return reply.type(contentType).send(stream);
  });

  await instance.register(drizzleFastifyPlugin);

  // Bootstrap: Ensure default store vendor exists (single-shop mode)
  await ensureDefaultStoreVendor();

  // Bootstrap: Backfill slugs for products created before URL-slug support
  // shipped. No-op once every product has one — safe to run every boot.
  await backfillProductSlugs();

  await instance.register(emailServiceMiddleware);

  await instance.register(authFasitfyMiddleware);

  await bootstrapSuperadmin(instance);

  // Mount better-auth HTTP handler at /api/auth/*
  // Use auth.handler (Web fetch API) instead of toNodeHandler so Fastify's already-parsed
  // body is re-serialised into a proper Request — no raw stream consumption issues.
  instance.all("/api/auth/*", async (req, reply) => {
    const origin = `${req.protocol}://${req.headers.host || "localhost"}`;
    const url = new URL(req.url, origin);

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val == null) continue;
      if (Array.isArray(val)) { for (const v of val) headers.append(key, v); }
      else headers.set(key, val);
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.body != null;
    const body = hasBody ? JSON.stringify(req.body) : undefined;
    if (hasBody) headers.set("content-type", "application/json");

    const request = new Request(url, { method: req.method, headers, body });
    const response = await auth.handler(request);

    void reply.status(response.status);
    for (const [key, val] of response.headers.entries()) void reply.header(key, val);
    const text = await response.text();
    return reply.send(text);
  });

  await instance.register(fastifyTRPCMiddleware);

  await instance.register(authFastifyPlugin, {
    prefix: "/api/auth",
  });

  await instance.register(uploadFileApiPlugin);

  // Register Fincart webhook endpoint
  await instance.register(fincartWebhookPlugin, {
    prefix: "/api/webhooks/fincart",
  });

  // Register Bosta webhook endpoint (no-ops silently if SYN_BOSTA_KEY is not set)
  await instance.register(bostaWebhookPlugin, {
    prefix: "/api/webhooks/bosta",
  });

  // Register Stripe webhook endpoint (no-ops if Stripe is not configured)
  await instance.register(stripeWebhookPlugin, {
    prefix: "/api/webhooks/stripe",
  });

  // Register Paymob webhook endpoint (no-ops if Paymob is not configured)
  await instance.register(paymobWebhookPlugin, {
    prefix: "/api/webhooks/paymob",
  });

  // Register tracking beacon endpoint
  await instance.register(trackBeaconPlugin, {
    prefix: "/api/track",
  });

  // Superadmin-only prod->dev environment sync (export/import full DB + uploads)
  await instance.register(envSyncApiPlugin, {
    prefix: "/api/superadmin/sync",
    rootDir: root,
  });

  // RFC 8058 one-click unsubscribe endpoint (mail clients POST here directly)
  await instance.register(emailUnsubscribeApiPlugin, {
    prefix: "/api/unsubscribe",
  });

  // Add product detail route handler - updated to new format
  instance.get("/shop/@productId", async (request, reply) => {
    const pageContextInit = {
      urlOriginal: request.url,
      headersOriginal: request.headers,
      routeParams: request.params,
      db: request.db,
      clientSession: request.clientSession,
    };
    const pageContext = await renderPage(pageContextInit);
    const { httpResponse } = pageContext;

    if (!httpResponse) {
      return reply.code(404).send("Product page not found");
    }

    reply.status(httpResponse.statusCode);

    for (const [name, value] of Object.entries(httpResponse.headers)) {
      if (value) reply.header(name, value);
    }

    httpResponse.pipe(reply.raw);

    return reply;
  });

  instance.all(
    "/*",
    {
      logLevel: "silent",
    },
    async (request, reply) => {
      // Fetch template selection for SSR to prevent hydration flicker
      const templateSelection = await getTemplateSelectionRaw(request.db);
      // Fetch layout settings for SSR to prevent navbar/footer flicker
      const activeLandingTemplate = templateSelection?.landing;
      const layoutSettingsData = await getLayoutSettingsRaw(
        request.db,
        getStoreOwnerId(),
        activeLandingTemplate,
      );
      // Fetch brand name from link-tree config for dynamic page titles
      const linkTreeConfig = await getLinkTreeConfigRaw(request.db);
      const brandName = linkTreeConfig.brandName || undefined;
      // Fetch admin-configured typography (custom fonts + role assignments)
      // for SSR so the correct @font-face/CSS vars render on first paint
      const typographySettings = await getTypographySettingsRaw(request.db);
      const customFonts = await listCustomFontsRaw(request.db);
      // Fetch the active GA4 config for SSR so the gtag script is present in
      // the raw HTML rather than only loading after client hydration/tRPC
      const activePixelConfigs = await listActiveClientConfigsRaw(request.db);
      const activeGA4PixelId =
        activePixelConfigs.find((p) => p.platform === PixelPlatform.GOOGLE_GA4)
          ?.pixelId ?? null;

      // Read locale from cookie for SSR (prevents EN→AR flicker)
      const cookieHeader = request.headers.cookie ?? "";
      const localeMatch = cookieHeader.match(/(?:^|;\s*)minimal-locale=(en|ar)/);
      const ssrLocale = (localeMatch?.[1] as "en" | "ar") ?? "en";

      const pageContextInit = {
        urlOriginal: request.raw.url || "",
        headersOriginal: request.headers,
        db: request.db,
        clientSession: request.clientSession,
        templateSelection,
        layoutSettingsData,
        brandName,
        ssrLocale,
        typographySettings,
        customFonts,
        activeGA4PixelId,
      };

      let pageContext: Awaited<ReturnType<typeof renderPage>>;
      try {
        pageContext = await renderPage(pageContextInit);
      } catch (err) {
        console.error(
          `[Vike Error] renderPage threw for ${request.raw.url}:`,
          err,
        );
        return reply.code(500).send("Internal Server Error");
      }
      const { httpResponse } = pageContext;
      if (!httpResponse) {
        console.warn(`[Vike 404] No httpResponse for: ${request.raw.url}`);
        return reply.callNotFound();
      }

      const { statusCode, headers } = httpResponse;
      for (const header of headers) {
        reply.raw.setHeader(header[0], header[1]);
      }

      reply.status(statusCode);
      httpResponse.pipe(reply.raw);
      return reply;
    },
  );

  await instance.ready();
  return instance;
}

async function main() {
  console.info(
    `[Startup] NODE_ENV=${process.env.NODE_ENV}, isProduction=${isProduction}`,
  );
  console.info(`[Startup] Root path: ${root}`);
  console.info(`[Startup] Port: ${port}`);

  // Verify dist directory exists in production
  if (isProduction) {
    const { existsSync } = await import("node:fs");
    const distServerExists = existsSync(`${root}/dist/server/entry.mjs`);
    const distClientExists = existsSync(`${root}/dist/client`);
    console.info(`[Startup] dist/server/entry.mjs exists: ${distServerExists}`);
    console.info(`[Startup] dist/client exists: ${distClientExists}`);
    if (!distServerExists) {
      console.error(
        "[Startup] CRITICAL: dist/server/entry.mjs missing! Vike pages will not work.",
      );
    }
  }

  const fastify = await buildServer();

  await startEmailAutomationWorker();

  fastify.listen({ port: port, host: "0.0.0.0" }, (err) => {
    console.info(`Server running at http://localhost:${port}`);
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  });
}

main();
