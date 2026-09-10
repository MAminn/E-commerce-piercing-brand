import { query } from "#root/shared/database/drizzle/db.js";
import * as Tables from "#root/shared/database/drizzle/schema.js";
import { Effect } from "effect";
import { eq, sql } from "drizzle-orm";
import { ServerError } from "#root/shared/error/server.js";
import { z } from "zod";
import { hash, verify } from "@node-rs/argon2";
import type { ClientSession } from "../shared/entities";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const changePassword = (
  input: z.infer<typeof changePasswordSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "You must be logged in",
          }),
        ),
      );
    }

    const user = yield* $(
      query(async (db) =>
        db
          .select()
          .from(Tables.user)
          .where(
            eq(
              sql`lower(${Tables.user.email})`,
              session.email.toLowerCase(),
            ),
          )
          .limit(1),
      ),
      Effect.map((rows) => rows[0]),
    );

    if (!user) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "UserNotFound",
            statusCode: 404,
            clientMessage: "User not found",
          }),
        ),
      );
    }

    // Verify current password using argon2 (same as login flow)
    const isValid = yield* $(
      Effect.tryPromise({
        try: async () => await verify(user.passwordDigest ?? "", input.currentPassword),
        catch: () =>
          new ServerError({
            tag: "VerifyPasswordError",
            statusCode: 500,
            clientMessage: "Error verifying password",
          }),
      }),
    );

    if (!isValid) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "InvalidCurrentPassword",
            statusCode: 400,
            clientMessage: "Current password is incorrect",
          }),
        ),
      );
    }

    // Hash new password using argon2 (same as registration flow)
    const newHash = yield* $(
      Effect.tryPromise({
        try: async () => await hash(input.newPassword),
        catch: (err) =>
          new ServerError({
            tag: "HashPasswordError",
            cause: err,
            statusCode: 500,
            clientMessage: "Error hashing password",
          }),
      }),
    );

    yield* $(
      query(async (db) =>
        db
          .update(Tables.user)
          .set({ passwordDigest: newHash })
          .where(eq(Tables.user.id, user.id)),
      ),
    );

    return { success: true };
  });
