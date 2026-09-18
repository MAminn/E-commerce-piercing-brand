ALTER TABLE "bundle_campaign_product" ADD COLUMN "selected_options" jsonb;--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "selected_options" jsonb;