ALTER TABLE "order" ADD COLUMN "bosta_delivery_id" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "bosta_tracking_number" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "bosta_status" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "bosta_status_code" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "bosta_webhook_data" jsonb;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "bosta_status_updated_at" timestamp with time zone;