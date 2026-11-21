import { createTransport } from "nodemailer";
import { describeSendingIdentity, parseSmtpSecure } from "#root/shared/email/from-env.js";
import {
  interpretSmtpResult,
  maskEmailAddress,
  resolveSmtpTransportSecurity,
} from "#root/shared/email/service.js";

/**
 * Sends a better-auth email (password reset, email verification) outside the
 * Effect context. Same transport rules and sending identity as order emails
 * (shared/email/from-env.ts): TLS mode from SMTP_PORT / SMTP_SECURE (it used
 * to be hard-coded implicit TLS, so a 587 provider could never send these),
 * From = EMAIL_FROM_ADDRESS (else SMTP_USER) with the store name, Reply-To
 * the support inbox, transport-level timeouts. Never throws.
 */
export async function sendAuthEmail(
  to: string,
  subject: string,
  html: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ success: boolean; error?: string }> {
  try {
    const smtpHost = (env.SMTP_HOST || "").replace(/^https?:\/\//, "");
    const smtpUser = env.SMTP_USER || "";
    const smtpPassword = env.SMTP_PASSWORD || "";
    const smtpPort = Number.parseInt(env.SMTP_PORT || "465", 10);

    if (!smtpHost || !smtpUser || !smtpPassword) {
      console.warn(`[Email] SMTP not configured — skipping email to ${maskEmailAddress(to)}: ${subject}`);
      return { success: false, error: "SMTP not configured" };
    }

    const transport = createTransport({
      host: smtpHost,
      port: smtpPort,
      ...resolveSmtpTransportSecurity(smtpPort, parseSmtpSecure(env.SMTP_SECURE)),
      auth: { user: smtpUser, pass: smtpPassword },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 45_000,
    });

    const identity = describeSendingIdentity(env);
    const fromAddress = identity.fromAddress || smtpUser;
    const info = await transport.sendMail({
      from: `"${identity.fromName.replace(/"/g, "'")}" <${fromAddress}>`,
      to,
      subject,
      html,
      replyTo: identity.replyTo,
    });
    const verdict = interpretSmtpResult(info, to);
    if (!verdict.success) {
      console.error(`[Email] Failed to send email to ${maskEmailAddress(to)}: ${verdict.error}`);
    }
    return verdict;
  } catch (err) {
    const code =
      err && typeof err === "object" && "responseCode" in err
        ? ` [${String((err as { responseCode: unknown }).responseCode)}]`
        : "";
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Email] Failed to send email to ${maskEmailAddress(to)}${code}: ${message}`);
    return { success: false, error: message };
  }
}
