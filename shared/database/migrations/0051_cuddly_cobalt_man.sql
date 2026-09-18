CREATE TYPE "public"."bundle_campaign_offer_stacking" AS ENUM('exclusive', 'stackable');--> statement-breakpoint
CREATE TYPE "public"."bundle_campaign_pricing_type" AS ENUM('fixed_total');--> statement-breakpoint
CREATE TYPE "public"."bundle_campaign_type" AS ENUM('build_your_stack');--> statement-breakpoint
CREATE TABLE "bundle_campaign" (
	"id" uuid PRIMARY KEY NOT NULL,
	"internal_name" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"badge_text" text,
	"image_id" uuid,
	"type" "bundle_campaign_type" DEFAULT 'build_your_stack' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"required_quantity" integer NOT NULL,
	"pricing_type" "bundle_campaign_pricing_type" DEFAULT 'fixed_total' NOT NULL,
	"fixed_bundle_price" numeric(10, 2),
	"allow_duplicates" boolean DEFAULT false NOT NULL,
	"max_per_product" integer,
	"is_repeatable" boolean DEFAULT false NOT NULL,
	"offer_stacking" "bundle_campaign_offer_stacking" DEFAULT 'exclusive' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bundle_campaign_product" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bundle_campaign_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bundle_campaign" ADD CONSTRAINT "bundle_campaign_image_id_file_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bundle_campaign_product" ADD CONSTRAINT "bundle_campaign_product_bundle_campaign_id_bundle_campaign_id_fk" FOREIGN KEY ("bundle_campaign_id") REFERENCES "public"."bundle_campaign"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bundle_campaign_product" ADD CONSTRAINT "bundle_campaign_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "bundle_campaign_slug_idx" ON "bundle_campaign" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "bundle_campaign_active_schedule_idx" ON "bundle_campaign" USING btree ("is_active","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bundle_campaign_product_unique_idx" ON "bundle_campaign_product" USING btree ("bundle_campaign_id","product_id");--> statement-breakpoint
CREATE INDEX "bundle_campaign_product_product_idx" ON "bundle_campaign_product" USING btree ("product_id");