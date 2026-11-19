-- ABS courier tracking, Phase 4 — Live mode (automatic Delivered only).
--
-- Additive only, abs_* objects only: two NEW tables (abs_live_application,
-- abs_settings), one nullable column on abs_tracking_decision, indexes on the
-- new table, and the single abs_settings row. No existing non-abs table,
-- column, enum, row, index or constraint is touched; nothing here references
-- "order" (abs_live_application.order_id deliberately has no FK, like
-- abs_audit_log), so no lock is taken on any website table. No column type
-- changes (auto-migrate drops FKs on SET DATA TYPE).
--
-- Idempotent: IF NOT EXISTS on every CREATE / ADD COLUMN; the seed row is
-- ON CONFLICT DO NOTHING. Re-running the file is a no-op.
--
-- Locks (auto-migrate runs each statement on its own, autocommit):
--   CREATE TABLE abs_live_application / abs_settings — new objects, no lock
--     on anything that exists.
--   ALTER TABLE abs_tracking_decision ADD COLUMN applied_at (nullable, no
--     default) — ACCESS EXCLUSIVE on abs_tracking_decision for a catalog-only
--     change (no rewrite), milliseconds. Only the ABS poller and the ABS screen
--     use that table; a running tick makes this statement wait at most 5 s.
--   CREATE INDEX on abs_live_application — SHARE on the new, empty table.
--   INSERT INTO abs_settings — the new table.
-- "order", order_log, product and every other website table: no lock.
--
-- lock_timeout 5 s: if a poller transaction holds abs_tracking_decision, the
-- ALTER fails fast (auto-migrate logs it, does not mark the file applied and
-- retries on the next boot) instead of queueing the poller behind it.
-- Session-level; reset at the end.
--
-- Effective mode: `live` needs every object below (readiness.ts). Without
-- them a `live` request runs `shadow`, with one boot line saying why.
--
-- Rollback (documentation only, never run automatically):
-- docs/ABS_TRACKING_ROLLBACK.sql (PART 0).
SET lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "abs_live_application" (
	"id" uuid PRIMARY KEY NOT NULL,
	"decision_id" uuid NOT NULL,
	"awb" text NOT NULL,
	"order_id" uuid,
	"from_status" text,
	"to_status" text NOT NULL,
	"outcome" text NOT NULL,
	"reason_code" text,
	"trigger" text NOT NULL,
	"actor" text NOT NULL,
	"order_log_id" uuid,
	"details" jsonb,
	"cairo_day" date NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by" text,
	"undo_order_log_id" uuid,
	CONSTRAINT "abs_live_application_to_status" CHECK ("abs_live_application"."to_status" = 'delivered'),
	CONSTRAINT "abs_live_application_outcome" CHECK ("abs_live_application"."outcome" in ('applied', 'skipped', 'failed')),
	CONSTRAINT "abs_live_application_reason" CHECK ("abs_live_application"."outcome" = 'applied' or "abs_live_application"."reason_code" is not null)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "abs_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"live_paused" boolean DEFAULT false NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_by" text,
	"pause_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "abs_settings_singleton" CHECK ("abs_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "abs_tracking_decision" ADD COLUMN IF NOT EXISTS "applied_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "abs_live_application_decision_applied_idx" ON "abs_live_application" USING btree ("decision_id") WHERE "abs_live_application"."outcome" = 'applied';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "abs_live_application_order_applied_idx" ON "abs_live_application" USING btree ("order_id","to_status") WHERE "abs_live_application"."outcome" = 'applied';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "abs_live_application_skip_dedupe_idx" ON "abs_live_application" USING btree ("awb","outcome","reason_code","cairo_day") WHERE "abs_live_application"."outcome" in ('skipped', 'failed');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abs_live_application_day_idx" ON "abs_live_application" USING btree ("cairo_day","outcome");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abs_live_application_awb_seen_idx" ON "abs_live_application" USING btree ("awb","last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abs_live_application_applied_at_idx" ON "abs_live_application" USING btree ("applied_at");--> statement-breakpoint
INSERT INTO "abs_settings" ("id", "live_paused") VALUES (1, false) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
RESET lock_timeout;
