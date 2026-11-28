import { TRPCError } from "@trpc/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "#root/shared/trpc/router";

/**
 * The two superadmin-only WhatsApp procedures sit on the shared admin gate
 * (required by shared/trpc/__tests__/authorization.test.ts) plus a
 * superadmin check after input validation. Valid input here, so the only
 * thing that can stop an admin is that superadmin check. The feature is off
 * (no boot status), so a superadmin is stopped by `assertOn` / the shadow
 * check — never by the role gate — and no resolver reaches the database.
 */
const unreachableDb = new Proxy(
  {},
  {
    get() {
      throw new Error("resolver reached the database");
    },
  },
);

const caller = (role: "user" | "admin" | "superadmin" | null) =>
  appRouter.createCaller({
    db: unreachableDb,
    clientSession: role
      ? { id: `${role}-id`, token: "t", email: `${role}@example.test`, name: role, phone: "", expiresAt: new Date(Date.now() + 3_600_000), role, emailVerified: true, profilePicture: null }
      : undefined,
    emailService: undefined,
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  } as never);

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (err) {
    return err instanceof TRPCError ? err.code : `NON_TRPC:${(err as Error).message}`;
  }
}

const ORDER_ID = "00000000-0000-4000-8000-000000000001";

describe("whatsappConfirmation superadmin-only procedures", () => {
  it("anonymous → UNAUTHORIZED, user / admin → FORBIDDEN", async () => {
    for (const [role, expected] of [
      [null, "UNAUTHORIZED"],
      ["user", "FORBIDDEN"],
      ["admin", "FORBIDDEN"],
    ] as const) {
      const c = caller(role).whatsappConfirmation;
      expect(await codeOf(c.setDailyCap({ cap: 50 })), `${role} setDailyCap`).toBe(expected);
      expect(await codeOf(c.simulateReply({ orderId: ORDER_ID, action: "confirm" })), `${role} simulateReply`).toBe(expected);
    }
  });

  it("superadmin passes the role gates (stopped only by the feature being off)", async () => {
    const c = caller("superadmin").whatsappConfirmation;
    expect(await codeOf(c.setDailyCap({ cap: 50 }))).toBe("PRECONDITION_FAILED");
    expect(await codeOf(c.simulateReply({ orderId: ORDER_ID, action: "confirm" }))).toBe("PRECONDITION_FAILED");
  });

  it("checkoutOptIn is public and reports off without a boot status", async () => {
    expect(await caller(null).whatsappConfirmation.checkoutOptIn()).toEqual({ enabled: false, required: false });
  });
});

describe("whatsappConfirmation.checkoutOptIn — per effective mode (anonymous caller, no DB)", () => {
  const ALLOWED = "01009990001";
  const OTHER = "01009990002";
  const saved = process.env.WHATSAPP_PILOT_ALLOWLIST;
  const savedRequired = process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED;
  let cfg: typeof import("#root/shared/config/whatsapp-confirmation");

  const boot = (mode: "off" | "shadow" | "pilot" | "live") =>
    cfg.setWhatsAppConfirmBootStatus({ requestedMode: mode, effectiveMode: mode, tablesReady: true, problems: [], checkedAt: new Date().toISOString() });
  const ask = async (phone?: string) => (await caller(null).whatsappConfirmation.checkoutOptIn(phone === undefined ? undefined : { phone })).enabled;

  beforeAll(async () => {
    cfg = await import("#root/shared/config/whatsapp-confirmation");
    process.env.WHATSAPP_PILOT_ALLOWLIST = "201009990001";
  });
  afterEach(() => {
    cfg.setWhatsAppConfirmBootStatus(null);
    Reflect.deleteProperty(process.env, "WHATSAPP_CHECKOUT_CONSENT_REQUIRED");
  });
  afterAll(() => {
    if (saved === undefined) Reflect.deleteProperty(process.env, "WHATSAPP_PILOT_ALLOWLIST");
    else process.env.WHATSAPP_PILOT_ALLOWLIST = saved;
    if (savedRequired !== undefined) process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED = savedRequired;
  });

  it("off: hidden, with or without a number", async () => {
    boot("off");
    expect([await ask(), await ask(ALLOWED), await ask(OTHER)]).toEqual([false, false, false]);
  });

  it("shadow: hidden, even for an allow-listed number", async () => {
    boot("shadow");
    expect([await ask(), await ask(ALLOWED), await ask(OTHER)]).toEqual([false, false, false]);
  });

  it("pilot: shown only for an allow-listed number", async () => {
    boot("pilot");
    expect([await ask(), await ask(ALLOWED), await ask("+20 100 999 0001"), await ask(OTHER)]).toEqual([false, true, true, false]);
  });

  it("live: shown for everyone", async () => {
    boot("live");
    expect([await ask(), await ask(ALLOWED), await ask(OTHER)]).toEqual([true, true, true]);
  });

  it("required: only with WHATSAPP_CHECKOUT_CONSENT_REQUIRED=true, and only where the box is shown", async () => {
    const req = async (phone?: string) => (await caller(null).whatsappConfirmation.checkoutOptIn(phone === undefined ? undefined : { phone })).required;
    boot("live");
    expect([await req(ALLOWED), await req(OTHER)]).toEqual([false, false]);
    process.env.WHATSAPP_CHECKOUT_CONSENT_REQUIRED = "true";
    expect([await req(ALLOWED), await req(OTHER)]).toEqual([true, true]);
    boot("pilot");
    expect([await req(ALLOWED), await req(OTHER)]).toEqual([true, false]);
    boot("shadow");
    expect([await req(ALLOWED), await req(OTHER)]).toEqual([false, false]);
  });

  it("returns only { enabled, required } and rejects an oversized phone", async () => {
    boot("live");
    expect(Object.keys(await caller(null).whatsappConfirmation.checkoutOptIn({ phone: ALLOWED })).sort()).toEqual(["enabled", "required"]);
    expect(await codeOf(caller(null).whatsappConfirmation.checkoutOptIn({ phone: "1".repeat(41) }))).toBe("BAD_REQUEST");
  });
});
