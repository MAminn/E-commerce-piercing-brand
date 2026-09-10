CREATE TABLE "product_review" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid,
	"user_name" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "product_variant" DROP CONSTRAINT "product_variant_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "vendor_name" text;--> statement-breakpoint
ALTER TABLE "vendor" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "vendor" ADD COLUMN "logo_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor" ADD COLUMN "social_links" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "vendor" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_logo_id_file_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE cascade;