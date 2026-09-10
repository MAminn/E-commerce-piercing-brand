ALTER TABLE "homepage_content" DROP CONSTRAINT IF EXISTS "homepage_content_merchant_id_unique";--> statement-breakpoint
ALTER TABLE "homepage_content" ADD COLUMN IF NOT EXISTS "template_id" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "homepage_content_merchant_template_idx" ON "homepage_content" USING btree ("merchant_id","template_id");--> statement-breakpoint
DELETE FROM "tracking_event" a USING "tracking_event" b WHERE a.id > b.id AND a.event_id = b.event_id;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tracking_event_event_id_unique') THEN ALTER TABLE "tracking_event" ADD CONSTRAINT "tracking_event_event_id_unique" UNIQUE("event_id"); END IF; END $$;