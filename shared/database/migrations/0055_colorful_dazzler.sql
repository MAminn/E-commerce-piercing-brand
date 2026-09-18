CREATE TABLE "bundle_campaign_tier" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bundle_campaign_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_bundle" ADD COLUMN "tier_id" uuid;--> statement-breakpoint
ALTER TABLE "bundle_campaign_tier" ADD CONSTRAINT "bundle_campaign_tier_bundle_campaign_id_bundle_campaign_id_fk" FOREIGN KEY ("bundle_campaign_id") REFERENCES "public"."bundle_campaign"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "bundle_campaign_tier_quantity_idx" ON "bundle_campaign_tier" USING btree ("bundle_campaign_id","quantity");--> statement-breakpoint
CREATE INDEX "bundle_campaign_tier_campaign_idx" ON "bundle_campaign_tier" USING btree ("bundle_campaign_id");--> statement-breakpoint
-- Backfill (Phase 5): every existing Build Your Stack campaign becomes a
-- one-tier campaign holding exactly the quantity and price it already had, so
-- storefront and checkout behaviour is byte-for-byte unchanged and no merchant
-- has to reopen a campaign.
--
--   required_quantity = Q, fixed_bundle_price = P  ->  tier(quantity Q, price P)
--
-- Deliberately skipped:
--   * curated_stack campaigns — their composition is one quantity at one
--     price and stays on fixed_bundle_price; they never own tier rows.
--   * campaigns with no price yet (fixed_bundle_price IS NULL) or a
--     nonsensical quantity (< 1). Those are unfinished drafts that cannot be
--     activated anyway; inventing a tier for them would fabricate pricing.
--     They simply have no tiers until the merchant sets one.
-- ON CONFLICT keeps the statement idempotent against the unique
-- (bundle_campaign_id, quantity) index if it is ever replayed.
INSERT INTO "bundle_campaign_tier" ("id", "bundle_campaign_id", "quantity", "price", "sort_order")
SELECT gen_random_uuid(), "id", "required_quantity", "fixed_bundle_price", 0
FROM "bundle_campaign"
WHERE "type" = 'build_your_stack'
  AND "fixed_bundle_price" IS NOT NULL
  AND "required_quantity" >= 1
ON CONFLICT ("bundle_campaign_id", "quantity") DO NOTHING;
