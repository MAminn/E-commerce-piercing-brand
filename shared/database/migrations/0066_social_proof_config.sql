-- Social proof (recent-order toast) settings, ported from the Mach template.
-- Additive only: one nullable jsonb column on the settings row. NULL means
-- "use the shipped defaults" (backend/social-proof/defaults.ts), which ship
-- the feature DISABLED, so nothing changes on the storefront until an admin
-- turns it on. No existing row or column is touched. Safe to re-run.
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "social_proof_config" jsonb;
