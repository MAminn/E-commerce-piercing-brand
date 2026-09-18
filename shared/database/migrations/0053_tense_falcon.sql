ALTER TYPE "public"."bundle_campaign_type" ADD VALUE 'curated_stack';--> statement-breakpoint
CREATE TABLE "bundle_campaign_category" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bundle_campaign_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bundle_campaign" ADD COLUMN "subtitle" text;--> statement-breakpoint
ALTER TABLE "bundle_campaign_product" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "bundle_campaign_category" ADD CONSTRAINT "bundle_campaign_category_bundle_campaign_id_bundle_campaign_id_fk" FOREIGN KEY ("bundle_campaign_id") REFERENCES "public"."bundle_campaign"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bundle_campaign_category" ADD CONSTRAINT "bundle_campaign_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "bundle_campaign_category_unique_idx" ON "bundle_campaign_category" USING btree ("bundle_campaign_id","category_id");--> statement-breakpoint
CREATE INDEX "bundle_campaign_category_category_idx" ON "bundle_campaign_category" USING btree ("category_id");