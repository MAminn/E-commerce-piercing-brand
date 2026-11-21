import { Context, Effect, Redacted } from "effect";
import { ServerError } from "../error/server";
import { createTransport } from "nodemailer";
import type { JSXElementConstructor, ReactElement } from "react";
import { render } from "@react-email/components";

/** Minimal logger shape createDummyEmailService needs — satisfied by both FastifyBaseLogger and a plain console wrapper. */
export interface MinimalWarnLogger {
  warn(obj: unknown, msg?: string): void;
}

export interface SendEmailOptions {
  /** Overrides EMAIL_FROM_NAME for this send only. */
  fromName?: string;
  /** Overrides EMAIL_FROM_ADDRESS/smtpUser for this send only. */
  fromAddress?: string;
  replyTo?: string;
  /** Raw headers merged into the message — used for List-Unsubscribe etc. */
  headers?: Record<string, string>;
  /**
   * Stable RFC 5322 Message-ID (with or without angle brackets). A retried
   * transactional send reuses the same id so a duplicate delivery after a
   * lost SMTP reply is recognisable as the same message.
   */
  messageId?: string;
}

/** "jo***@example.com" — enough to tell recipients apart in logs, not to identify them. */
export function maskEmailAddress(address: string | null | undefined): string {
  if (!address) return "(none)";
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${address.slice(0, Math.min(2, at))}***${address.slice(at)}`;
}

/**
 * Result of a send attempt. Kept on the SUCCESS channel (not the Effect
 * error channel) intentionally: a transactional send (order confirmation,
 * password reset) must never fail the surrounding Effect and roll back the
 * triggering operation. Callers that need to know whether the message
 * actually went out (the scheduled-automation worker, in particular — it
 * must retry failed sends) inspect `.success`; callers that don't care
 * (the existing transactional call sites) can keep ignoring the return
 * value exactly as they do today.
 */
export interface SendEmailResult {
  success: boolean;
  error?: string;
  /**
   * Provider acceptance evidence, set only when the SMTP server accepted the
   * message for the recipient. Acceptance is not inbox delivery.
   */
  messageId?: string;
  /** The SMTP server's final reply, e.g. "250 2.0.0 OK 1700000000 x1-...gsmtp". */
  response?: string;
}

export interface EmailServiceInterface {
  sendEmail(
    to: string,
    subject: string,
    body: string,
    options?: SendEmailOptions
  ): Effect.Effect<SendEmailResult, ServerError<string>, never>;
}

export class EmailService extends Context.Tag("EmailService")<
  EmailService,
  EmailServiceInterface
>() {}

/**
 * TLS mode for an SMTP port, instead of the old hard-coded `secure: true`
 * (which only works on 465 — a 587 relay failed every send):
 *
 *   465        → implicit TLS from the first byte (`secure: true`)
 *   587 / 25 / 2525 / anything else
 *              → plain connect upgraded with STARTTLS, and the upgrade is
 *                REQUIRED (`requireTLS`) so credentials never travel in clear
 *
 * `override` (SMTP_SECURE=true|false) wins for a relay with unusual ports.
 */
export function resolveSmtpTransportSecurity(
  port: number,
  override?: boolean,
): { secure: boolean; requireTLS: boolean } {
  const secure = override ?? port === 465;
  return { secure, requireTLS: !secure };
}

/** Logs whether the SMTP login works — once per process, never blocking start-up, never printing credentials. */
let smtpVerificationStarted = false;
function verifyTransportInBackground(
  transport: { verify: () => Promise<unknown> },
  details: { host: string; port: number; secure: boolean },
): void {
  if (smtpVerificationStarted) return;
  smtpVerificationStarted = true;
  const where = `${details.host}:${details.port} (${details.secure ? "TLS" : "STARTTLS"})`;
  transport
    .verify()
    .then(() => console.info(`[Email] SMTP connection verified — ${where}`))
    .catch((err: unknown) => {
      const code =
        err && typeof err === "object" && "code" in err ? ` [${String(err.code)}]` : "";
      console.error(
        `[Email] SMTP verification FAILED for ${where}${code}: ${err instanceof Error ? err.message : String(err)}. Order confirmations will be retried by the queue but cannot be delivered until this is fixed.`,
      );
    });
}

export const makeEmailService = (input: {
  smtpHost: string;
  smtpUser: string;
  smtpPassword: Redacted.Redacted<string>;
  smtpPort: number;
  /** Default From address for all sends. Falls back to smtpUser when unset. */
  fromAddress?: string;
  /** Default From display name for all sends. */
  fromName?: string;
  /** Default Reply-To for all sends (the support inbox). Per-call options override it. */
  replyTo?: string;
  /** SMTP_SECURE override; otherwise derived from the port. */
  secure?: boolean;
  /** Check the login in the background and log the outcome. */
  verifyOnStart?: boolean;
}) =>
  Effect.gen(function* ($) {
    // Validate SMTP host - remove any http:// or https:// prefixes
    const cleanedHost = input.smtpHost.replace(/^https?:\/\//, "");

    if (cleanedHost !== input.smtpHost) {
      console.warn(
        `SMTP host contained http:// or https:// prefix which was removed. Original: ${input.smtpHost}, Cleaned: ${cleanedHost}`
      );
    }

    // Create dummy email service for fallback
    const createDummyService = () => ({
      sendEmail: (to: string, subject: string, body: string) =>
        Effect.succeed(
          (() => {
            // No body preview: it carries the customer's name, address and order.
            console.warn(
              `[DUMMY EMAIL] Not sending email to ${maskEmailAddress(to)}: ${subject} (${body.length} bytes)`
            );
            return {
              success: false,
              error: "Email service not configured (dummy service active)",
            };
          })()
        ) as Effect.Effect<SendEmailResult, ServerError<string>, never>,
    });

    try {
      // Create the transport, falling back to null on any synchronous throw.
      // IMPORTANT: this catches the exception INSIDE the Effect.sync body and
      // returns null as a normal success value — it does NOT route through
      // Effect.try's `catch` (which maps to the Effect *failure* channel).
      // A JS `try { ... yield* $(effect) ... } catch {}` around a failing
      // Effect does not catch it: Effect's fiber runtime short-circuits the
      // generator without going through JS exception machinery, so that
      // pattern silently never runs its catch block. Keeping the recovery
      // entirely inside a success-producing Effect.sync sidesteps that trap.
      const transport = yield* $(
        Effect.sync(() => {
          try {
            return createTransport({
              host: cleanedHost,
              port: input.smtpPort,
              ...resolveSmtpTransportSecurity(input.smtpPort, input.secure),
              auth: {
                user: input.smtpUser,
                pass: Redacted.value(input.smtpPassword),
              },
              // Transport-level limits, so a slow or dead server aborts the
              // SMTP session itself. A failure we report is then a real
              // non-delivery — unlike the old outer 10s Promise.race, which
              // gave up while sendMail kept going and could still deliver a
              // message already recorded as failed (=> duplicate on retry).
              connectionTimeout: 15_000,
              greetingTimeout: 15_000,
              socketTimeout: 45_000,
            });
          } catch (err) {
            console.warn(
              `Failed to create email transport: ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
          }
        })
      );

      // If transport creation failed, return dummy service
      if (!transport) {
        console.warn(
          "Email transport creation failed, using dummy email service"
        );
        return createDummyService();
      }

      const defaultFromAddress = input.fromAddress || input.smtpUser;
      const defaultFromName = input.fromName;
      const defaultReplyTo = input.replyTo;

      if (input.verifyOnStart) {
        verifyTransportInBackground(transport, {
          host: cleanedHost,
          port: input.smtpPort,
          secure: resolveSmtpTransportSecurity(input.smtpPort, input.secure).secure,
        });
      }

      // Don't even attempt to verify if we know authentication will fail
      // Instead, just check if the transport exists and return the proper service
      return {
        sendEmail: (
          to: string,
          subject: string,
          body: string,
          options?: SendEmailOptions
        ) =>
          Effect.tryPromise({
            try: async (): Promise<SendEmailResult> => {
              try {
                console.log(
                  `Attempting to send email to ${maskEmailAddress(to)}: ${subject}`
                );

                // Last-resort guard only — the transport's own connection /
                // greeting / socket timeouts (above) fire well before this.
                let guardTimer: ReturnType<typeof setTimeout> | undefined;
                const timeoutPromise = new Promise<never>((_, reject) => {
                  guardTimer = setTimeout(
                    () =>
                      reject(
                        new Error(
                          "Email send outcome unknown: no SMTP reply within 120 seconds"
                        )
                      ),
                    120_000
                  );
                });

                // Gmail (and most clients) block base64 data URIs in email HTML.
                // Convert any embedded data URIs to CID inline attachments instead.
                const inlineAttachments: Array<{
                  filename: string;
                  content: Buffer;
                  cid: string;
                }> = [];
                let processedBody = body;
                let attachIdx = 0;
                processedBody = body.replace(
                  /src="(data:(image\/[^;]+);base64,([^"]+))"/g,
                  (_match, _dataUri, mimeType, base64Data) => {
                    const ext =
                      (mimeType as string)
                        .split("/")[1]
                        ?.replace("jpeg", "jpg") ?? "png";
                    const cid = `inline-img-${attachIdx++}`;
                    inlineAttachments.push({
                      filename: `logo.${ext}`,
                      content: Buffer.from(base64Data as string, "base64"),
                      cid,
                    });
                    return `src="cid:${cid}"`;
                  },
                );

                const fromAddress = options?.fromAddress || defaultFromAddress;
                const fromName = options?.fromName ?? defaultFromName;
                const from = fromName
                  ? `"${fromName.replace(/"/g, "'")}" <${fromAddress}>`
                  : fromAddress;

                const replyTo = options?.replyTo ?? defaultReplyTo;
                const messageId = options?.messageId
                  ? options.messageId.startsWith("<")
                    ? options.messageId
                    : `<${options.messageId}>`
                  : undefined;

                const sendPromise = transport.sendMail({
                  from,
                  to,
                  subject,
                  html: processedBody,
                  ...(replyTo ? { replyTo } : {}),
                  ...(messageId ? { messageId } : {}),
                  headers: options?.headers,
                  attachments:
                    inlineAttachments.length > 0
                      ? inlineAttachments
                      : undefined,
                });

                let info: unknown;
                try {
                  info = await Promise.race([sendPromise, timeoutPromise]);
                } finally {
                  if (guardTimer) clearTimeout(guardTimer);
                }

                const verdict = interpretSmtpResult(info, to, messageId);
                if (!verdict.success) {
                  console.error(
                    `Failed to send email to ${maskEmailAddress(to)}: ${verdict.error}`
                  );
                  return verdict;
                }
                console.log(
                  `Email accepted by SMTP server for ${maskEmailAddress(to)}${verdict.messageId ? ` (${verdict.messageId})` : ""}`
                );
                return verdict;
              } catch (error) {
                // Log but don't throw — a transactional send (order
                // confirmation, password reset) must never block or roll
                // back the operation that triggered it. Callers that need
                // to know about the failure (the automation queue worker,
                // for retry) inspect the returned `.success` instead.
                // Message + SMTP code only: the raw error object can carry
                // the envelope (addresses) and the server conversation.
                const code =
                  error && typeof error === "object" && "responseCode" in error
                    ? ` [${String((error as { responseCode: unknown }).responseCode)}]`
                    : "";
                console.error(
                  `Failed to send email to ${maskEmailAddress(to)}${code}: ${error instanceof Error ? error.message : String(error)}`
                );

                if (
                  error &&
                  typeof error === "object" &&
                  "code" in error &&
                  error.code === "EAUTH"
                ) {
                  console.warn(
                    "Authentication failed when sending email, service will be disabled"
                  );
                }

                return {
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                };
              }
            },
            // The inner try/catch above already handles every failure mode
            // and always resolves — this catch only exists to satisfy
            // Effect.tryPromise's type signature (it maps promise rejection
            // to the Effect's error channel), it should be unreachable.
            catch: (err) =>
              new ServerError({
                tag: "EmailSendUnexpectedError",
                cause: err,
                message: `Unexpected error escaped sendEmail's inner handler: ${err instanceof Error ? err.message : String(err)}`,
                statusCode: 500,
                clientMessage: "Failed to send email",
              }),
          }),
      };
    } catch (error) {
      console.error("Error initializing email service:", error);
      return createDummyService();
    }
  });

