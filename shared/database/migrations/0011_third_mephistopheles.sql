CREATE TYPE "public"."attribution_channel" AS ENUM('organic', 'paid_meta', 'paid_google', 'paid_tiktok', 'paid_snapchat', 'paid_pinterest', 'direct', 'email', 'referral', 'social');--> statement-breakpoint
CREATE TYPE "public"."consent_method" AS ENUM('banner_accept', 'banner_reject', 'settings_page', 'implied');--> statement-breakpoint
CREATE TYPE "public"."custom_event_trigger_type" AS ENUM('manual', 'css_selector', 'url_match', 'time_on_page');--> statement-breakpoint
CREATE TABLE "attribution_touchpoint" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" uuid,
	"channel" "attribution_channel" NOT NULL,
	"source" text,
	"medium" text,
	"campaign" text,
	"term" text,
	"content" text,
	"landing_page" text,
	"referrer" text,
	"click_id" text,
	"click_id_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_tracking_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"trigger_type" "custom_event_trigger_type" NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"event_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"platform_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "custom_tracking_event_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tracking_consent" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" uuid,
	"consent_given" boolean NOT NULL,
	"consent_categories" jsonb DEFAULT '{"analytics":false,"marketing":false,"functional":true}'::jsonb NOT NULL,
	"consent_method" "consent_method" NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attribution_touchpoint" ADD CONSTRAINT "attribution_touchpoint_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "tracking_consent" ADD CONSTRAINT "tracking_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;