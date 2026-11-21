import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Password-reset / verification emails (better-auth). Regression: they used
 * a hard-coded `secure: true` transport (a port-587 provider could never
 * send them) and a bare SMTP login as From, unlike every other email.
 * No real SMTP: nodemailer is mocked.
 */

const sendMailMock = vi.fn();
const createTransportMock = vi.fn((..._args: unknown[]) => ({ sendMail: sendMailMock }));
vi.mock("nodemailer", () => ({
  createTransport: (...args: unknown[]) => createTransportMock(...args),
}));

const { sendAuthEmail } = await import("#root/backend/auth/auth-email");

const env = (overrides: Record<string, string | undefined> = {}) =>
  ({
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "login@perce.test",
    SMTP_PASSWORD: "secret",
    ...overrides,
  }) as NodeJS.ProcessEnv;

describe("sendAuthEmail", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    sendMailMock.mockResolvedValue({ messageId: "<m@perce.test>", accepted: ["to@example.com"], rejected: [] });
  });

  it.each([
    ["587", false],
    ["465", true],
  ])("follows the port for TLS (port %s → secure=%s) with transport timeouts", async (port, secure) => {
    await sendAuthEmail("to@example.com", "S", "<p>B</p>", env({ SMTP_PORT: port }));
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        port: Number(port),
        secure,
        requireTLS: !secure,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 45_000,
      }),
    );
  });

  it("honours SMTP_SECURE over the port rule", async () => {
    await sendAuthEmail("to@example.com", "S", "<p>B</p>", env({ SMTP_PORT: "2465", SMTP_SECURE: "true" }));
    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });

  it("uses the same sending identity as order emails (From address + store name, Reply-To)", async () => {
    await sendAuthEmail(
      "to@example.com",
      "S",
      "<p>B</p>",
      env({ EMAIL_FROM_ADDRESS: "orders@perce.test", EMAIL_FROM_NAME: "Percé", EMAIL_REPLY_TO: "help@perce.test" }),
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: '"Percé" <orders@perce.test>', replyTo: "help@perce.test", to: "to@example.com" }),
    );
  });

  it("falls back to the SMTP login as From when EMAIL_FROM_ADDRESS is unset", async () => {
    await sendAuthEmail("to@example.com", "S", "<p>B</p>", env());
    expect(sendMailMock.mock.calls[0]![0].from).toMatch(/<login@perce\.test>$/);
  });

  it("never throws; reports a failure without the full address", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      sendMailMock.mockRejectedValueOnce(Object.assign(new Error("Invalid login"), { responseCode: 535 }));
      const result = await sendAuthEmail("customer.private@example.com", "S", "<p>B</p>", env());
      expect(result).toEqual({ success: false, error: "Invalid login" });
      const logged = error.mock.calls.flat().map(String).join(" ");
      expect(logged).toContain("cu***@example.com");
      expect(logged).toContain("[535]");
      expect(logged).not.toContain("customer.private@example.com");
      expect(logged).not.toContain("secret");
    } finally {
      error.mockRestore();
    }
  });

  it("treats a rejected recipient as a failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      sendMailMock.mockResolvedValueOnce({ accepted: [], rejected: ["to@example.com"], response: "550 no such user" });
      const result = await sendAuthEmail("to@example.com", "S", "<p>B</p>", env());
      expect(result.success).toBe(false);
    } finally {
      error.mockRestore();
    }
  });

  it("skips (no transport) when SMTP is not configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await sendAuthEmail("to@example.com", "S", "<p>B</p>", env({ SMTP_HOST: "" }));
      expect(result.success).toBe(false);
      expect(createTransportMock).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
