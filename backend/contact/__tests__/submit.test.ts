import { describe, expect, it, vi, beforeEach } from "vitest";
import { Effect, Redacted } from "effect";
import type { EmailServiceInterface } from "#root/shared/email/service";

/**
 * Contact form delivery must fail closed.
 *
 * `EmailServiceInterface.sendEmail` reports failure on its SUCCESS channel —
 * it resolves `{ success: false, error }` instead of rejecting — so that a
 * transactional send can never roll back the operation that triggered it. The
 * dummy service installed whenever SMTP is unconfigured does that on every
 * call. The contact handler used to ignore the returned value and answer
 * `{ success: true }` regardless, so an unconfigured store told every
 * customer their message had been sent while nothing was delivered and no
 * record of the submission existed anywhere.
 */

// ─── Layout settings (the contact destination) ──────────────────────────────

let contactEmail: string | undefined = "shop@example.com";
vi.mock("#root/backend/layout/get-layout-settings/index", () => ({
  getLayoutSettings: async () => ({ header: { contactEmail } }),
}));

// ─── nodemailer, for the real-transport cases ───────────────────────────────

const sendMailMock = vi.fn();
vi.mock("nodemailer", () => ({
  createTransport: () => ({ sendMail: sendMailMock }),
}));

const { contactRouter } = await import("#root/backend/contact/trpc");
const { makeEmailService, createDummyEmailService } = await import(
  "#root/shared/email/service"
);

const input = {
  name: "Nour",
  email: "nour@example.com",
  message: "Do you carry titanium threadless?",
};

const submit = (emailService: EmailServiceInterface) =>
  contactRouter.createCaller({ emailService } as never).submit(input);

const realService = () =>
  Effect.runPromise(
    makeEmailService({
      smtpHost: "smtp.example.com",
      smtpUser: "login@example.com",
      smtpPassword: Redacted.make("secret"),
      smtpPort: 465,
    }),
  );

const silentLogger = { warn: () => {} };

beforeEach(() => {
  contactEmail = "shop@example.com";
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue({ messageId: "msg-1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("contact.submit — blank destination", () => {
  it("refuses when no contact email is configured", async () => {
    contactEmail = "";
    const result = await submit(createDummyEmailService(silentLogger));
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
  });

  it("refuses when the configured contact email is only whitespace", async () => {
    contactEmail = "   ";
    const result = await submit(createDummyEmailService(silentLogger));
    expect(result.success).toBe(false);
  });

  it("refuses when the setting is absent entirely", async () => {
    contactEmail = undefined;
    const result = await submit(createDummyEmailService(silentLogger));
    expect(result.success).toBe(false);
  });
});

describe("contact.submit — missing SMTP (dummy service)", () => {
  it("never reports success through the dummy email service", async () => {
    // THE regression: this is what every store returns before SMTP is set up.
    const result = await submit(createDummyEmailService(silentLogger));
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
  });

  it("gives the customer a neutral message, not the internal reason", async () => {
    const result = await submit(createDummyEmailService(silentLogger));
    expect(result.success).toBe(false);
    const message = (result as { error: string }).error;
    expect(message).toBe("Failed to send message. Please try again later.");
    expect(message).not.toMatch(/dummy/i);
    expect(message).not.toMatch(/smtp/i);
  });

  it("sends nothing through nodemailer in that state", async () => {
    await submit(createDummyEmailService(silentLogger));
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("contact.submit — successful delivery", () => {
  it("reports success only once the transport accepted the message", async () => {
    const result = await submit(await realService());
    expect(result.success).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it("addresses the message to the configured destination", async () => {
    contactEmail = "  hello@perce.example  ";
    await submit(await realService());
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hello@perce.example" }),
    );
  });

  it("escapes the customer's input in the delivered HTML", async () => {
    const service = await realService();
    await contactRouter
      .createCaller({ emailService: service } as never)
      .submit({ ...input, message: "<script>alert(1)</script>" });
    const html = sendMailMock.mock.calls[0]?.[0]?.html as string;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("contact.submit — delivery failure", () => {
  it("reports failure when the transport rejects the message", async () => {
    sendMailMock.mockRejectedValue(new Error("EAUTH: bad credentials"));
    const result = await submit(await realService());
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
  });

  it("does not leak the transport's error to the customer", async () => {
    sendMailMock.mockRejectedValue(new Error("EAUTH: bad credentials"));
    const result = await submit(await realService());
    const message = (result as { error: string }).error;
    expect(message).not.toMatch(/EAUTH/);
    expect(message).not.toMatch(/credentials/i);
  });

  it("reports failure when the send effect itself throws", async () => {
    const throwing: EmailServiceInterface = {
      sendEmail: () =>
        Effect.promise(() => Promise.reject(new Error("socket hang up"))) as never,
    };
    const result = await submit(throwing);
    expect(result.success).toBe(false);
  });

  it("reports failure when the service returns nothing usable", async () => {
    const malformed = {
      sendEmail: () => Effect.succeed(undefined),
    } as unknown as EmailServiceInterface;
    const result = await submit(malformed);
    expect(result.success).toBe(false);
  });
});
