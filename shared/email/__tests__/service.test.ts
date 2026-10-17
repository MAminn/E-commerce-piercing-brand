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
const { makeEmailService, createDummyEmailService, resolveSmtpTransportSecurity } = await import(
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
        baseInput({ fromAddress: "cr@example-store.com", fromName: "Example" }),
      ),
    );
    await Effect.runPromise(
      service.sendEmail("to@example.com", "Subject", "<p>Body</p>"),
    );

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Example" <cr@example-store.com>',
      }),
    );
  });

  it("lets per-call options override the default From address/name", async () => {
    const service = await Effect.runPromise(
      makeEmailService(
        baseInput({ fromAddress: "cr@example-store.com", fromName: "Example" }),
      ),
    );
    await Effect.runPromise(
      service.sendEmail("to@example.com", "Subject", "<p>Body</p>", {
        fromAddress: "orders@example-store.com",
        fromName: "Example Orders",
        replyTo: "help@example-store.com",
        headers: { "List-Unsubscribe": "<mailto:unsub@example-store.com>" },
      }),
    );

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Example Orders" <orders@example-store.com>',
        replyTo: "help@example-store.com",
        headers: { "List-Unsubscribe": "<mailto:unsub@example-store.com>" },
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

// ─── TLS mode, Reply-To, start-up verification ──────────────────────────────

describe("SMTP transport security", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    sendMailMock.mockResolvedValue({ messageId: "msg-1" });
  });

  it("derives TLS from the port: 465 implicit TLS, 587 STARTTLS (required)", () => {
    expect(resolveSmtpTransportSecurity(465)).toEqual({ secure: true, requireTLS: false });
    expect(resolveSmtpTransportSecurity(587)).toEqual({ secure: false, requireTLS: true });
    expect(resolveSmtpTransportSecurity(2525)).toEqual({ secure: false, requireTLS: true });
  });

  it("lets SMTP_SECURE override the port rule", () => {
    expect(resolveSmtpTransportSecurity(587, true)).toEqual({ secure: true, requireTLS: false });
    expect(resolveSmtpTransportSecurity(465, false)).toEqual({ secure: false, requireTLS: true });
  });

  it.each([
    [465, true],
    [587, false],
  ])("configures nodemailer for port %i with secure=%s (no more hard-coded secure:true)", async (port, secure) => {
    await Effect.runPromise(makeEmailService(baseInput({ smtpPort: port })));
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port, secure, requireTLS: !secure }),
    );
  });
});

describe("default Reply-To", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: "msg-1" });
  });

  it("applies the configured Reply-To to every send", async () => {
    const service = await Effect.runPromise(
      makeEmailService(baseInput({ replyTo: "piercingperce@gmail.com" })),
    );
    await Effect.runPromise(service.sendEmail("to@example.com", "Subject", "<p>Body</p>"));
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "piercingperce@gmail.com" }),
    );
  });

  it("still lets a single send choose its own Reply-To", async () => {
    const service = await Effect.runPromise(
      makeEmailService(baseInput({ replyTo: "piercingperce@gmail.com" })),
    );
    await Effect.runPromise(
      service.sendEmail("to@example.com", "Subject", "<p>Body</p>", { replyTo: "other@example.com" }),
    );
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "other@example.com" }));
  });
});

describe("start-up SMTP verification", () => {
  it("logs the outcome without the login or password", async () => {
    const verify = vi.fn().mockRejectedValue(Object.assign(new Error("Invalid login"), { code: "EAUTH" }));
    createTransportMock.mockImplementationOnce(() => ({ sendMail: sendMailMock, verify }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await Effect.runPromise(
      makeEmailService(baseInput({ smtpPort: 587, verifyOnStart: true })),
    );
    await vi.waitFor(() => expect(error).toHaveBeenCalled());

    expect(verify).toHaveBeenCalledTimes(1);
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("SMTP verification FAILED");
    expect(logged).toContain("smtp.example.com:587 (STARTTLS)");
    expect(logged).toContain("EAUTH");
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("login@example.com");
    error.mockRestore();
  });
});
