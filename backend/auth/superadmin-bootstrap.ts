import type { FastifyInstance } from "fastify";
import { eq, sql, and } from "drizzle-orm";
import { user as userTable, account } from "#root/shared/database/drizzle/schema.js";
import { hashPassword } from "better-auth/crypto";
import { auth } from "./auth.server.js";

/**
 * Bootstraps a superadmin account from env vars, mirroring the ADMIN_EMAIL/
 * ADMIN_PASSWORD pattern in ./api.ts. Kept as a separate function (not folded
 * into authFastifyPlugin) because this is a distinct, higher-privilege
 * identity — it should never end up assignable from the regular admin Users
 * page, only from env vars a human with prod deploy access controls.
 */
export async function bootstrapSuperadmin(app: FastifyInstance): Promise<void> {
  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "").replace(/^=/, "").trim();
  const superadminPassword = (process.env.SUPERADMIN_PASSWORD || "").replace(/^=/, "").trim();

  if (!superadminEmail || !superadminPassword) {
    console.warn(
      "[Auth] SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD not set — skipping superadmin bootstrap",
    );
    return;
  }

  console.log(`[Auth] Bootstrapping superadmin with email: ${superadminEmail}`);

  try {
    const existing = await app.db
      .select({ id: userTable.id, role: userTable.role })
      .from(userTable)
      .where(eq(sql`lower(${userTable.email})`, superadminEmail.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      const existingRecord = existing[0]!;

      await app.db
        .update(userTable)
        .set({ role: "superadmin", emailVerified: true })
        .where(eq(userTable.id, existingRecord.id));

      const hashedPassword = await hashPassword(superadminPassword);
      const existingAccount = await app.db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, existingRecord.id), eq(account.providerId, "credential")))
        .limit(1);

      if (existingAccount.length > 0 && existingAccount[0]) {
        await app.db
          .update(account)
          .set({ password: hashedPassword, updatedAt: new Date() })
          .where(eq(account.id, existingAccount[0].id));
      } else {
        await app.db.insert(account).values({
          id: crypto.randomUUID(),
          accountId: superadminEmail,
          providerId: "credential",
          userId: existingRecord.id,
          password: hashedPassword,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      console.log("[Auth] Superadmin account synced from env (password, role, emailVerified)");
      return;
    }

    const result = await auth.api.signUpEmail({
      body: {
        email: superadminEmail,
        password: superadminPassword,
        name: "Superadmin",
        phone: "",
      },
      asResponse: false,
    });

    if (result?.user?.id) {
      await app.db
        .update(userTable)
        .set({ role: "superadmin", emailVerified: true })
        .where(eq(userTable.id, result.user.id));
      console.log("[Auth] Superadmin account created successfully");
    }
  } catch (err) {
    console.error("[Auth] Superadmin bootstrap error:", err);
  }
}
