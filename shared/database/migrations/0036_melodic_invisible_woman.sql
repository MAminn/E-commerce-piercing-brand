ALTER TABLE "order" ADD COLUMN "bosta_sync_status" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "bosta_sync_error" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "bosta_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "bosta_sync_attempted_at" timestamp with time zone;