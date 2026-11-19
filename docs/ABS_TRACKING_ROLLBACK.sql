-- ABS tracking — MANUAL rollback of migrations 0072_abs_live.sql,
-- 0071_abs_tracking_review.sql and 0070_abs_tracking.sql.
--
-- DOCUMENTATION ONLY. This file is not a migration, is not in
-- shared/database/migrations/ and is never run by the app.
--
-- Use only if the abs_* objects must be removed:
--   1. set ABS_TRACKING_MODE=off (or unset it) and restart — the app is then
--      fully inert and nothing reads or writes these tables;
--   2. take a backup (pg_dump -t 'abs_*' …) if the shadow data, the review
--      decisions or the audit log matter;
--   3. run PART 0 only (undo 0072 = live mode; keep Shadow), PART 0 + PART 1
--      (undo 0072 + 0071, keep the Phase 1 tables) or PART 0 + 1 + 2 (remove
--      everything);
--   4. DELETE FROM __drizzle_migrations WHERE hash IN ('0072_abs_live.sql'[, '0071_abs_tracking_review.sql'[, '0070_abs_tracking.sql']]);
--      — otherwise auto-migrate will NOT re-create the objects on the next boot
--      (only do this if you also want them back on the next deploy).
--
-- PART 0 deletes the live-mode trail (abs_live_application) — back it up
-- first: it is the record of every automatic Delivered. Orders that live mode
-- set Delivered STAY Delivered (their order_log rows remain); removing the
-- tables does not undo them — use the screen's Undo first if that is wanted.
--
-- No migration changed a non-abs table, column, index or enum, so there is
-- nothing else to restore. Every statement is IF EXISTS, so the file can be
-- re-run safely.

-- ── PART 0: undo 0072 (live mode: application trail, pause flag, applied_at) ──
DROP TABLE IF EXISTS "abs_live_application";
DROP TABLE IF EXISTS "abs_settings";
DO $$
BEGIN
  IF to_regclass('public.abs_tracking_decision') IS NOT NULL THEN
    ALTER TABLE "abs_tracking_decision" DROP COLUMN IF EXISTS "applied_at";
  END IF;
END $$;

-- ── PART 1: undo 0071 (review screen, audit log, snapshots, backoff/resume) ──
DROP TABLE IF EXISTS "abs_audit_log";
DROP INDEX IF EXISTS "abs_tracking_decision_awb_seen_idx";
DROP INDEX IF EXISTS "abs_sync_run_trigger_idx";
DO $$
BEGIN
  IF to_regclass('public.abs_tracking_decision') IS NOT NULL THEN
    ALTER TABLE "abs_tracking_decision" DROP CONSTRAINT IF EXISTS "abs_tracking_decision_ack_note_len";
    ALTER TABLE "abs_tracking_decision"
      DROP COLUMN IF EXISTS "order_status_at_decision",
      DROP COLUMN IF EXISTS "order_total_at_decision",
      DROP COLUMN IF EXISTS "abs_delivery_date",
      DROP COLUMN IF EXISTS "acknowledged_at",
      DROP COLUMN IF EXISTS "acknowledged_by",
      DROP COLUMN IF EXISTS "ack_note";
  END IF;
  IF to_regclass('public.abs_order_link') IS NOT NULL THEN
    ALTER TABLE "abs_order_link" DROP COLUMN IF EXISTS "recompute_requested_at";
  END IF;
  IF to_regclass('public.abs_sync_run') IS NOT NULL THEN
    ALTER TABLE "abs_sync_run" DROP COLUMN IF EXISTS "backoff_until";
  END IF;
  IF to_regclass('public.abs_sync_state') IS NOT NULL THEN
    ALTER TABLE "abs_sync_state"
      DROP COLUMN IF EXISTS "resume_window_from",
      DROP COLUMN IF EXISTS "resume_window_to",
      DROP COLUMN IF EXISTS "resume_page",
      DROP COLUMN IF EXISTS "resume_cursor";
  END IF;
END $$;

-- ── PART 2: undo 0070 (all Phase 1 tables) ──
-- Dependency order: the three tables referencing abs_shipment first.
DROP TABLE IF EXISTS "abs_tracking_decision";
DROP TABLE IF EXISTS "abs_order_link";
DROP TABLE IF EXISTS "abs_shipment_status_history";
DROP TABLE IF EXISTS "abs_shipment";
DROP TABLE IF EXISTS "abs_sync_run";
DROP TABLE IF EXISTS "abs_sync_state";
