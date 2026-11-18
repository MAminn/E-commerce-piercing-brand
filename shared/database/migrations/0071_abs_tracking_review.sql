-- ABS courier tracking, Phase 2 (still shadow: no website order is changed).
--
-- Additive only, abs_* objects only: one NEW table (abs_audit_log) and
-- nullable columns + indexes + one CHECK on the existing abs_* tables. No
-- existing non-abs table, column, enum, row or index is touched, and nothing
-- here references "order" (abs_audit_log.order_id deliberately has no FK).
-- Idempotent: IF NOT EXISTS everywhere Postgres supports it; the one ADD
-- CONSTRAINT re-run raises 42710 (duplicate_object), which auto-migrate skips.
--
-- Locks (auto-migrate runs each statement on its own, autocommit):
--   CREATE TABLE / CREATE INDEX on abs_audit_log — new table, nothing else locked.
--   ALTER TABLE abs_* ADD COLUMN (nullable, no default) — ACCESS EXCLUSIVE on that
--     abs_* table for a catalog-only change (no rewrite), milliseconds.
--   CREATE INDEX on abs_sync_run / abs_tracking_decision — SHARE lock on that
--     abs_* table (blocks the poller's writes for the build; the tables are small).
--   ADD CONSTRAINT … CHECK — ACCESS EXCLUSIVE on abs_tracking_decision while the
--     existing rows are scanned (ack_note is NULL everywhere, so trivially valid).
-- "order" and every other website table: no lock taken by this file.
--
-- lock_timeout: if a poller transaction holds an abs_* table, a statement fails
-- after 5 s (auto-migrate logs it, does not mark the file applied, and retries
-- on the next boot) instead of queueing behind it. Session-level; reset at the end.
--
-- Rollback (documentation only, never run automatically):
-- docs/ABS_TRACKING_ROLLBACK.sql
SET lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "abs_audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"awb" text,
	"order_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "abs_order_link" ADD COLUMN IF NOT EXISTS "recompute_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "abs_sync_run" ADD COLUMN IF NOT EXISTS "backoff_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "abs_sync_state" ADD COLUMN IF NOT EXISTS "resume_window_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "abs_sync_state" ADD COLUMN IF NOT EXISTS "resume_window_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "abs_sync_state" ADD COLUMN IF NOT EXISTS "resume_page" integer;--> statement-breakpoint
ALTER TABLE "abs_sync_state" ADD COLUMN IF NOT EXISTS "resume_cursor" text;--> statement-breakpoint
ALTER TABLE "abs_tracking_decision" ADD COLUMN IF NOT EXISTS "order_status_at_decision" text;--> statement-breakpoint
ALTER TABLE "abs_tracking_decision" ADD COLUMN IF NOT EXISTS "order_total_at_decision" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "abs_tracking_decision" ADD COLUMN IF NOT EXISTS "abs_delivery_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "abs_tracking_decision" ADD COLUMN IF NOT EXISTS "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "abs_tracking_decision" ADD COLUMN IF NOT EXISTS "acknowledged_by" text;--> statement-breakpoint
ALTER TABLE "abs_tracking_decision" ADD COLUMN IF NOT EXISTS "ack_note" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abs_audit_log_at_idx" ON "abs_audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abs_audit_log_awb_idx" ON "abs_audit_log" USING btree ("awb");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abs_audit_log_order_idx" ON "abs_audit_log" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abs_sync_run_trigger_idx" ON "abs_sync_run" USING btree ("trigger","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abs_tracking_decision_awb_seen_idx" ON "abs_tracking_decision" USING btree ("awb","last_seen_at");--> statement-breakpoint
ALTER TABLE "abs_tracking_decision" ADD CONSTRAINT "abs_tracking_decision_ack_note_len" CHECK ("abs_tracking_decision"."ack_note" is null or char_length("abs_tracking_decision"."ack_note") <= 500);--> statement-breakpoint
RESET lock_timeout;
