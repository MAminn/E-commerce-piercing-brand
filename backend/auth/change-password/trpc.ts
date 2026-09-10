import { protectedProcedure } from "#root/shared/trpc/server.js";
import { z } from "zod";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { TRPCError } from "@trpc/server";
import { account } from "#root/shared/database/drizzle/schema.js";
import { and, eq } from "drizzle-orm";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const changePasswordProcedure = protectedProcedure
  .input(changePasswordSchema)
  .mutation(async ({ ctx, input }) => {
    // 1. Get the user's credential account row
    const accountRow = await ctx.db
      .select({ id: account.id, password: account.password })
      .from(account)
      .where(
        and(
          eq(account.userId, ctx.clientSession.id),
          eq(account.providerId, "credential"),
        ),
      )
      .limit(1);

    if (!accountRow.length || !accountRow[0]?.password) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No password set for this account" });
    }

    // 2. Verify current password against the better-auth scrypt hash
    const isValid = await verifyPassword({ hash: accountRow[0].password, password: input.currentPassword });
    if (!isValid) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect" });
    }

    // 3. Hash the new password with better-auth's scrypt and save
    const hashedPassword = await hashPassword(input.newPassword);
    await ctx.db
      .update(account)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(account.id, accountRow[0].id));

    return { success: true as const };
  });
