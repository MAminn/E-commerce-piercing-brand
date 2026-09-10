import { auth } from "./auth.server.js";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";
import { eq, sql, and } from "drizzle-orm";
import { user as userTable, account } from "#root/shared/database/drizzle/schema.js";
import { hashPassword } from "better-auth/crypto";

export const authFastifyPlugin = ((app: FastifyInstance, _, done) => {
  // Normalize env vars (Coolify sometimes adds leading '=')
  const adminEmail = (process.env.ADMIN_EMAIL || "").replace(/^=/, "").trim();
  const adminPassword = (process.env.ADMIN_PASSWORD || "")
    .replace(/^=/, "")
    .trim();

  if (!adminEmail || !adminPassword) {
    console.warn("[Auth] ADMIN_EMAIL and ADMIN_PASSWORD not set — skipping admin bootstrap");
    done();
    return;
  }

  console.log(`[Auth] Bootstrapping admin with email: ${adminEmail}`);

  // Bootstrap admin user via better-auth on startup
  Promise.resolve().then(async () => {
    try {
      // Check if admin already exists
      const existing = await app.db
        .select({ id: userTable.id, role: userTable.role })
        .from(userTable)
        .where(eq(sql`lower(${userTable.email})`, adminEmail.toLowerCase()))
        .limit(1);

      if (existing.length > 0) {
        const existingRecord = existing[0]!;

        // Always force-sync: role, emailVerified, and password from env
        await app.db
          .update(userTable)
          .set({ role: "admin", emailVerified: true })
          .where(eq(userTable.id, existingRecord.id));

        // Upsert the credential account row with a fresh scrypt hash
        const hashedPassword = await hashPassword(adminPassword);
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
            accountId: adminEmail,
            providerId: "credential",
            userId: existingRecord.id,
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        console.log("[Auth] Admin account synced from env (password, role, emailVerified)");
        return;
      }

      // Create admin via better-auth signup
      const result = await auth.api.signUpEmail({
        body: {
          email: adminEmail,
          password: adminPassword,
          name: "Admin",
          phone: "+201001112233",
        },
        asResponse: false,
      });

      if (result?.user?.id) {
        // Set role to admin and mark email as verified
        await app.db
          .update(userTable)
          .set({ role: "admin", emailVerified: true })
          .where(eq(userTable.id, result.user.id));
        console.log("[Auth] Admin account created successfully");
      }
    } catch (err) {
      console.error("[Auth] Admin bootstrap error:", err);
    }
  });

  // GET /api/auth/me — compatibility endpoint for SSR session restore
  app.get("/me", async (req, res) => {
    if (!req.clientSession) {
      return res.status(401).send({ success: false, error: "Not authenticated" });
    }
    return res.status(200).send({ success: true, result: req.clientSession });
  });

  done();
}) satisfies FastifyPluginCallback;

