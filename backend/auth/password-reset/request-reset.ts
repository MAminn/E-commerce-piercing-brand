import { query } from "#root/shared/database/drizzle/db.js";
import * as Tables from "#root/shared/database/drizzle/schema.js";
import { Effect } from "effect";
import { eq, sql } from "drizzle-orm";
import { ServerError } from "#root/shared/error/server.js";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  EmailService,
  renderEmailTemplate,
} from "#root/shared/email/service.js";
import { PasswordResetTemplate } from "./email-template";
import { MinimalPasswordResetTemplate } from "#root/backend/emails/minimal/password-reset";
import { getEmailBranding } from "#root/backend/emails/branding";

export const requestResetSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

/**
 * Request a password reset. Always returns success to avoid leaking
 * whether an email is registered. The actual email is only sent when
 * the account exists.
 */
export const requestPasswordReset = (
  input: z.infer<typeof requestResetSchema>,
) => {
  return Effect.gen(function* ($) {
    const { email } = input;

    // Look up user (case-insensitive)
    const existingUser = yield* $(
      query(
        async (db) =>
          await db
            .select({ id: Tables.user.id, name: Tables.user.name, email: Tables.user.email })
            .from(Tables.user)
            .where(eq(sql`lower(${Tables.user.email})`, email.toLowerCase())),
      ),
      Effect.map((users) => users[0]),
    );

    // Log the attempt regardless
    yield* $(
      query(async (db) => {
        await db.insert(Tables.authLog).values({
          email,
          userId: existingUser?.id,
          action: "password_reset_requested",
        });
      }),
    );

    // If user doesn't exist, return success anyway (don't leak email existence)
    if (!existingUser) {
      return { success: true };
    }

    // Create a secure token
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

    // Store the token
    yield* $(
      query(async (db) => {
        await db.insert(Tables.passwordResetToken).values({
          userId: existingUser.id,
          token,
          expiresAt,
        });
      }),
    );

    // Send the email
    const emailService = yield* $(EmailService);
    const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    const branding = yield* $(Effect.promise(() => getEmailBranding()));

    const emailHtml = yield* $(
      renderEmailTemplate(
        branding.isMinimal
          ? MinimalPasswordResetTemplate({
              storeName: branding.storeName,
              logoUrl: branding.logoUrl,
              userName: existingUser.name,
              resetUrl,
            })
          : PasswordResetTemplate({
              userName: existingUser.name,
              resetUrl,
            }),
      ),
    );

    try {
      yield* $(
        emailService.sendEmail(
          existingUser.email,
          `Reset your ${branding.storeName} password`,
          emailHtml,
        ),
      );
    } catch (error) {
      console.error("Failed to send password reset email:", error);
    }

    return { success: true };
  });
};
