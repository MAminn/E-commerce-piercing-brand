-- Change category type from enum to text for dynamic categories
ALTER TABLE "category" ALTER COLUMN "type" SET DATA TYPE text;
ALTER TABLE "category" ALTER COLUMN "type" SET DEFAULT 'general';