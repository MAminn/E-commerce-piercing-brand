ALTER TYPE "public"."bundle_campaign_pricing_type" ADD VALUE 'percentage_discount';--> statement-breakpoint
CREATE TABLE "promo_code_excluded_product" (
	"id" uuid PRIMARY KEY NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bundle_campaign_tier" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bundle_campaign_tier" ADD COLUMN "discount_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "order_bundle" ADD COLUMN "pricing_type" "bundle_campaign_pricing_type" DEFAULT 'fixed_total' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_bundle" ADD COLUMN "discount_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "promo_code" ADD COLUMN "eligible_min_quantity" integer;--> statement-breakpoint
ALTER TABLE "promo_code" ADD COLUMN "eligible_max_quantity" integer;--> statement-breakpoint
ALTER TABLE "promo_code" ADD COLUMN "free_shipping" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_code_excluded_product" ADD CONSTRAINT "promo_code_excluded_product_promo_code_id_promo_code_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_code"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "promo_code_excluded_product" ADD CONSTRAINT "promo_code_excluded_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "promo_code_excluded_product_unique_idx" ON "promo_code_excluded_product" USING btree ("promo_code_id","product_id");