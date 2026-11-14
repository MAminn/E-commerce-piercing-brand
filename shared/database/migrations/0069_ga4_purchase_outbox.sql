-- GA4 server-owned Purchase (GA4_PURCHASE_OWNER): attribution context and
-- the durable delivery outbox.
--
-- Additive only: two NEW, empty tables; no existing table, row or index is
-- changed, so it is safe to apply before or with the code and harmless if the
-- feature stays in its default `browser` mode (nothing reads or writes them).
--
-- ga4_purchase_outbox_order_id_idx is what guarantees at most one Purchase
-- row per order; the app refuses to leave `browser` mode at boot unless this
-- index exists (backend/pixel-tracking/ga4-purchase/readiness.ts).
CREATE TABLE "ga4_purchase_context" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"ga_client_id" text,
	"ga_session_id" text,
	"ga_session_number" integer,
	"consent_analytics" boolean,
	"consent_marketing" boolean,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ga4_purchase_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"eligible_at" timestamp with time zone NOT NULL,
	"payload" jsonb,
	"held_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ambiguous_attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"claim_token" uuid,
	"last_status_code" integer,
	"last_error" text,
	"prepared_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ga4_purchase_context" ADD CONSTRAINT "ga4_purchase_context_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ga4_purchase_outbox" ADD CONSTRAINT "ga4_purchase_outbox_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "ga4_purchase_outbox_order_id_idx" ON "ga4_purchase_outbox" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ga4_purchase_outbox_due_idx" ON "ga4_purchase_outbox" USING btree ("status","next_attempt_at");