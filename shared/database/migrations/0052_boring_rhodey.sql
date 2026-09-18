CREATE TABLE "order_bundle" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"instance_id" text NOT NULL,
	"campaign_id" uuid,
	"campaign_slug" text NOT NULL,
	"campaign_title" text NOT NULL,
	"required_quantity" integer NOT NULL,
	"regular_total" numeric(10, 2) NOT NULL,
	"bundle_total" numeric(10, 2) NOT NULL,
	"offer_stacking" "bundle_campaign_offer_stacking" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "order_bundle_id" uuid;--> statement-breakpoint
ALTER TABLE "order_bundle" ADD CONSTRAINT "order_bundle_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "order_bundle" ADD CONSTRAINT "order_bundle_campaign_id_bundle_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."bundle_campaign"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "order_bundle_order_idx" ON "order_bundle" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_bundle_id_order_bundle_id_fk" FOREIGN KEY ("order_bundle_id") REFERENCES "public"."order_bundle"("id") ON DELETE set null ON UPDATE cascade;