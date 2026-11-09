-- Product upsells, ported from the Mach template (0056_product_upsells).
-- Additive: product upsell mode + store-wide upsell settings.
--
-- upsell_mode defaults to 'global' (the store's random recommendations), so
-- every existing product works without being edited. The manual list is the
-- existing best_layered_with_ids column ("Style It With") — no new relation
-- is introduced.
--
-- Products whose owner already curated "Style It With" pieces are switched to
-- 'manual', so that curated list keeps being what those products recommend
-- instead of being replaced by random picks. The UPDATE only writes the new
-- column, only on rows still at its default, and is a no-op for products with
-- an empty list. No existing column value is changed.
--
-- upsell_config is nullable; a NULL row means "use the shipped defaults"
-- (shared/upsell/config.ts), which ship upsells OFF — nothing changes on the
-- storefront until an admin enables them. Every statement is safe to re-run.
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "upsell_mode" text DEFAULT 'global' NOT NULL;--> statement-breakpoint
UPDATE "product" SET "upsell_mode" = 'manual' WHERE "upsell_mode" = 'global' AND jsonb_typeof("best_layered_with_ids") = 'array' AND jsonb_array_length("best_layered_with_ids") > 0;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "upsell_config" jsonb;
