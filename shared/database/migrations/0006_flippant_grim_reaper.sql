ALTER TABLE "user" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "verification_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "verification_expiry" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profile_picture" text;