import { query } from "#root/shared/database/drizzle/db";
import { order } from "#root/shared/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { ServerError } from "#root/shared/error/server";
import { mapBostaStateToOrderStatus } from "./service";
import { logOrderEvent, recordWebhookLog } from "#root/backend/orders/order-log";
import { enqueueReviewCheckForOrder } from "#root/backend/email-automations/triggers/order-delivered";

// ─── Webhook payload schema ───────────────────────────────────────────────────
// Bosta sends this JSON body to our webhook URL on every status change.

export const bostaWebhookSchema = z.object({
  /** Bosta delivery state */
  state: z.object({
    code: z.number(),
    value: z.string(),
  }),
  trackingNumber: z.string(),
  /** The businessReference we set when creating the delivery = our order ID */
  businessReference: z.string().optional().nullable(),
  type: z.number().optional(),
  cod: z.number().optional(),
  updatedAt: z.string().optional(),
  /** Raw payload preserved for debugging */
}).passthrough();

export type BostaWebhookPayload = z.infer<typeof bostaWebhookSchema>;

// ─── Processing ───────────────────────────────────────────────────────────────

export const processBostaWebhook = (
  payload: BostaWebhookPayload,
  authToken: string,
  expectedSecret: string,
) =>
  Effect.gen(function* ($) {
    // Validate secret
    if (authToken !== expectedSecret) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            message: "Invalid Bosta webhook token",
            statusCode: 401,
            clientMessage: "Unauthorized",
          }),
        ),
      );
    }

    const orderId = payload.businessReference;
    if (!orderId) {
      // Bosta can fire webhooks for deliveries not created through us — ignore silently
      return { success: true, skipped: true };
    }

    const mappedStatus = mapBostaStateToOrderStatus(payload.state.code);

    // Append-only, independent of the order row's single-slot bostaWebhookData.
    yield* $(
      Effect.promise(() =>
        recordWebhookLog({
          webhookType: "delivery_status",
          provider: "bosta",
          payload: payload as unknown as Record<string, unknown>,
          orderId,
        }),
      ),
    );

    return yield* $(
      query(async (db) => {
        const existing = await db
          .select({
            id: order.id,
            status: order.status,
            customerEmail: order.customerEmail,
            customerName: order.customerName,
          })
          .from(order)
          .where(eq(order.id, orderId))
          .execute();

        if (!existing.length) {
          // Delivery not linked to an order we know about — ignore
          return { success: true, skipped: true };
        }

        const previousStatus = existing[0]!.status;

        await db
          .update(order)
          .set({
            status: mappedStatus,
            bostaStatus: payload.state.value,
            bostaStatusCode: String(payload.state.code),
            bostaStatusUpdatedAt: payload.updatedAt ? new Date(payload.updatedAt) : new Date(),
            bostaWebhookData: payload as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          })
          .where(eq(order.id, orderId))
          .execute();

        if (mappedStatus !== previousStatus) {
          await logOrderEvent({
            orderId,
            action: "bosta_status_updated",
            oldStatus: previousStatus,
            newStatus: mappedStatus,
            note: `Bosta reported "${payload.state.value}" (code ${payload.state.code})`,
          });

          if (mappedStatus === "delivered") {
            await enqueueReviewCheckForOrder({
              orderId,
              customerEmail: existing[0]!.customerEmail,
              customerName: existing[0]!.customerName,
            });
          }
        }

        console.log(
          `[Bosta Webhook] Order ${orderId} → status: ${mappedStatus} (Bosta: ${payload.state.value})`,
        );

        return { success: true, skipped: false };
      }),
    );
  });
