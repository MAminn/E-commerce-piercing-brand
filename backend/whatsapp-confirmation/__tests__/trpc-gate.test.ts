import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
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
    expect(await caller(null).whatsappConfirmation.checkoutOptIn()).toEqual({ enabled: false });
  });
});
