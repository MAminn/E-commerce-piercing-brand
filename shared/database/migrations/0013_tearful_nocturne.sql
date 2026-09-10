CREATE TYPE "public"."payment_method" AS ENUM('cod', 'stripe', 'paymob');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('not_required', 'pending', 'processing', 'paid', 'failed', 'refunded');--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "payment_method" "payment_method" DEFAULT 'cod' NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "payment_status" "payment_status" DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "payment_session_id" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "payment_transaction_id" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "payment_gateway_data" jsonb;