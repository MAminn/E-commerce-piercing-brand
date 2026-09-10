import { query } from "#root/shared/database/drizzle/db.js";
import * as Tables from "#root/shared/database/drizzle/schema.js";
import { Effect, Option } from "effect";
import { hashPassword } from "../shared/utils";
import { eq } from "drizzle-orm";
import { ServerError } from "#root/shared/error/server.js";
import { STORE_NAME } from "#root/shared/config/branding";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  EmailService,
  renderEmailTemplate,
} from "#root/shared/email/service.js";
import { EmailVerificationTemplate } from "./email-template";
import { MinimalEmailVerificationTemplate } from "#root/backend/emails/minimal/email-verification";
import { ComingSoonWelcomeTemplate } from "#root/backend/emails/minimal/coming-soon-welcome";
import { getEmailBranding } from "#root/backend/emails/branding";

export const registerSchema = z
  .object({
    email: z.string().email("Please enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(255),
    confirmPassword: z.string(),
    name: z.string().nonempty("Name is required").max(255),
    phone: z
      .string()
      .regex(/^(\+201|01|00201)[0-2,5]{1}[0-9]{8}/, "Invalid phone number"),
    role: z.enum(["admin", "user"]).default("user"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const register = ({
  email,
  password,
  confirmPassword,
  name,
  phone,
  role,
}: z.infer<typeof registerSchema>) => {
  return Effect.gen(function* ($) {
    const existingUser = yield* $(
      query(
        async (db) =>
          await db
            .select()
            .from(Tables.user)
            .where(eq(Tables.user.email, email))
      ),
      Effect.map((users) => users[0])
    );

    if (existingUser) {
      // Log failed registration attempt
      yield* $(
        query(async (db) => {
          await db.insert(Tables.authLog).values({
            email,
            action: "register_failed",
            errorMessage: "User already exists",
          });
        })
      );
      
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "UserAlreadyExists",
            statusCode: 400,
            clientMessage: "User already exists",
          })
        )
      );
    }

    // Create verification token
    const verificationToken = randomBytes(32).toString("hex");
    const now = new Date();
    const verificationExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const passwordDigest = yield* $(hashPassword(password));

    // Set emailVerified to true for admin accounts
    const emailVerified = role === "admin";

    const users = yield* $(
      query(async (db) => {
        return await db
          .insert(Tables.user)
          .values({
            id: crypto.randomUUID(),
            email,
            passwordDigest,
            name,
            phone,
            role,
            emailVerified,
            verificationToken,
            verificationExpiry,
          })
          .returning();
      })
    );

    const newUser = users[0];

    if (!newUser) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "FailedToCreateUser",
            statusCode: 500,
            message:
              "Failed to create user, user does not exist after creation.",
            clientMessage: "Failed to create user",
          })
        )
      );
    }

    // Only send verification email if not an admin
    if (!emailVerified) {
      // Send verification email
      const emailService = yield* $(EmailService);

      // Create verification URL
      const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
      const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

      const branding = yield* $(Effect.promise(() => getEmailBranding()));

      const emailTemplate = yield* $(
        renderEmailTemplate(
          branding.isMinimal
            ? MinimalEmailVerificationTemplate({
                storeName: branding.storeName,
                logoUrl: branding.logoUrl,
                userName: newUser.name,
                verificationUrl,
              })
            : EmailVerificationTemplate({
                userName: newUser.name,
                verificationUrl,
              })
        )
      );

      try {
        yield* $(
          emailService.sendEmail(
            newUser.email,
            `Verify your ${branding.storeName} account`,
            emailTemplate
          )
        );
      } catch (error) {
        // Log error but don't expose to client - they'll still be able to use the system
        // and request a new verification email if needed
        console.error("Failed to send verification email:", error);
      }
    }

    // If coming-soon mode is active and this is a regular user, send welcome email
    if (role === "user") {
      try {
        const comingSoonRow = yield* $(
          query(async (db) =>
            db
              .select({ comingSoonMode: Tables.storeSettings.comingSoonMode })
              .from(Tables.storeSettings)
              .where(eq(Tables.storeSettings.key, "default"))
              .limit(1),
          ),
        );
        const comingSoonActive = comingSoonRow[0]?.comingSoonMode ?? false;

        if (comingSoonActive) {
          const emailService = yield* $(EmailService);
          const branding = yield* $(Effect.promise(() => getEmailBranding()));
          const welcomeEmailHtml = yield* $(
            renderEmailTemplate(
              ComingSoonWelcomeTemplate({
                storeName: branding.storeName,
              }),
            ),
          );
          try {
            yield* $(
              emailService.sendEmail(
                newUser.email,
                `Welcome to ${branding.storeName} — We'll be in touch!`,
                welcomeEmailHtml,
              ),
            );
          } catch (err) {
            console.error("Failed to send coming-soon welcome email:", err);
          }
        }
      } catch (err) {
        console.error("Error checking coming-soon mode:", err);
      }
    }

    // Log successful registration
    yield* $(
      query(async (db) => {
        await db.insert(Tables.authLog).values({
          userId: newUser.id,
          email: newUser.email,
          action: "register_success",
        });
      })
    );

    return {
      id: newUser.id,
      email: newUser.email,
    };
  });
};
