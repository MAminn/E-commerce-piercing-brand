ALTER TABLE "bundle_campaign" ADD COLUMN "free_shipping" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_bundle" ADD COLUMN "free_shipping" boolean DEFAULT false NOT NULL;