ALTER TABLE "order" ADD COLUMN "shipping_governorate_code" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "shipping_quote" jsonb;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "shipping_rules" jsonb;