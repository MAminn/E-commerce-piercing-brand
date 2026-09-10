CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "product_review" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "product_review" ADD COLUMN "status" "review_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_review" ADD CONSTRAINT "product_review_image_id_file_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
-- Reviews that already existed before moderation was introduced were already
-- publicly visible; mark them approved so they don't silently disappear.
-- Only reviews created after this migration will default to "pending".
UPDATE "product_review" SET "status" = 'approved';