CREATE TABLE "store_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text DEFAULT 'default' NOT NULL,
	"shipping_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_settings_key_unique" UNIQUE("key")
);
