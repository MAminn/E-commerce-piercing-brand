ALTER TABLE "order" ADD COLUMN "shipping_district" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "product_slug_idx" ON "product" USING btree ("slug");