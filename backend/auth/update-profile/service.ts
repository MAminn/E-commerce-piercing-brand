import { query } from "#root/shared/database/drizzle/db.js";
import * as Tables from "#root/shared/database/drizzle/schema.js";
import { Effect } from "effect";
import { eq, sql } from "drizzle-orm";
import { ServerError } from "#root/shared/error/server.js";
import { z } from "zod";
import type { ClientSession } from "../shared/entities";

export const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  phone: z
    .string()
    .regex(/^(\+201|01|00201)[0-2,5]{1}[0-9]{8}/, "Invalid phone number"),
});

export const updateProfile = (
  input: z.infer<typeof updateProfileSchema>,
  session?: ClientSession,
) => {
  return Effect.gen(function* ($) {
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

    // Find user by session email
    const existingUser = yield* $(
      query(
        async (db) =>
          await db
            .select({ id: Tables.user.id })
            .from(Tables.user)
            .where(eq(sql`lower(${Tables.user.email})`, session.email.toLowerCase())),
      ),
      Effect.map((users) => users[0]),
    );

    if (!existingUser) {
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

    // Update the user
    const updated = yield* $(
      query(async (db) => {
        return await db
          .update(Tables.user)
          .set({
            name: input.name,
            phone: input.phone,
            updatedAt: new Date(),
          })
          .where(eq(Tables.user.id, existingUser.id))
          .returning({
            id: Tables.user.id,
            name: Tables.user.name,
            email: Tables.user.email,
            phone: Tables.user.phone,
          });
      }),
      Effect.map((users) => users[0]),
    );

    if (!updated) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "UpdateFailed",
            statusCode: 500,
            clientMessage: "Failed to update profile",
          }),
        ),
      );
    }

    return updated;
  });
};
