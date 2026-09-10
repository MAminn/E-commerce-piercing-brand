import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Effect, Redacted } from "effect";

// ─── Mock nodemailer ────────────────────────────────────────────────────────
// createTransport is called once inside makeEmailService; we control what
// sendMail does per-test via this mock's return/throw behavior.

const sendMailMock = vi.fn();
const createTransportMock = vi.fn(
  (..._args: unknown[]) => ({ sendMail: sendMailMock }),
);

vi.mock("nodemailer", () => ({
  createTransport: (...args: unknown[]) => createTransportMock(...args),
}));

// Import after the mock is registered so the module under test picks it up.
const { makeEmailService, createDummyEmailService } = await import(
  "#root/shared/email/service"
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function baseInput(overrides?: Partial<Parameters<typeof makeEmailService>[0]>) {
  return {
    smtpHost: "smtp.example.com",
    smtpUser: "login@example.com",
    smtpPassword: Redacted.make("secret"),
    smtpPort: 465,
    ...overrides,
  };
}

describe("makeEmailService", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    sendMailMock.mockResolvedValue({ messageId: "msg-1" });
  });

  it("sends using smtpUser as the From address when no override is given", async () => {
    const service = await Effect.runPromise(makeEmailService(baseInput()));
    const result = await Effect.runPromise(
      service.sendEmail("to@example.com", "Subject", "<p>Body</p>"),
    );

    expect(result).toEqual({ success: true });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "login@example.com",
        to: "to@example.com",
        subject: "Subject",
        html: "<p>Body</p>",
      }),
    );
  });

  it("uses fromAddress/fromName from makeEmailService input when provided", async () => {
    const service = await Effect.runPromise(
      makeEmailService(
        baseInput({ fromAddress: "cr@syntperfumes.com", fromName: "SYNT" }),
      ),
    );
    await Effect.runPromise(
      service.sendEmail("to@example.com", "Subject", "<p>Body</p>"),
    );

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"SYNT" <cr@syntperfumes.com>',
      }),
    );
  });

  it("lets per-call options override the default From address/name", async () => {
    const service = await Effect.runPromise(
      makeEmailService(
        baseInput({ fromAddress: "cr@syntperfumes.com", fromName: "SYNT" }),
      ),
    );
    await Effect.runPromise(
      service.sendEmail("to@example.com", "Subject", "<p>Body</p>", {
        fromAddress: "orders@syntperfumes.com",
        fromName: "SYNT Orders",
        replyTo: "help@syntperfumes.com",
        headers: { "List-Unsubscribe": "<mailto:unsub@syntperfumes.com>" },
      }),
    );

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"SYNT Orders" <orders@syntperfumes.com>',
        replyTo: "help@syntperfumes.com",
        headers: { "List-Unsubscribe": "<mailto:unsub@syntperfumes.com>" },
      }),
    );
  });

  it("returns success:false with an error message when sendMail rejects, without throwing", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("connection refused"));
    const service = await Effect.runPromise(makeEmailService(baseInput()));

    const result = await Effect.runPromise(
      service.sendEmail("to@example.com", "Subject", "<p>Body</p>"),
    );

    expect(result).toEqual({ success: false, error: "connection refused" });
  });

  it("converts embedded base64 data URIs into CID inline attachments", async () => {
    const service = await Effect.runPromise(makeEmailService(baseInput()));
    const tinyPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    await Effect.runPromise(
      service.sendEmail(
        "to@example.com",
        "Subject",
        `<img src="data:image/png;base64,${tinyPngBase64}" />`,
      ),
    );

    const call = sendMailMock.mock.calls[0]?.[0];
    expect(call.html).toContain('src="cid:inline-img-0"');
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0]).toMatchObject({
      filename: "logo.png",
      cid: "inline-img-0",
    });
    expect(Buffer.isBuffer(call.attachments[0].content)).toBe(true);
  });

  it("strips http(s):// prefixes accidentally left on the SMTP host", async () => {
    await Effect.runPromise(
      makeEmailService(baseInput({ smtpHost: "https://smtp.example.com" })),
    );

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.example.com" }),
    );
  });

  it("falls back to a dummy (no-op) service when transport creation throws", async () => {
    createTransportMock.mockImplementationOnce(() => {
      throw new Error("bad config");
    });
    const service = await Effect.runPromise(makeEmailService(baseInput()));

    const result = await Effect.runPromise(
      service.sendEmail("to@example.com", "Subject", "<p>Body</p>"),
    );

    expect(result.success).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("createDummyEmailService", () => {
  it("logs a warning and reports success:false without sending", async () => {
    const warn = vi.fn();
    const service = createDummyEmailService({
      warn,
    } as unknown as Parameters<typeof createDummyEmailService>[0]);

    const result = await Effect.runPromise(
      service.sendEmail("to@example.com", "Subject", "<p>Body</p>"),
    );

    expect(result.success).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
