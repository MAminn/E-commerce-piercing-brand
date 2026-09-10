CREATE TYPE "public"."pixel_platform" AS ENUM('meta', 'google_ga4', 'tiktok', 'snapchat', 'pinterest', 'custom');--> statement-breakpoint
CREATE TABLE "pixel_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform" "pixel_platform" NOT NULL,
	"pixel_id" text NOT NULL,
	"access_token" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"enable_client_side" boolean DEFAULT true NOT NULL,
	"enable_server_side" boolean DEFAULT false NOT NULL,
	"consent_required" boolean DEFAULT false NOT NULL,
	"consent_category" text,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tracking_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" uuid,
	"event_name" text NOT NULL,
	"event_id" text NOT NULL,
	"event_data" jsonb NOT NULL,
	"page_url" text,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"user_agent" text,
	"ip_hash" text,
	"device_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_event_delivery" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tracking_event_id" uuid NOT NULL,
	"platform" "pixel_platform" NOT NULL,
	"sent" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone,
	"platform_event_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracking_event" ADD CONSTRAINT "tracking_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "tracking_event_delivery" ADD CONSTRAINT "tracking_event_delivery_tracking_event_id_tracking_event_id_fk" FOREIGN KEY ("tracking_event_id") REFERENCES "public"."tracking_event"("id") ON DELETE cascade ON UPDATE cascade;