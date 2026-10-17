import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { ClientSession } from "#root/backend/auth/shared/entities";
import { appRouter } from "../router";
import { adminProcedure, protectedProcedure } from "../server";

/**
 * Router-wide authorization contract.
 *
 * Every tRPC procedure is classified here. Anything NOT on the two allowlists
 * below is an admin procedure and must:
 *   • reject an anonymous caller with UNAUTHORIZED,
 *   • reject a signed-in customer (role "user") with FORBIDDEN,
 *   • carry the adminProcedure role gate in its middleware chain,
 *   • let an admin and a superadmin through the gate.
 *
 * A new procedure therefore defaults to "must be admin": adding a public or
 * customer endpoint means adding it to an allowlist below, on purpose, in a
 * reviewed diff. That is the regression net for the hole fixed alongside this
 * test — `homepage.updateContent` was protectedProcedure with no role check,
 * so any signed-in customer could overwrite the homepage CMS.
 */

/** Storefront procedures any visitor may call. */
const PUBLIC = new Set([
  "demo",
  "category.view",
  "category.viewMain",
  "category.getContent",
  "product.view",
  "product.search",
  // Filter counts + price bounds over the same visible products as search.
  "product.facets",
  "product.getReviews",
  "product.createReview",
  "product.uploadReviewImage",
  "product.getProductImages",
  "product.getCategories",
  "product.getById",
  "product.getByIds",
  "order.create",
  "order.bosta.checkoutIsEnabled",
  "order.bosta.listShippingLocations",
  "promoCode.listPublic",
  "promoCode.validate",
  "homepage.getContent",
  "layout.getSettings",
  "pixelTracking.trackEvent",
  "pixelTracking.config.listActive",
  "pixelTracking.customEvents.listActive",
  "pixelTracking.attribution.record",
  "pixelTracking.consent.record",
  "pixelTracking.consent.update",
  "pixelTracking.consent.bySession",
  "payment.methods",
  "payment.createSession",
  "payment.verify",
  "settings.getShippingFee",
  "settings.getTemplateSelection",
  "settings.getLinkTreeConfig",
  "settings.getVariantPresets",
  "settings.getComingSoonMode",
  "settings.getProductPageContent",
  "settings.subscribeNewsletter",
  "settings.subscribeComingSoon",
  "contact.submit",
  "offer.listActive",
  "offer.evaluate",
  "bundle.listLive",
  "bundle.getLiveBySlug",
  "bundle.evaluateSelection",
  "emailSubscription.getStatus",
  "emailSubscription.unsubscribe",
  "emailSubscription.resubscribe",
  "popup.getPublicConfig",
  "popup.claim",
  "cartCapture.sync",
  "cartCapture.attachEmail",
  "cartCapture.markConverted",
  "cartCapture.recordProductView",
  "shipping.destinations",
  "shipping.quote",
]);

/** Signed-in, any role — scoped to the caller's own data. */
const CUSTOMER = new Set([
  "auth.me",
  "auth.updateProfile",
  "auth.changePassword",
  // Customers see only their own orders — see orders-scoping.integration.test.ts.
  "order.view",
]);

type ProcedureDef = { _def: { middlewares: unknown[]; inputs: unknown[]; query?: boolean; mutation?: boolean } };
const procedures = (appRouter as unknown as { _def: { procedures: Record<string, ProcedureDef> } })._def.procedures;
const allPaths = Object.keys(procedures).sort();

const middlewaresOf = (p: unknown) => (p as ProcedureDef)._def.middlewares;
const loginGate = middlewaresOf(protectedProcedure)[0];
const adminGate = middlewaresOf(adminProcedure).find((m) => m !== loginGate);

const ADMIN_PATHS = allPaths.filter((p) => !PUBLIC.has(p) && !CUSTOMER.has(p));

