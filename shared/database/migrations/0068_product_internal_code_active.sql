-- Internal codes: unique among LIVE products only.
--
-- A soft-deleted product keeps its historical internal_code (orders and the
-- ERP feed still reference it) but no longer reserves it, so a live product
-- may reuse the code. Restoring a deleted product whose code a live product
-- now holds fails on the new index.
--
-- No row is updated. Safe on any existing data: the old index guaranteed
-- uniqueness across ALL rows, which implies uniqueness across live rows.
--
-- Deliberately written WITHOUT statement breakpoints. The boot migrator
-- (shared/database/auto-migrate.ts) then sends this file as one multi-
-- statement query, which Postgres runs as a single implicit transaction:
-- the new index exists before the old one is dropped, and a failure rolls
-- both back, so there is never a moment without a uniqueness guarantee.
-- The new index has a NEW name on purpose: the migrator swallows "already
-- exists" errors, so re-creating under the old name could silently leave the
-- all-rows index in place.
CREATE UNIQUE INDEX IF NOT EXISTS "product_internal_code_active_idx"
  ON "product" USING btree ("internal_code")
  WHERE "product"."deleted" = false and "product"."internal_code" is not null;
DROP INDEX IF EXISTS "product_internal_code_idx";
