-- ABS tracking Phase 1 — MANUAL rollback of migration 0070_abs_tracking.sql.
--
-- DOCUMENTATION ONLY. This file is not a migration, is not in
-- shared/database/migrations/ and is never run by the app.
--
-- Use only if the abs_* tables must be removed entirely:
--   1. set ABS_TRACKING_MODE=off (or unset it) and restart — the app is then
--      fully inert and nothing reads or writes these tables;
--   2. take a backup (pg_dump -t 'abs_*' …) if the shadow data matters;
--   3. run the statements below;
--   4. DELETE FROM __drizzle_migrations WHERE hash = '0070_abs_tracking.sql';
--      — otherwise auto-migrate will NOT re-create the tables on the next boot
--      (only do this if you also want them back on the next deploy).
--
-- Migration 0070 created tables and indexes only: no enum types, no change
-- to any existing table, so nothing else needs to be restored. Dependency
-- order: the three tables referencing abs_shipment first.
DROP TABLE IF EXISTS "abs_tracking_decision";
DROP TABLE IF EXISTS "abs_order_link";
DROP TABLE IF EXISTS "abs_shipment_status_history";
DROP TABLE IF EXISTS "abs_shipment";
DROP TABLE IF EXISTS "abs_sync_run";
DROP TABLE IF EXISTS "abs_sync_state";
