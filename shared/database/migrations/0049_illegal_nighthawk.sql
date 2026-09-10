CREATE TABLE "custom_font_file" (
	"id" uuid PRIMARY KEY NOT NULL,
	"family_name" text NOT NULL,
	"weight" integer NOT NULL,
	"style" text DEFAULT 'normal' NOT NULL,
	"file_url" text NOT NULL,
	"format" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "typography_settings" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_font_file_family_weight_style_idx" ON "custom_font_file" USING btree ("family_name","weight","style");