function session(role: ClientSession["role"]): ClientSession {
  return {
    id: `${role}-id`,
    token: "hashed-token",
    email: `${role}@example.test`,
    name: role,
    phone: "",
    expiresAt: new Date(Date.now() + 3_600_000),
    role,
    emailVerified: true,
    profilePicture: null,
  } as ClientSession;
}

/** A db that fails loudly if any resolver ever reaches it. */
const unreachableDb = new Proxy(
  {},
  {
    get() {
      throw new Error("resolver reached the database — the auth gate did not stop it");
    },
  },
);

function callerFor(clientSession: ClientSession | undefined) {
  return appRouter.createCaller({
    db: unreachableDb,
    clientSession,
    emailService: undefined,
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  } as never);
}

/** Calls `path` with `input` and returns the TRPCError code (or "OK" / "NON_TRPC"). */
async function codeOf(clientSession: ClientSession | undefined, path: string, input: unknown): Promise<string> {
  const proc = path
    .split(".")
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], callerFor(clientSession)) as (
    i: unknown,
  ) => Promise<unknown>;
  try {
    await proc(input);
    return "OK";
  } catch (err) {
    return err instanceof TRPCError ? err.code : "NON_TRPC";
  }
}

describe("tRPC authorization contract", () => {
  it("classifies every procedure (allowlists name only real procedures)", () => {
    expect(allPaths.length).toBeGreaterThan(100);
    for (const path of [...PUBLIC, ...CUSTOMER]) expect(allPaths, path).toContain(path);
    expect(adminGate).toBeTypeOf("function");
  });

  it("the homepage CMS mutations are admin-only", () => {
    expect(ADMIN_PATHS).toEqual(
      expect.arrayContaining([
        "homepage.updateContent",
        "homepage.uploadHeroImage",
        "homepage.uploadMobileHeroImage",
        "file.upload",
      ]),
    );
  });

  it("every admin procedure carries the admin role gate", () => {
    const missing = ADMIN_PATHS.filter((path) => !middlewaresOf(procedures[path]).includes(adminGate));
    expect(missing).toEqual([]);
  });

  it("customer procedures require a session", () => {
    const missing = [...CUSTOMER].filter((path) => !middlewaresOf(procedures[path]).includes(loginGate));
    expect(missing).toEqual([]);
  });

  it("anonymous → every admin and customer procedure is UNAUTHORIZED", async () => {
    const leaks: string[] = [];
    for (const path of [...ADMIN_PATHS, ...CUSTOMER]) {
      const code = await codeOf(undefined, path, undefined);
      if (code !== "UNAUTHORIZED") leaks.push(`${path} → ${code}`);
    }
    expect(leaks).toEqual([]);
  });

  it("customer (role user) → every admin procedure is FORBIDDEN", async () => {
    const leaks: string[] = [];
    for (const path of ADMIN_PATHS) {
      const code = await codeOf(session("user"), path, undefined);
      if (code !== "FORBIDDEN") leaks.push(`${path} → ${code}`);
    }
    expect(leaks).toEqual([]);
  });

  it("a vendor role is not an admin either", async () => {
    for (const path of ["homepage.updateContent", "users.list", "order.stats", "bundle.create"]) {
      expect(await codeOf(session("vendor"), path, undefined), path).toBe("FORBIDDEN");
    }
  });

  it("admin and superadmin pass the gate (stopped only by input validation)", async () => {
    // A Symbol is never valid input, so validation — which runs AFTER the role
    // gate — rejects it and no resolver (or side effect) ever runs. Procedures
    // without an input parser are covered by the structural gate check above.
    const withInput = ADMIN_PATHS.filter((path) => procedures[path]!._def.inputs.length > 0);
    expect(withInput.length).toBeGreaterThan(50);
    for (const role of ["admin", "superadmin"] as const) {
      const blocked: string[] = [];
      for (const path of withInput) {
        const code = await codeOf(session(role), path, Symbol("invalid"));
        if (code === "UNAUTHORIZED" || code === "FORBIDDEN") blocked.push(`${path} → ${code}`);
      }
      expect(blocked, role).toEqual([]);
    }
  });
});
