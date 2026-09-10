ALTER TABLE "order" ADD COLUMN "fincart_tracking_number" text;
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_status" text;
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_sub_status" text;
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_rejection_reason" text;
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_support_note" text;
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_return_tracking_number" text;
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_status_updated_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_webhook_data" jsonb;
--> statement-breakpoint
COMMENT ON COLUMN "order"."fincart_tracking_number" IS 'Tracking number assigned by Fincart';
--> statement-breakpoint
COMMENT ON COLUMN "order"."fincart_status" IS 'Current order status in Fincart system (pending, processing, successful, unsuccessful, cancelled)';
--> statement-breakpoint
COMMENT ON COLUMN "order"."fincart_sub_status" IS 'Detailed status from Fincart (picked up, out for delivery, etc.)';
--> statement-breakpoint
COMMENT ON COLUMN "order"."fincart_rejection_reason" IS 'Reason for rejection if applicable';
--> statement-breakpoint
COMMENT ON COLUMN "order"."fincart_support_note" IS 'Additional notes from Fincart support';
--> statement-breakpoint
COMMENT ON COLUMN "order"."fincart_return_tracking_number" IS 'Tracking number for returned items';
--> statement-breakpoint
COMMENT ON COLUMN "order"."fincart_status_updated_date" IS 'Timestamp when Fincart last updated the status';
--> statement-breakpoint
COMMENT ON COLUMN "order"."fincart_webhook_data" IS 'Raw JSON data received from the most recent Fincart webhook call'; 