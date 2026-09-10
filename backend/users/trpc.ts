import { adminProcedure, publicProcedure, router } from "#root/shared/trpc/server";
import { z } from "zod";
import { eq, and, desc, ilike, ne, or, count, sql, sum, inArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { user, order, orderItem, account, session, trackingEvent } from "#root/shared/database/drizzle/schema";
import { auth } from "#root/backend/auth/auth.server.js";
import { TRPCError } from "@trpc/server";

export const usersRouter = router({
  /** Admin-only: list all registered users with pagination */
  list: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const { limit, offset, search } = input;

      // Superadmin is a hidden, higher-privilege identity bootstrapped from
      // env vars — it should never show up in the regular admin Users list.
      const notSuperadmin = ne(user.role, "superadmin");
      const where = search
        ? and(
            notSuperadmin,
            or(
              ilike(user.name, `%${search}%`),
              ilike(user.email, `%${search}%`),
              ilike(user.phone, `%${search}%`),
            ),
          )
        : notSuperadmin;

      const [rows, totalRows] = await Promise.all([
        db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt,
          })
          .from(user)
          .where(where)
          .orderBy(desc(user.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: count() })
          .from(user)
          .where(where),
      ]);

      return {
        success: true as const,
        result: {
          users: rows,
          total: totalRows[0]?.total ?? 0,
        },
      };
    }),

  /** Admin-only: get a single user with their full order history */
  getById: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db;

      const userRows = await db
        .select()
        .from(user)
        .where(eq(user.id, input.id))
        .limit(1);

      const userRow = userRows[0];
      if (!userRow || userRow.role === "superadmin") {
        return { success: false as const, error: "User not found" };
      }

      const orders = await db
        .select()
        .from(order)
        .where(eq(order.userId, input.id))
        .orderBy(desc(order.createdAt));

      const orderIds = orders.map((o) => o.id);

      let items: (typeof orderItem.$inferSelect)[] = [];
      if (orderIds.length > 0) {
        // Fetch order items for all orders
        const { inArray } = await import("drizzle-orm");
        items = await db
          .select()
          .from(orderItem)
          .where(inArray(orderItem.orderId, orderIds));
      }

      const itemsByOrder = items.reduce<Record<string, typeof items>>((acc, item) => {
        (acc[item.orderId] ??= []).push(item);
        return acc;
      }, {});

      return {
        success: true as const,
        result: {
          ...userRow,
          orders: orders.map((o) => ({
            ...o,
            items: itemsByOrder[o.id] ?? [],
          })),
        },
      };
    }),

  /** Admin-only: create a new user */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email"),
        password: z.string().min(8, "Password must be at least 8 characters"),
        phone: z.string().default(""),
        role: z.enum(["admin", "vendor", "user"]).default("user"),
        emailVerified: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;

      // Check email uniqueness
      const existing = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, input.email.toLowerCase()))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
      }

      // Create user via better-auth API
      const result = await auth.api.signUpEmail({
        body: {
          email: input.email,
          password: input.password,
          name: input.name,
          phone: input.phone,
        },
        asResponse: false,
      }).catch((err: unknown) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Failed to create user",
        });
      });

      if (!result?.user?.id) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });
      }

      // Set role and emailVerified
      await db
        .update(user)
        .set({
          role: input.role,
          emailVerified: input.emailVerified,
          phone: input.phone,
          updatedAt: new Date(),
        })
        .where(eq(user.id, result.user.id));

      return { success: true as const, result: { id: result.user.id } };
    }),

  /** Admin-only: update a user's profile details */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        role: z.enum(["admin", "vendor", "user"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const { id, ...fields } = input;

      const existing = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, id)).limit(1);
      if (!existing.length || existing[0]?.role === "superadmin") {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await db
        .update(user)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(user.id, id));

      return { success: true as const };
    }),

  /** Admin-only: delete a user and cascade their sessions */
  delete: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;

      const existing = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, input.id)).limit(1);
      if (!existing.length || existing[0]?.role === "superadmin") {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Delete sessions and account rows first (cascade not always reliable for better-auth tables)
      await db.delete(session).where(eq(session.userId, input.id));
      await db.delete(account).where(eq(account.userId, input.id));
      await db.delete(user).where(eq(user.id, input.id));

      return { success: true as const };
    }),

  /** Admin-only: set email verification status */
  setVerified: adminProcedure
    .input(z.object({ id: z.string().min(1), verified: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(eq(user.id, input.id))
        .limit(1);
      if (!existing.length || existing[0]?.role === "superadmin") {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await ctx.db
        .update(user)
        .set({ emailVerified: input.verified, updatedAt: new Date() })
        .where(eq(user.id, input.id));
      return { success: true as const };
    }),

  /** Admin-only: admin sets a new password for a user */
  adminSetPassword: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;

      const userRow = await db
        .select({ id: user.id, email: user.email, role: user.role })
        .from(user)
        .where(eq(user.id, input.id))
        .limit(1);

      if (!userRow.length || userRow[0]?.role === "superadmin") {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const hashedPassword = await hashPassword(input.newPassword);

      // Upsert: update existing credential account, or insert one if missing
      // (covers old users who have no account row yet — admin resets their password
      // which creates the account row so they can log in with the new password).
      const existingAccount = await ctx.db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, input.id), eq(account.providerId, "credential")))
        .limit(1);

      if (existingAccount.length > 0 && existingAccount[0]) {
        await ctx.db
          .update(account)
          .set({ password: hashedPassword, updatedAt: new Date() })
          .where(eq(account.id, existingAccount[0].id));
      } else {
        const targetUser = userRow[0]!;
        await ctx.db.insert(account).values({
          id: crypto.randomUUID(),
          accountId: targetUser.email,
          providerId: "credential",
          userId: input.id,
          password: hashedPassword,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return { success: true as const };
    }),

  /** Admin-only: get all user emails in one shot (for broadcast targeting) */
  getAllEmails: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ email: user.email })
      .from(user)
      .where(ne(user.role, "superadmin"))
      .orderBy(user.email);
    return { success: true as const, result: { emails: rows.map((r) => r.email) } };
  }),

  /** Admin-only: ban/unban a user */
  setBanned: adminProcedure
    .input(z.object({ id: z.string().min(1), banned: z.boolean(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(eq(user.id, input.id))
        .limit(1);
      if (!existing.length || existing[0]?.role === "superadmin") {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await ctx.db
        .update(user)
        .set({
          banned: input.banned,
          banReason: input.banned ? (input.reason ?? null) : null,
          updatedAt: new Date(),
        })
        .where(eq(user.id, input.id));
      return { success: true as const };
    }),

  /** Admin-only: get full behavioral activity + analytics for one user */
  getActivity: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db;

      // ── Tracking event counts per event type for this user ──────────────
      const eventCounts = await db
        .select({ eventName: trackingEvent.eventName, total: count() })
        .from(trackingEvent)
        .where(eq(trackingEvent.userId, input.id))
        .groupBy(trackingEvent.eventName);

      const countMap: Record<string, number> = {};
      for (const e of eventCounts) countMap[e.eventName] = e.total;

      // ── Products added to cart (with per-product tally) ─────────────────
      const cartEventRows = await db
        .select({
          productId: sql<string>`${trackingEvent.eventData}->>'productId'`,
          productName: sql<string>`${trackingEvent.eventData}->>'productName'`,
          createdAt: trackingEvent.createdAt,
        })
        .from(trackingEvent)
        .where(
          and(
            eq(trackingEvent.userId, input.id),
            eq(trackingEvent.eventName, "product_added_to_cart"),
          ),
        )
        .orderBy(desc(trackingEvent.createdAt));

      const cartMap = new Map<string, { productId: string; productName: string; count: number }>();
      for (const row of cartEventRows) {
        if (!row.productId) continue;
        const existing = cartMap.get(row.productId);
        if (existing) { existing.count++; }
        else { cartMap.set(row.productId, { productId: row.productId, productName: row.productName ?? "Unknown", count: 1 }); }
      }
      const cartProducts = [...cartMap.values()].sort((a, b) => b.count - a.count);

      // ── Products viewed (with per-product tally) ────────────────────────
      const viewedEventRows = await db
        .select({
          productId: sql<string>`${trackingEvent.eventData}->>'productId'`,
          productName: sql<string>`${trackingEvent.eventData}->>'productName'`,
        })
        .from(trackingEvent)
        .where(
          and(
            eq(trackingEvent.userId, input.id),
            eq(trackingEvent.eventName, "product_viewed"),
          ),
        );

      const viewedMap = new Map<string, { productId: string; productName: string; count: number }>();
      for (const row of viewedEventRows) {
        if (!row.productId) continue;
        const existing = viewedMap.get(row.productId);
        if (existing) { existing.count++; }
        else { viewedMap.set(row.productId, { productId: row.productId, productName: row.productName ?? "Unknown", count: 1 }); }
      }
      const viewedProducts = [...viewedMap.values()].sort((a, b) => b.count - a.count).slice(0, 10);

      // ── Orders for this user ─────────────────────────────────────────────
      const orders = await db
        .select({
          id: order.id,
          total: order.total,
          status: order.status,
          createdAt: order.createdAt,
          paymentMethod: order.paymentMethod,
        })
        .from(order)
        .where(eq(order.userId, input.id))
        .orderBy(desc(order.createdAt));

      const completedStatuses = ["delivered", "completed", "confirmed", "processing"];
      const completedOrders = orders.filter((o) => completedStatuses.includes(o.status));
      const cancelledOrders = orders.filter((o) => o.status === "cancelled");
      const totalSpent = completedOrders.reduce((s, o) => s + Number(o.total), 0);
      const avgOrderValue = completedOrders.length > 0 ? totalSpent / completedOrders.length : 0;

      // ── Order items for completed orders (to find favourite products) ───
      const completedIds = completedOrders.map((o) => o.id);
      let topPurchased: { productId: string; productName: string; timesBought: number; totalSpent: number }[] = [];
      if (completedIds.length > 0) {
        const items = await db
          .select({
            productId: orderItem.productId,
            name: orderItem.name,
            totalQty: sql<number>`sum(${orderItem.quantity})`,
            totalSpent: sql<number>`sum(${orderItem.price} * ${orderItem.quantity})`,
          })
          .from(orderItem)
          .where(inArray(orderItem.orderId, completedIds))
          .groupBy(orderItem.productId, orderItem.name)
          .orderBy(desc(sql`sum(${orderItem.quantity})`));

        topPurchased = items.map((i) => ({
          productId: i.productId ?? "",
          productName: i.name,
          timesBought: Number(i.totalQty),
          totalSpent: Math.round(Number(i.totalSpent) * 100) / 100,
        }));
      }

      return {
        success: true as const,
        result: {
          // Funnel counts
          pageViews: countMap["page_viewed"] ?? 0,
          productViews: countMap["product_viewed"] ?? 0,
          cartAdds: countMap["product_added_to_cart"] ?? 0,
          checkoutStarts: countMap["checkout_started"] ?? 0,
          purchasesTracked: countMap["checkout_completed"] ?? 0,
          // Products
          cartProducts,
          viewedProducts,
          topPurchased,
          // Orders
          totalOrders: orders.length,
          completedOrdersCount: completedOrders.length,
          cancelledOrdersCount: cancelledOrders.length,
          pendingOrdersCount: orders.length - completedOrders.length - cancelledOrders.length,
          totalSpent: Math.round(totalSpent * 100) / 100,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
          firstOrderAt: orders.length > 0 ? orders[orders.length - 1]!.createdAt : null,
          lastOrderAt: orders.length > 0 ? orders[0]!.createdAt : null,
          recentOrders: orders.slice(0, 15).map((o) => ({
            id: o.id,
            total: Number(o.total),
            status: o.status,
            createdAt: o.createdAt,
            paymentMethod: o.paymentMethod,
          })),
        },
      };
    }),
});
