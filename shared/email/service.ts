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

export const makeEmailService = (input: {
  smtpHost: string;
  smtpUser: string;
  smtpPassword: Redacted.Redacted<string>;
  smtpPort: number;
  /** Default From address for all sends. Falls back to smtpUser when unset. */
  fromAddress?: string;
  /** Default From display name for all sends. */
  fromName?: string;
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
            console.warn(
              `[DUMMY EMAIL] Not sending email to ${to}: ${subject}`
            );
            console.warn(
              "Email body would have been:",
              `${body.substring(0, 100)}...`
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
              secure: true,
              auth: {
                user: input.smtpUser,
                pass: Redacted.value(input.smtpPassword),
              },
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
                console.log(`Attempting to send email to ${to}: ${subject}`);

                // Wrap in timeout to prevent long hanging connections
                const timeoutPromise = new Promise<never>((_, reject) => {
                  setTimeout(
                    () =>
                      reject(
                        new Error("Email sending timed out after 10 seconds")
                      ),
                    10000
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

                const sendPromise = transport.sendMail({
                  from,
                  to,
                  subject,
                  html: processedBody,
                  replyTo: options?.replyTo,
                  headers: options?.headers,
                  attachments:
                    inlineAttachments.length > 0
                      ? inlineAttachments
                      : undefined,
                });

                // Race between timeout and actual sending
                await Promise.race([sendPromise, timeoutPromise]);
                console.log(`Email sent successfully to ${to}`);
                return { success: true };
              } catch (error) {
                // Log but don't throw — a transactional send (order
                // confirmation, password reset) must never block or roll
                // back the operation that triggered it. Callers that need
                // to know about the failure (the automation queue worker,
                // for retry) inspect the returned `.success` instead.
                console.error(`Failed to send email to ${to}:`, error);

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
      msg: `[DUMMY EMAIL] Not sending email to ${to}`,
      subject,
    });
    return Effect.succeed({
      success: false,
      error: "Email service not configured (dummy service active)",
    }) as Effect.Effect<SendEmailResult, ServerError<string>, never>;
  };

  return { sendEmail };
};
