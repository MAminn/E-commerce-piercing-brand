ALTER TYPE "public"."order_log_action" ADD VALUE 'items_edited';--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "stock_restored" boolean DEFAULT false NOT NULL;