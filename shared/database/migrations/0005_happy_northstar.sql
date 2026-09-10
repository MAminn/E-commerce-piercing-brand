CREATE TYPE "public"."discount_type" AS ENUM('percentage', 'fixed_amount');--> statement-breakpoint
CREATE TYPE "public"."promo_code_status" AS ENUM('active', 'inactive', 'expired', 'exhausted', 'scheduled');--> statement-breakpoint
CREATE TABLE "promo_code" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"status" "promo_code_status" DEFAULT 'inactive' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"usage_limit_per_user" integer,
	"min_purchase_amount" numeric(10, 2),
	"applies_to_all_products" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "promo_code_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "promo_code_category" (
	"id" uuid PRIMARY KEY NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_code_product" (
	"id" uuid PRIMARY KEY NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "discount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "promo_code_id" uuid;--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "discount_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "discount_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "promo_code" ADD CONSTRAINT "promo_code_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "promo_code_category" ADD CONSTRAINT "promo_code_category_promo_code_id_promo_code_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_code"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "promo_code_category" ADD CONSTRAINT "promo_code_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "promo_code_product" ADD CONSTRAINT "promo_code_product_promo_code_id_promo_code_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_code"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "promo_code_product" ADD CONSTRAINT "promo_code_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "promo_code_code_idx" ON "promo_code" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_code_category_unique_idx" ON "promo_code_category" USING btree ("promo_code_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_code_product_unique_idx" ON "promo_code_product" USING btree ("promo_code_id","product_id");--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_promo_code_id_promo_code_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_code"("id") ON DELETE set null ON UPDATE cascade;