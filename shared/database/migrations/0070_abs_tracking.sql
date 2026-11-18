-- ABS courier tracking, Phase 1 (ABS_TRACKING_MODE, default off): read-only
-- mirror of ABS shipments, AWB → order links, the shadow decision audit trail
-- and poller bookkeeping.
--
-- Additive only: six NEW, empty abs_* tables with their own indexes. No
-- existing table, column, enum, row or index is changed. The two FKs to
-- "order"(id) live on the new tables (ON DELETE SET NULL); "order" itself is
-- not altered. Harmless when the feature stays `off` (nothing reads or writes
-- these tables). The app refuses to leave `off` at boot unless these tables
-- exist (backend/shipping-tracking/abs/readiness.ts).
--
-- Rollback (documentation only, never run automatically):
-- docs/ABS_TRACKING_ROLLBACK.sql
CREATE TABLE "abs_order_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"awb" text NOT NULL,
	"order_id" uuid,
	"link_role" text NOT NULL,
	"state" text NOT NULL,
	"method" text,
	"reason_code" text,
	"confidence" integer DEFAULT 0 NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abs_shipment" (
	"awb" text PRIMARY KEY NOT NULL,
	"reference" text,
	"cmp_service" text,
	"status_raw" text,
	"status" text NOT NULL,
	"last_event_code" text,
	"last_reason" text,
	"cash" numeric(10, 2),
	"collected_cash" numeric(10, 2),
	"abs_fees" numeric(10, 2),
	"total_fees" numeric(10, 2),
	"is_paid" boolean,
	"payment_date" timestamp with time zone,
	"delivery_date" timestamp with time zone,
	"abs_created_at" timestamp with time zone,
	"consignee_phone_norm" text,
	"consignee_phone_last4" text,
	"no_of_pieces" integer,
	"origin_awb" text,
	"raw" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abs_shipment_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"awb" text NOT NULL,
	"status" text NOT NULL,
	"status_raw" text,
	"occurred_at" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abs_sync_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"trigger" text NOT NULL,
	"outcome" text,
	"window_from" timestamp with time zone,
	"window_to" timestamp with time zone,
	"pages" integer DEFAULT 0 NOT NULL,
	"shipments_seen" integer DEFAULT 0 NOT NULL,
	"shipments_changed" integer DEFAULT 0 NOT NULL,
	"links_auto" integer DEFAULT 0 NOT NULL,
	"links_review" integer DEFAULT 0 NOT NULL,
	"decisions_new" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "abs_sync_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"watermark" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abs_sync_state_singleton" CHECK ("abs_sync_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "abs_tracking_decision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"awb" text NOT NULL,
	"order_id" uuid,
	"order_status_seen" text,
	"shipment_status" text NOT NULL,
	"decision" text NOT NULL,
	"reason_code" text,
	"details" jsonb,
	"mode" text NOT NULL,
	"applied" boolean DEFAULT false NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "abs_order_link" ADD CONSTRAINT "abs_order_link_awb_abs_shipment_awb_fk" FOREIGN KEY ("awb") REFERENCES "public"."abs_shipment"("awb") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "abs_order_link" ADD CONSTRAINT "abs_order_link_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abs_shipment_status_history" ADD CONSTRAINT "abs_shipment_status_history_awb_abs_shipment_awb_fk" FOREIGN KEY ("awb") REFERENCES "public"."abs_shipment"("awb") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "abs_tracking_decision" ADD CONSTRAINT "abs_tracking_decision_awb_abs_shipment_awb_fk" FOREIGN KEY ("awb") REFERENCES "public"."abs_shipment"("awb") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "abs_tracking_decision" ADD CONSTRAINT "abs_tracking_decision_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "abs_order_link_awb_idx" ON "abs_order_link" USING btree ("awb");--> statement-breakpoint
CREATE UNIQUE INDEX "abs_order_link_primary_order_idx" ON "abs_order_link" USING btree ("order_id") WHERE "abs_order_link"."link_role" = 'primary' and "abs_order_link"."state" in ('auto', 'confirmed');--> statement-breakpoint
CREATE INDEX "abs_order_link_state_idx" ON "abs_order_link" USING btree ("state");--> statement-breakpoint
CREATE INDEX "abs_order_link_order_idx" ON "abs_order_link" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "abs_shipment_status_idx" ON "abs_shipment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "abs_shipment_phone_idx" ON "abs_shipment" USING btree ("consignee_phone_norm");--> statement-breakpoint
CREATE UNIQUE INDEX "abs_shipment_status_history_dedupe_idx" ON "abs_shipment_status_history" USING btree ("awb","status",coalesce("occurred_at", '1970-01-01 00:00:00+00'::timestamptz));--> statement-breakpoint
CREATE INDEX "abs_sync_run_started_idx" ON "abs_sync_run" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "abs_tracking_decision_dedupe_idx" ON "abs_tracking_decision" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "abs_tracking_decision_created_idx" ON "abs_tracking_decision" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "abs_tracking_decision_awb_idx" ON "abs_tracking_decision" USING btree ("awb");