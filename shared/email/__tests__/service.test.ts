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
const {
  makeEmailService,
  createDummyEmailService,
  resolveSmtpTransportSecurity,
  maskEmailAddress,
  interpretSmtpResult,
} = await import("#root/shared/email/service");
const { describeSendingIdentity } = await import("#root/shared/email/from-env");

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

    expect(result).toEqual({ success: true, messageId: "msg-1" });
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

// ─── Provider acceptance, timeouts, Message-ID, log hygiene ─────────────────
// Ported from the Mach Supplements fix (02d544a / 2e68974).

describe("provider acceptance is the only success", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    sendMailMock.mockResolvedValue({ messageId: "msg-1" });
  });

  it("reports success only when the SMTP server accepted the recipient, with its Message-ID and reply", async () => {
    sendMailMock.mockResolvedValueOnce({
      messageId: "<abc@perce.test>",
      accepted: ["To@Example.com"],
      rejected: [],
      response: "250 2.0.0 OK 1700000000 x1-gsmtp",
    });
    const service = await Effect.runPromise(makeEmailService(baseInput()));
    const result = await Effect.runPromise(service.sendEmail("to@example.com", "S", "<p>B</p>"));
    expect(result).toEqual({
      success: true,
      messageId: "<abc@perce.test>",
      response: "250 2.0.0 OK 1700000000 x1-gsmtp",
    });
  });

  it("is a failure when sendMail resolves but the recipient was rejected", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMailMock.mockResolvedValueOnce({
      messageId: "<abc@perce.test>",
      accepted: [],
      rejected: ["to@example.com"],
      response: "550 5.1.1 user unknown",
    });
    const service = await Effect.runPromise(makeEmailService(baseInput()));
    const result = await Effect.runPromise(service.sendEmail("to@example.com", "S", "<p>B</p>"));
    error.mockRestore();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not accepted.*550 5\.1\.1/);
    expect(result.messageId).toBeUndefined();
  });

  it("is a failure when the accepted list does not contain this recipient", () => {
    expect(interpretSmtpResult({ accepted: ["someone-else@example.com"], rejected: [] }, "to@example.com").success).toBe(false);
    expect(interpretSmtpResult({ accepted: [{ address: "to@example.com" }], rejected: [] }, "to@example.com").success).toBe(true);
  });

  it("passes a stable Message-ID through (bracketed)", async () => {
    const service = await Effect.runPromise(makeEmailService(baseInput()));
    await Effect.runPromise(
      service.sendEmail("to@example.com", "S", "<p>B</p>", { messageId: "order-confirmation.1@perce.test" }),
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "<order-confirmation.1@perce.test>" }),
    );
  });

  it("configures transport-level timeouts", async () => {
    await Effect.runPromise(makeEmailService(baseInput()));
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 45_000 }),
    );
  });
});

describe("no false failure from the old 10-second race", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
  });

  it("a slow but successful SMTP session (30s) is reported as sent, not failed", async () => {
    // Before: the 10s Promise.race reported "timed out" while sendMail kept
    // going and delivered — the queue then retried and the customer got the
    // confirmation twice.
    vi.useFakeTimers();
    try {
      sendMailMock.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ messageId: "<slow@perce.test>", accepted: ["to@example.com"], rejected: [] }), 30_000)),
      );
      const service = await Effect.runPromise(makeEmailService(baseInput()));
      const pending = Effect.runPromise(service.sendEmail("to@example.com", "S", "<p>B</p>"));
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(pending).resolves.toEqual({ success: true, messageId: "<slow@perce.test>" });
      // The guard timer is cleared — nothing left to fire later.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a session with no SMTP reply at all is reported as an unknown outcome after the 120s guard", async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      sendMailMock.mockImplementationOnce(() => new Promise(() => {}));
      const service = await Effect.runPromise(makeEmailService(baseInput()));
      const pending = Effect.runPromise(service.sendEmail("to@example.com", "S", "<p>B</p>"));
      await vi.advanceTimersByTimeAsync(120_000);
      const result = await pending;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/outcome unknown/);
    } finally {
      error.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("log hygiene", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
  });

  it("never writes the full recipient address or the message body to logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      sendMailMock.mockRejectedValueOnce(Object.assign(new Error("Invalid login"), { responseCode: 535 }));
      const service = await Effect.runPromise(makeEmailService(baseInput()));
      await Effect.runPromise(service.sendEmail("customer.private@example.com", "S", "<p>SECRET-ADDRESS-LINE</p>"));
      const output = [...log.mock.calls, ...error.mock.calls].flat().map(String).join(" | ");
      expect(output).not.toContain("customer.private@example.com");
      expect(output).not.toContain("SECRET-ADDRESS-LINE");
      expect(output).toContain("cu***@example.com");
      expect(output).toContain("[535]");
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});

describe("maskEmailAddress", () => {
  it("keeps only the first two characters of the local part", () => {
    expect(maskEmailAddress("mohamed@example.com")).toBe("mo***@example.com");
    expect(maskEmailAddress("a@b.co")).toBe("a***@b.co");
    expect(maskEmailAddress("")).toBe("(none)");
    expect(maskEmailAddress("not-an-address")).toBe("***");
  });
});

describe("describeSendingIdentity", () => {
  it("flags a custom From domain sent through a consumer Gmail mailbox (DMARC cannot align)", () => {
    const id = describeSendingIdentity({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "store.owner@gmail.com",
      EMAIL_FROM_ADDRESS: "orders@perce-shop.test",
    } as NodeJS.ProcessEnv);
    expect(id.fromDomain).toBe("perce-shop.test");
    expect(id.smtpUserDomain).toBe("gmail.com");
    expect(id.warnings.join(" ")).toMatch(/cannot DKIM-sign.*perce-shop\.test/);
  });

  it("has no alignment warning when the SMTP login is on the From domain", () => {
    const id = describeSendingIdentity({
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_USER: "orders@perce-shop.test",
      EMAIL_FROM_ADDRESS: "orders@perce-shop.test",
    } as NodeJS.ProcessEnv);
    expect(id.warnings).toEqual([]);
  });

  it("defaults From to the SMTP login, the name to the store and Reply-To to the support inbox", async () => {
    const { STORE_NAME, SUPPORT_EMAIL } = await import("#root/shared/config/branding");
    const id = describeSendingIdentity({ SMTP_HOST: "smtp.example.com", SMTP_USER: "a@example.com" } as NodeJS.ProcessEnv);
    expect(id).toMatchObject({ fromAddress: "a@example.com", fromName: STORE_NAME, replyTo: SUPPORT_EMAIL });
    expect(id.warnings).toEqual([]);
  });
});
