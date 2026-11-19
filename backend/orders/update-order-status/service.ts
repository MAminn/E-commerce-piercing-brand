import { query } from "#root/shared/database/drizzle/db";
import { Effect } from "effect";
import { z } from "zod";
import type { ClientSession } from "#root/backend/auth/shared/entities";
import { ServerError } from "#root/shared/error/server";
import { applyOrderStatusChange, ORDER_STATUSES } from "./apply-status-change";

export const updateOrderStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(ORDER_STATUSES),
});

export const updateOrderStatus = (
  input: z.infer<typeof updateOrderStatusSchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            message: "You must be logged in to update order status",
            statusCode: 401,
            clientMessage: "You must be logged in to update order status",
          }),
        ),
      );
    }

    const { orderId, status } = input;
    const isAdmin = session.role === "admin" || session.role === "superadmin";

    // Only admins can update orders
    if (!isAdmin) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Forbidden",
            message: "Admin access required",
            statusCode: 403,
            clientMessage: "Admin access required",
          }),
        ),
      );
    }

    // The transactional core (stock restore on first cancel, order_log row,
    // review-email enqueue on delivered) is shared with the ABS live writer:
    // apply-status-change.ts.
    return yield* $(
      query(async (db) => {
        return await db.transaction(async (tx) => {
          const result = await applyOrderStatusChange(tx, {
            orderId,
            newStatus: status,
            actor: { kind: "user", email: session.email, role: session.role },
          });
          return result.order;
        });
      }),
    );
  });
