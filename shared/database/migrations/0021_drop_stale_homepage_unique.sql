-- Drop the stale column-level unique constraint on merchant_id alone.
-- This was created in 0001 as an implicit column UNIQUE.
-- Migration 0017 tried to drop it but used the wrong name.
-- The correct composite unique index (merchant_id, template_id) already exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'homepage_content_merchant_id_key'
    AND conrelid = 'homepage_content'::regclass
  ) THEN
    ALTER TABLE homepage_content DROP CONSTRAINT homepage_content_merchant_id_key;
  END IF;
END $$;
