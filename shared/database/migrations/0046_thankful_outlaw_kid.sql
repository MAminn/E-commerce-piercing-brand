CREATE TYPE "public"."email_automation_type" AS ENUM('welcome', 'review_check', 'abandoned_cart', 'abandoned_browse', 'win_back', 'new_drops', 'flash_offer', 'retention');--> statement-breakpoint
CREATE TYPE "public"."scheduled_email_locale" AS ENUM('en', 'ar');--> statement-breakpoint
CREATE TYPE "public"."scheduled_email_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."pixel_platform" ADD VALUE 'clarity';--> statement-breakpoint
CREATE TABLE "captured_cart" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_token" text NOT NULL,
	"user_id" text,
	"email" text,
	"phone" text,
	"items" jsonb NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"converted_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_subscription" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"automation_type" "email_automation_type" NOT NULL,
	"step_key" text DEFAULT 'default' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"subject_en" text NOT NULL,
	"subject_ar" text NOT NULL,
	"preheader_en" text,
	"preheader_ar" text,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "popup_claim" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"promo_code_id" uuid,
	"issued_code" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "scheduled_email" (
	"id" uuid PRIMARY KEY NOT NULL,
	"automation_type" "email_automation_type" NOT NULL,
	"recipient_email" text NOT NULL,
	"locale" "scheduled_email_locale" DEFAULT 'en' NOT NULL,
	"payload" jsonb NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "scheduled_email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"dedupe_key" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viewed_product" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_token" text NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"product_image_url" text,
	"email" text,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "popup_config" jsonb;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "popup_discount_config" jsonb;--> statement-breakpoint
ALTER TABLE "captured_cart" ADD CONSTRAINT "captured_cart_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captured_cart" ADD CONSTRAINT "captured_cart_converted_order_id_order_id_fk" FOREIGN KEY ("converted_order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "popup_claim" ADD CONSTRAINT "popup_claim_promo_code_id_promo_code_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_code"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewed_product" ADD CONSTRAINT "viewed_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "captured_cart_session_token_idx" ON "captured_cart" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "captured_cart_email_activity_idx" ON "captured_cart" USING btree ("email","last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_subscription_email_idx" ON "email_subscription" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "email_subscription_token_idx" ON "email_subscription" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE UNIQUE INDEX "email_template_automation_step_idx" ON "email_template" USING btree ("automation_type","step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "popup_claim_email_idx" ON "popup_claim" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "popup_claim_phone_idx" ON "popup_claim" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_email_dedupe_key_idx" ON "scheduled_email" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "scheduled_email_status_scheduled_for_idx" ON "scheduled_email" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "scheduled_email_recipient_email_idx" ON "scheduled_email" USING btree ("recipient_email");--> statement-breakpoint
CREATE UNIQUE INDEX "viewed_product_session_product_idx" ON "viewed_product" USING btree ("session_token","product_id");--> statement-breakpoint
CREATE INDEX "viewed_product_email_viewed_idx" ON "viewed_product" USING btree ("email","viewed_at");