/**
 * Turns nodemailer's resolved sendMail info into a verdict. A resolved
 * promise is not proof the recipient was taken: the SMTP transport resolves
 * with `accepted` / `rejected` lists. Success means THIS recipient is in
 * `accepted` and nobody is in `rejected`. (Transports without those lists —
 * stream/json test transports — are judged by resolution alone.)
 */
export function interpretSmtpResult(
  info: unknown,
  to: string,
  requestedMessageId?: string,
): SendEmailResult {
  const sent = (info ?? {}) as {
    messageId?: unknown;
    response?: unknown;
    accepted?: unknown;
    rejected?: unknown;
  };
  const addressOf = (entry: unknown) =>
    String(
      entry && typeof entry === "object" && "address" in entry
        ? (entry as { address: unknown }).address
        : entry,
    ).toLowerCase();
  const accepted = Array.isArray(sent.accepted) ? sent.accepted.map(addressOf) : null;
  const rejected = Array.isArray(sent.rejected) ? sent.rejected : [];
  const response =
    typeof sent.response === "string" ? sent.response.slice(0, 500) : undefined;

  if (rejected.length > 0 || (accepted && !accepted.includes(to.trim().toLowerCase()))) {
    return {
      success: false,
      error: `Recipient not accepted by the SMTP server${response ? `: ${response}` : ""}`,
      response,
    };
  }
  const messageId =
    typeof sent.messageId === "string" && sent.messageId ? sent.messageId : requestedMessageId;
  return {
    success: true,
    ...(messageId ? { messageId } : {}),
    ...(response ? { response } : {}),
  };
}

export const renderEmailTemplate = (
  input: ReactElement<unknown, string | JSXElementConstructor<unknown>>
) =>
  Effect.tryPromise({
    try: async () => await render(input),
    catch: (err) =>
      new ServerError({
        tag: "RenderEmailTemplateError",
        cause: err,
        message: `Failed to render email template: ${err instanceof Error ? err.message : String(err)}`,
        statusCode: 500,
        clientMessage: "Failed to generate email content",
      }),
  });

export const createDummyEmailService = (
  logger: MinimalWarnLogger
): EmailServiceInterface => {
  const sendEmail = (to: string, subject: string, body: string) => {
    logger.warn({
      msg: `[DUMMY EMAIL] Not sending email to ${maskEmailAddress(to)}`,
      subject,
    });
    return Effect.succeed({
      success: false,
      error: "Email service not configured (dummy service active)",
    }) as Effect.Effect<SendEmailResult, ServerError<string>, never>;
  };

  return { sendEmail };
};
