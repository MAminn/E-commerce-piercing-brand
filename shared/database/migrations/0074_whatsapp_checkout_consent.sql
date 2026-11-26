-- WhatsApp checkout consent evidence (required WhatsApp acknowledgment).
--
-- Additive only: one NEW wa_* table and its two indexes. No existing table,
-- column, enum, row, index or constraint is touched, and there is no foreign
-- key to "order" (order_id is a plain uuid, like every wa_* table), so no lock
-- is taken on any website table and the ERP export sees no change.
--
-- One row per order whose shopper ticked the WhatsApp acknowledgment,
-- written in the order's own transaction. Rows are never updated.
--
-- Idempotent: IF NOT EXISTS on every CREATE. Re-running the file is a no-op.
--
-- Effective mode: anything but `off` needs this table as well as 0073's
-- (backend/whatsapp-confirmation/readiness.ts), so without it the feature
-- stays off and checkout asks for nothing.
--
-- Rollback (documentation only, never run automatically):
--   DROP TABLE IF EXISTS wa_checkout_consent;
SET lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_checkout_consent" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"order_number" integer,
	"phone_raw" text NOT NULL,
	"phone_e164" text,
	"consent_text_version" text NOT NULL,
	"consent_locale" text NOT NULL,
	"consent_text" text NOT NULL,
	"required" boolean NOT NULL,
	"mode" text NOT NULL,
	"source" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_checkout_consent_order_idx" ON "wa_checkout_consent" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_checkout_consent_at_idx" ON "wa_checkout_consent" USING btree ("consented_at");
