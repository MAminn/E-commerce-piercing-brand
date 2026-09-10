CREATE TYPE "public"."auth_log_action" AS ENUM('login_success', 'login_failed', 'register_success', 'register_failed', 'email_verified', 'password_reset_requested', 'password_reset_success');--> statement-breakpoint
CREATE TYPE "public"."order_log_action" AS ENUM('created', 'status_changed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."webhook_log_status" AS ENUM('received', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "auth_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"action" "auth_log_action" NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid,
	"action" "order_log_action" NOT NULL,
	"old_status" text,
	"new_status" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"webhook_type" text NOT NULL,
	"provider" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_log_status" DEFAULT 'received' NOT NULL,
	"error_message" text,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_log" ADD CONSTRAINT "auth_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "order_log" ADD CONSTRAINT "order_log_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "order_log" ADD CONSTRAINT "order_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "webhook_log" ADD CONSTRAINT "webhook_log_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE cascade;