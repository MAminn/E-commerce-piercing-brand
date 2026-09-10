import { query } from "#root/shared/database/drizzle/db.js";
import * as Tables from "#root/shared/database/drizzle/schema.js";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { verify } from "@node-rs/argon2";
import { createSession, generateSessionToken } from "../session";
import { ServerError } from "#root/shared/error/server.js";
import { hashPassword } from "../shared/utils";

const verifyPassword = (hash: string, password: string) =>
  Effect.tryPromise({
    try: async () => await verify(hash, password),
    catch: (err) =>
      new ServerError({
        tag: "VerifyPasswordError",
        cause: err,
      }),
  });

export const login = (email: string, password: string) =>
  Effect.gen(function* ($) {
    // Case-insensitive email lookup
    const normalizedEmail = email.trim().toLowerCase();
    console.log("[Login] Attempting login for email:", normalizedEmail);

    // Use raw SQL for reliable case-insensitive comparison
    const user = yield* $(
      query(async (db) => {
        const result = await db
          .select()
          .from(Tables.user)
          .where(sql`lower(${Tables.user.email}) = ${normalizedEmail}`);
        console.log("[Login] Query returned", result.length, "users");
        if (result.length === 0) {
          // Debug: show what users exist
          const allUsers = await db
            .select({
              id: Tables.user.id,
              email: Tables.user.email,
              role: Tables.user.role,
            })
            .from(Tables.user)
            .limit(5);
          console.log("[Login] Users in database:", JSON.stringify(allUsers));
        }
        return result;
      }),
      Effect.map((users) => users[0]),
    );

    const passwordPlaceholder = yield* $(hashPassword(randomUUID()));

    if (!user) {
      yield* $(verifyPassword(passwordPlaceholder, password));

      // Log failed login attempt
      yield* $(
        query(async (db) => {
          await db.insert(Tables.authLog).values({
            email,
            action: "login_failed",
            errorMessage: "User not found",
          });
        }),
      );

      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "UserNotFound",
            statusCode: 400,
            clientMessage: "Invalid credenetials",
          }),
        ),
      );
    }

    const passwordMatch = yield* $(
      verifyPassword(user.passwordDigest ?? "", password),
    );

    if (!passwordMatch) {
      // Log failed login attempt
      yield* $(
        query(async (db) => {
          await db.insert(Tables.authLog).values({
            userId: user.id,
            email: user.email,
            action: "login_failed",
            errorMessage: "Invalid password",
          });
        }),
      );

      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "InvalidPassword",
            statusCode: 400,
            clientMessage: "Invalid credenetials",
          }),
        ),
      );
    }

    // If user is not verified, check if they're admin
    if (!user.emailVerified) {
      if (user.role === "admin") {
        // Admin users can bypass email verification
        const token = generateSessionToken();
        yield* $(createSession(token, user.id));
        return token;
      }

      // All non-admin users (including vendor role) must verify email
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "EmailNotVerified",
            statusCode: 400,
            clientMessage: "Please verify your email before logging in",
          }),
        ),
      );
    }

    const token = generateSessionToken();
    yield* $(createSession(token, user.id));

    // Log successful login
    yield* $(
      query(async (db) => {
        await db.insert(Tables.authLog).values({
          userId: user.id,
          email: user.email,
          action: "login_success",
        });
      }),
    );

    return token;
  });
