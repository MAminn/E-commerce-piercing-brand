import { query } from "#root/shared/database/drizzle/db.js";
import * as Tables from "#root/shared/database/drizzle/schema.js";
import { Effect } from "effect";
import { and, eq, gt } from "drizzle-orm";
import { ServerError } from "#root/shared/error/server.js";
import { z } from "zod";
import { hashPassword } from "../shared/utils";
import { invalidateAllSessions } from "../session";

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(255),
});

/**
 * Reset password using a valid token. Invalidates all existing sessions
 * so the user must log in again with the new password.
 */
export const resetPassword = (
  input: z.infer<typeof resetPasswordSchema>,
) => {
  return Effect.gen(function* ($) {
    const { token, password } = input;

    // Find the token in the database (not used, not expired)
    const resetToken = yield* $(
      query(
        async (db) =>
          await db
            .select()
            .from(Tables.passwordResetToken)
            .where(
              and(
                eq(Tables.passwordResetToken.token, token),
                eq(Tables.passwordResetToken.used, false),
                gt(Tables.passwordResetToken.expiresAt, new Date()),
              ),
            ),
      ),
      Effect.map((tokens) => tokens[0]),
    );

    if (!resetToken) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "InvalidToken",
            statusCode: 400,
            clientMessage:
              "This reset link is invalid or has expired. Please request a new one.",
          }),
        ),
      );
    }

    // Hash the new password
    const passwordDigest = yield* $(hashPassword(password));

    // Update password and mark token as used in a single transaction
    yield* $(
      query(async (db) => {
        await db
          .update(Tables.user)
          .set({ passwordDigest, updatedAt: new Date() })
          .where(eq(Tables.user.id, resetToken.userId));

        await db
          .update(Tables.passwordResetToken)
          .set({ used: true })
          .where(eq(Tables.passwordResetToken.id, resetToken.id));
      }),
    );

    // Invalidate all sessions for this user
    yield* $(
      query(async (db) => {
        await db
          .delete(Tables.session)
          .where(eq(Tables.session.userId, resetToken.userId));
      }),
    );

    // Log the successful reset
    yield* $(
      query(async (db) => {
        const userData = await db
          .select({ email: Tables.user.email })
          .from(Tables.user)
          .where(eq(Tables.user.id, resetToken.userId));

        const email = userData[0]?.email ?? "";

        await db.insert(Tables.authLog).values({
          email,
          action: "password_reset_success",
        });
      }),
    );

    return { success: true };
  });
};
