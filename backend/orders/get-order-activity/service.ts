import { query } from "#root/shared/database/drizzle/db";
import { orderLog, webhookLog } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import type { ClientSession } from "#root/backend/auth/shared/entities";
import { ServerError } from "#root/shared/error/server";

export const getOrderActivitySchema = z.object({
  orderId: z.string().uuid(),
});

export type OrderActivityEntry =
  | {
      source: "order_log";
      id: string;
      createdAt: Date;
      action: string;
      oldStatus: string | null;
      newStatus: string | null;
      note: string | null;
    }
  | {
      source: "webhook_log";
      id: string;
      createdAt: Date;
      provider: string;
      webhookType: string;
      status: string;
      errorMessage: string | null;
      payload: unknown;
      processedAt: Date | null;
    };

/**
 * Full audit trail for one order, oldest first: order-level events
 * (created, payment confirmed/failed, Bosta sent/failed/skipped/cancelled,
 * Bosta status updates, admin status/item edits) interleaved with the raw
 * webhook payloads (Paymob, Bosta) that triggered them — everything needed
 * to reconstruct exactly what happened and why, without guessing.
 *
 * There is nothing to show before order creation: the cart/checkout stage
 * is client-side only and has no server-side row to log against.
 */
export const getOrderActivity = (
  input: z.infer<typeof getOrderActivitySchema>,
  session?: ClientSession,
) =>
  Effect.gen(function* ($) {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            statusCode: 401,
            clientMessage: "Unauthorized",
          }),
        ),
      );
    }

    const entries = yield* $(
      query(async (db) => {
        const [logRows, webhookRows] = await Promise.all([
          db
            .select()
            .from(orderLog)
            .where(eq(orderLog.orderId, input.orderId))
            .execute(),
          db
            .select()
            .from(webhookLog)
            .where(eq(webhookLog.orderId, input.orderId))
            .execute(),
        ]);

        const mappedLogs: OrderActivityEntry[] = logRows.map((row) => ({
          source: "order_log" as const,
          id: row.id,
          createdAt: row.createdAt,
          action: row.action,
          oldStatus: row.oldStatus,
          newStatus: row.newStatus,
          note: row.note,
        }));

        const mappedWebhooks: OrderActivityEntry[] = webhookRows.map((row) => ({
          source: "webhook_log" as const,
          id: row.id,
          createdAt: row.createdAt,
          provider: row.provider,
          webhookType: row.webhookType,
          status: row.status,
          errorMessage: row.errorMessage,
          payload: row.payload,
          processedAt: row.processedAt,
        }));

        return [...mappedLogs, ...mappedWebhooks].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }),
    );

    return entries;
  });
