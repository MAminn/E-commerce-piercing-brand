-- Customer-facing catalogue number ("014 · Clicker"). Additive only: one
-- nullable column and a unique index that exempts NULLs. No values are
-- generated — every existing product stays unnumbered until the owner enters
-- one. Every statement is safe to re-run (auto-migrate retries a file whose
-- statement failed on the next boot).
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "catalogue_no" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_catalogue_no_idx" ON "product" USING btree ("catalogue_no");
