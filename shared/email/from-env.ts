import { Redacted } from "effect";
import { z } from "zod";
import { runBackendEffect } from "../backend/effect";
import {
  type EmailServiceInterface,
  makeEmailService,
  createDummyEmailService,
} from "./service";

/**
 * Minimal logger shape both FastifyBaseLogger and a plain console wrapper
 * satisfy, so this can be called from an HTTP request context (the Fastify
 * middleware) and from a standalone background process (the automation
 * worker) without either one pulling in the other's dependencies.
 */
export interface EmailEnvLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

const smtpVariablesSchema = z.object({
  smtpHost: z.string(),
  smtpPort: z.number(),
  smtpUser: z.string(),
  smtpPassword: z.string(),
});

interface TimeoutResult {
  success: false;
  error: string;
}

type MakeEmailServiceResult =
  | { success: true; result: EmailServiceInterface }
  | { success: false; error: unknown };

/**
 * Reads SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD (+ optional
 * EMAIL_FROM_ADDRESS/EMAIL_FROM_NAME) from process.env and builds a real
 * EmailServiceInterface, falling back to a no-op dummy service (logs
 * instead of sending) on any missing config, validation error, timeout, or
 * unexpected failure. Never throws — this is the single source of truth for
 * "how do we get an EmailServiceInterface from env vars", used by both the
 * Fastify request middleware and the standalone automation worker so the
 * two never drift out of sync with each other.
 */
export async function createEmailServiceFromEnv(
  logger: EmailEnvLogger,
): Promise<EmailServiceInterface> {
  try {
    logger.info("Initializing email service from environment");

    if (
      !process.env.SMTP_HOST ||
      !process.env.SMTP_PORT ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASSWORD
    ) {
      logger.warn("Missing SMTP configuration environment variables");
      return createDummyEmailService(logger);
    }

    const validationResult = smtpVariablesSchema.safeParse({
      smtpHost: process.env.SMTP_HOST,
      smtpPort: Number(process.env.SMTP_PORT),
      smtpUser: process.env.SMTP_USER,
      smtpPassword: process.env.SMTP_PASSWORD,
    });

    if (!validationResult.success) {
      logger.error({
        msg: "Invalid SMTP configuration",
        errors: validationResult.error.format(),
      });
      return createDummyEmailService(logger);
    }

    logger.info({
      msg: "Setting up email service with configuration",
      host: validationResult.data.smtpHost,
      port: validationResult.data.smtpPort,
      user: validationResult.data.smtpUser,
    });

    const data = {
      ...validationResult.data,
      smtpPassword: Redacted.make(validationResult.data.smtpPassword),
      fromAddress: process.env.EMAIL_FROM_ADDRESS || undefined,
      fromName: process.env.EMAIL_FROM_NAME || undefined,
    };

    const timeoutPromise = new Promise<TimeoutResult>((resolve) => {
      setTimeout(() => {
        resolve({
          success: false,
          error: "Email service initialization timed out after 5 seconds",
        });
      }, 5000);
    });

    let makeEmailServicePromise: Promise<MakeEmailServiceResult>;
    try {
      // @ts-ignore - runBackendEffect's success channel is EmailServiceInterface here;
      // the effect never fails, only the discriminated result matters.
      makeEmailServicePromise = runBackendEffect(makeEmailService(data));
    } catch (err) {
      logger.error({ msg: "Error running makeEmailService effect", error: err });
      return createDummyEmailService(logger);
    }

    const result = (await Promise.race([
      makeEmailServicePromise,
      timeoutPromise,
    ])) as MakeEmailServiceResult | TimeoutResult;

    if ("success" in result && result.success) {
      logger.info("Email service initialized successfully");
      return result.result;
    }

    logger.warn({
      msg: "Using dummy email service due to initialization failure",
      error: "error" in result ? result.error : "Unknown error",
    });
    return createDummyEmailService(logger as unknown as Parameters<typeof createDummyEmailService>[0]);
  } catch (error) {
    logger.error({ msg: "Unexpected error initializing email service", error });
    return createDummyEmailService(logger as unknown as Parameters<typeof createDummyEmailService>[0]);
  }
}
