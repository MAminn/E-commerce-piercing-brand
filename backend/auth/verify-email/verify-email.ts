import { query } from "#root/shared/database/drizzle/db.js";
import * as Tables from "#root/shared/database/drizzle/schema.js";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { ServerError } from "#root/shared/error/server.js";
import { z } from "zod";

export const verifyEmailSchema = z.object({
  token: z.string(),
});

export const verifyEmail = ({ token }: z.infer<typeof verifyEmailSchema>) => {
  return Effect.gen(function* ($) {
    const users = yield* $(
      query(async (db) => {
        return await db
          .select()
          .from(Tables.user)
          .where(eq(Tables.user.verificationToken, token));
      })
    );

    const user = users[0];

    if (!user) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "InvalidVerificationToken",
            statusCode: 400,
            clientMessage: "Invalid verification token",
          })
        )
      );
    }

    if (user.emailVerified) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "EmailAlreadyVerified",
            statusCode: 400,
            clientMessage: "Email already verified",
          })
        )
      );
    }

    if (user.verificationExpiry && new Date() > user.verificationExpiry) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "VerificationTokenExpired",
            statusCode: 400,
            clientMessage: "Verification token has expired",
          })
        )
      );
    }

    yield* $(
      query(async (db) => {
        await db
          .update(Tables.user)
          .set({
            emailVerified: true,
            verificationToken: null,
            verificationExpiry: null,
          })
          .where(eq(Tables.user.id, user.id));
      })
    );

    return {
      verified: true,
      userId: user.id,
    };
  });
};
