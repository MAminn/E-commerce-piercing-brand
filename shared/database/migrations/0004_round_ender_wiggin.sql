ALTER TABLE "order" ADD COLUMN "fincart_tracking_number" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_status" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_sub_status" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_support_note" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_return_tracking_number" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_status_updated_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fincart_webhook_data" jsonb;