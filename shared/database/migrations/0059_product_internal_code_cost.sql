ALTER TABLE "product" ADD COLUMN "internal_code" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "cost_price" numeric(10, 2);--> statement-breakpoint
CREATE UNIQUE INDEX "product_internal_code_idx" ON "product" USING btree ("internal_code");