ALTER TABLE "category" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "category_parent_idx" ON "category" USING btree ("parent_id");--> statement-breakpoint
-- Make the existing category hierarchy explicit. Until now the dashboard
-- treated the OLDEST live row of each `type` as the main category and every
-- other row of that type as one of its subcategories (see the old
-- view-main-categories service). This applies exactly that rule once, so
-- every grouping an admin sees today is preserved. Data-only: no product,
-- product_category, order or promo/bundle row is touched. Idempotent — it only
-- fills rows whose parent_id is still NULL, and a type that already has a
-- single parentless live row matches nothing on a re-run.
UPDATE "category" AS c
SET "parent_id" = m."id"
FROM (
  SELECT DISTINCT ON ("type") "id", "type"
  FROM "category"
  WHERE "deleted" = false AND "parent_id" IS NULL
  ORDER BY "type", "created_at", "id"
) AS m
WHERE c."type" = m."type"
  AND c."id" <> m."id"
  AND c."parent_id" IS NULL;
