import { query } from "#root/shared/database/drizzle/db";
import { order } from "#root/shared/database/drizzle/schema";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ServerError } from "#root/shared/error/server";
import { enqueueReviewCheckForOrder } from "#root/backend/email-automations/triggers/order-delivered";

// Define the webhook payload schema based on Fincart documentation
const fincartWebhookPayloadSchema = z.object({
  status: z.enum([
    "pending",
    "processing",
    "successful",
    "unsuccessful",
    "cancelled",
  ]),
  subStatus: z
    .enum([
      "new",
      "picked up",
      "at courier hub",
      "out for delivery",
      "failed attempt",
      "delivered to customer",
      "delivery failed & returned to merchant",
      "problematic",
      "cancelled",
      "out of zone",
      "action required",
      "to be returned",
      "rejected",
      "rescheduled",
    ])
    .optional(),
  rejectionReason: z
    .enum([
      "no answer",
      "rejected",
      "reschedule",
      "out of zone",
      "action required",
      "to be returned",
    ])
    .optional()
    .nullable(),
  supportNote: z.string().optional().nullable(),
  trackingNumber: z.string(),
  returnTrackingNumber: z.string().optional().nullable(),
  statusUpdatedDate: z.number(),
  orderId: z.string(),
  orderNumber: z.string(),
});

export type FincartWebhookPayload = z.infer<typeof fincartWebhookPayloadSchema>;

// Schema for the webhook request
export const fincartWebhookSchema = z.object({
  payload: fincartWebhookPayloadSchema,
  webhookToken: z.string(),
});

export type FincartWebhookRequest = z.infer<typeof fincartWebhookSchema>;

// Schema for the response
export const fincartWebhookResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

export type FincartWebhookResponse = z.infer<
  typeof fincartWebhookResponseSchema
>;

// Map Fincart status to our internal order status
const mapFincartStatusToOrderStatus = (
  status: string,
  subStatus?: string
): "pending" | "processing" | "shipped" | "delivered" | "cancelled" => {
  switch (status) {
    case "pending":
      return "pending";
    case "processing":
      if (subStatus === "out for delivery") {
        return "shipped";
      }
      return "processing";
    case "successful":
      return "delivered";
    case "unsuccessful":
      return "processing"; // This could be handled differently based on your business logic
    case "cancelled":
      return "cancelled";
    default:
      return "processing";
  }
};

export const processFincartWebhook = (
  input: FincartWebhookRequest,
  secretToken: string
) =>
  Effect.gen(function* ($) {
    // Validate the webhook token against our stored secret token
    if (input.webhookToken !== secretToken) {
      return yield* $(
        Effect.fail(
          new ServerError({
            tag: "Unauthorized",
            message: "Invalid webhook token",
            statusCode: 401,
            clientMessage: "Unauthorized",
          })
        )
      );
    }

    const { payload } = input;
    const {
      orderId,
      trackingNumber,
      status,
      subStatus,
      rejectionReason,
      supportNote,
      returnTrackingNumber,
      statusUpdatedDate,
    } = payload;

    // Map Fincart status to our system's order status
    const mappedStatus = mapFincartStatusToOrderStatus(status, subStatus);

    return yield* $(
      query(async (db) => {
        try {
          // First, check if the order exists
          const existingOrder = await db
            .select({ id: order.id, status: order.status })
            .from(order)
            .where(eq(order.id, orderId))
            .execute();

          if (!existingOrder || existingOrder.length === 0) {
            throw new ServerError({
              tag: "OrderNotFound",
              message: `Order with ID ${orderId} not found`,
              statusCode: 404,
              clientMessage: "Order not found",
            });
          }

          // Update the order with Fincart tracking information
          const updateResult = await db
            .update(order)
            .set({
              status: mappedStatus,
              fincartStatus: status,
              fincartSubStatus: subStatus,
              fincartTrackingNumber: trackingNumber,
              fincartRejectionReason: rejectionReason,
              fincartSupportNote: supportNote,
              fincartReturnTrackingNumber: returnTrackingNumber,
              fincartStatusUpdatedDate: new Date(statusUpdatedDate),
              fincartWebhookData: payload as unknown as Record<string, unknown>, // Store the complete webhook data
              updatedAt: new Date(),
            })
            .where(eq(order.id, orderId))
            .returning();

          if (!updateResult || updateResult.length === 0) {
            throw new ServerError({
              tag: "UpdateFailed",
              message: "Failed to update order with Fincart data",
              statusCode: 500,
              clientMessage: "Failed to update order status",
            });
          }

          if (mappedStatus === "delivered" && existingOrder[0]!.status !== "delivered") {
            await enqueueReviewCheckForOrder({
              orderId,
              customerEmail: updateResult[0]!.customerEmail,
              customerName: updateResult[0]!.customerName,
            });
          }

          return {
            success: true,
            message: "Webhook processed successfully",
            order: updateResult[0],
          };
        } catch (error) {
          console.error("Error processing Fincart webhook:", error);

          if (error instanceof ServerError) {
            throw error;
          }

          throw new ServerError({
            tag: "InternalServerError",
            message: "Failed to process webhook",
            statusCode: 500,
            clientMessage: "Internal server error",
          });
        }
      })
    );
  });
