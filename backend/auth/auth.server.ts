import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "#root/shared/database/drizzle/db.js";
import * as schema from "#root/shared/database/drizzle/schema.js";

// db is a factory — call it once here to get the raw Drizzle instance
const dbInstance = db();
import { getEmailBranding } from "#root/backend/emails/branding.js";
import { createTransport } from "nodemailer";

const BASE_URL =
  (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

const BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ||
  process.env.SESSION_SECRET ||
  "fallback-secret-change-in-production";

/** Lazily send email via nodemailer (outside Effect context) */
async function sendEmail(to: string, subject: string, html: string) {
  try {
    const smtpHost = (process.env.SMTP_HOST || "").replace(/^https?:\/\//, "");
    const smtpUser = process.env.SMTP_USER || "";
    const smtpPassword = process.env.SMTP_PASSWORD || "";
    const smtpPort = Number.parseInt(process.env.SMTP_PORT || "465", 10);

    if (!smtpHost || !smtpUser || !smtpPassword) {
      console.warn(`[Email] SMTP not configured — skipping email to ${to}: ${subject}`);
      return;
    }

    const transport = createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: true,
      auth: { user: smtpUser, pass: smtpPassword },
    });

    await transport.sendMail({ from: smtpUser, to, subject, html });
  } catch (err) {
    console.error(`[Email] Failed to send email to ${to}:`, err);
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(dbInstance, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
    usePlural: false,
  }),

  secret: BETTER_AUTH_SECRET,
  baseURL: BASE_URL,
  trustedOrigins: [
    BASE_URL,
    // Allow common local dev ports
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    // Production origins from env (comma-separated list supported)
    ...(process.env.TRUSTED_ORIGINS ? process.env.TRUSTED_ORIGINS.split(",").map((o) => o.trim()) : []),
  ],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // we verify after signup
    sendResetPassword: async ({ user, url }) => {
      try {
        const branding = await getEmailBranding();

        let html: string;
        try {
          const { MinimalPasswordResetTemplate } = await import(
            "#root/backend/emails/minimal/password-reset.js"
          );
          const element = MinimalPasswordResetTemplate({
            storeName: branding.storeName,
            logoUrl: branding.logoUrl,
            userName: user.name,
            resetUrl: url,
          });
          const { render: renderHtml } = await import("@react-email/components");
          html = await renderHtml(element as import("react").ReactElement);
        } catch {
          html = `<p>Hi ${user.name},</p><p>Reset your password: <a href="${url}">${url}</a></p>`;
        }

        await sendEmail(
          user.email,
          `Reset your ${branding.storeName} password`,
          html,
        );
      } catch (err) {
        console.error("[better-auth] Failed to send reset password email:", err);
      }
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      try {
        const branding = await getEmailBranding();

        let html: string;
        try {
          const { MinimalEmailVerificationTemplate } = await import(
            "#root/backend/emails/minimal/email-verification.js"
          );
          const element = MinimalEmailVerificationTemplate({
            storeName: branding.storeName,
            logoUrl: branding.logoUrl,
            userName: user.name,
            verificationUrl: url,
          });
          const { render: renderHtml } = await import("@react-email/components");
          html = await renderHtml(element as import("react").ReactElement);
        } catch {
          html = `<p>Hi ${user.name},</p><p>Verify your email: <a href="${url}">${url}</a></p>`;
        }

        await sendEmail(
          user.email,
          `Verify your ${branding.storeName} account`,
          html,
        );
      } catch (err) {
        console.error("[better-auth] Failed to send verification email:", err);
      }
    },
  },

  user: {
    additionalFields: {
      phone: {
        type: "string",
        required: false,
        defaultValue: "",
        input: true,
      },
      role: {
        type: "string",
        defaultValue: "user",
        input: false, // Admin sets this — not user-controlled
      },
      profilePicture: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },

  session: {
    cookieName: "better-auth.session_token",
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
  },

  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
      ? {
          facebook: {
            clientId: process.env.FACEBOOK_CLIENT_ID,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
          },
        }
      : {}),
  },
});

export type Auth = typeof auth;
