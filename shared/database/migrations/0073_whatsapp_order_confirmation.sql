-- WhatsApp order confirmation (WHATSAPP_CONFIRM_MODE).
--
-- Additive only, wa_* objects only: six NEW tables, their indexes and the
-- single wa_settings row. No existing table, column, enum, row, index or
-- constraint is touched. Nothing here references "order" with a foreign key
-- (order_id columns are plain uuids, like abs_live_application), so no lock
-- is taken on "order", order_log or any other website table, and the ERP
-- export (which reads order / order_item / order_bundle / order_log) sees no
-- change at all.
--
-- Idempotent: IF NOT EXISTS on every CREATE; the seed row is
-- ON CONFLICT DO NOTHING. Re-running the file is a no-op.
--
-- Effective mode: anything but `off` needs every object below
-- (backend/whatsapp-confirmation/readiness.ts). Without them the feature
-- stays off, with one boot line saying why.
--
-- Rollback (documentation only, never run automatically):
--   DROP TABLE IF EXISTS wa_opt_out, wa_settings, wa_review_item,
--     wa_inbound_event, wa_outbox, wa_order_confirmation;
SET lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_order_confirmation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"order_number" integer,
	"state" text NOT NULL,
	"mode" text NOT NULL,
	"phone_e164" text,
	"ineligible_reason" text,
	"token" text NOT NULL,
	"consent_at" timestamp with time zone,
	"consent_source" text,
	"consent_text_version" text,
	"wa_user_id" text,
	"outbound_wamid" text,
	"reminder_wamid" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"responded_at" timestamp with time zone,
	"response" text,
	"would_apply" text,
	"status_applied" boolean DEFAULT false NOT NULL,
	"status_skip_reason" text,
	"reminder_sent_at" timestamp with time zone,
	"follow_up_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_order_confirmation_order_idx" ON "wa_order_confirmation" USING btree ("order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_order_confirmation_token_idx" ON "wa_order_confirmation" USING btree ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_order_confirmation_state_idx" ON "wa_order_confirmation" USING btree ("state","sent_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_order_confirmation_outbound_idx" ON "wa_order_confirmation" USING btree ("outbound_wamid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_order_confirmation_reminder_idx" ON "wa_order_confirmation" USING btree ("reminder_wamid");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"claim_token" uuid,
	"last_error_code" text,
	"last_error" text,
	"wamid" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_outbox_dedupe_idx" ON "wa_outbox" USING btree ("dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_outbox_due_idx" ON "wa_outbox" USING btree ("status","next_attempt_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_inbound_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"kind" text NOT NULL,
	"wamid" text,
	"from_e164" text,
	"payload" jsonb NOT NULL,
	"order_id" uuid,
	"result" text,
	"processed_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_inbound_event_key_idx" ON "wa_inbound_event" USING btree ("event_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_inbound_event_order_idx" ON "wa_inbound_event" USING btree ("order_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_review_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"customer_text" text,
	"detail" text,
	"assigned_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"note" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_review_item_open_idx" ON "wa_review_item" USING btree ("order_id","type") WHERE "wa_review_item"."status" in ('open', 'in_progress');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_review_item_status_idx" ON "wa_review_item" USING btree ("status","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"daily_send_cap" integer DEFAULT 200 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "wa_settings" ("id", "paused", "daily_send_cap") VALUES (1, false, 200) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_opt_out" (
	"phone_e164" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
RESET lock_timeout;
