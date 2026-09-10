-- Add template_id column to layout_settings for per-template layout customisation
-- This allows each template variant (e.g. landing-minimal, landing-editorial) to
-- store its own navbar style, footer, and announcement bar settings independently.

-- 1. Add the column with a sensible default so existing rows stay valid
ALTER TABLE "layout_settings" ADD COLUMN IF NOT EXISTS "template_id" text NOT NULL DEFAULT 'default';

-- 2. Drop the old unique constraint on merchant_id alone.
--    The constraint name varies across environments, so we try both naming conventions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'layout_settings_merchant_id_unique') THEN
    ALTER TABLE "layout_settings" DROP CONSTRAINT "layout_settings_merchant_id_unique";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'layout_settings_merchant_id_key') THEN
    ALTER TABLE "layout_settings" DROP CONSTRAINT "layout_settings_merchant_id_key";
  END IF;
END $$;

-- 3. Create composite unique index on (merchant_id, template_id)
CREATE UNIQUE INDEX IF NOT EXISTS "layout_settings_merchant_template_idx"
  ON "layout_settings" ("merchant_id", "template_id");
