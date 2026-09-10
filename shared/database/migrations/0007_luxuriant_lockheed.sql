CREATE TYPE "public"."assignment_scope" AS ENUM('global', 'page', 'section');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('active', 'inactive', 'draft');--> statement-breakpoint
CREATE TYPE "public"."template_type" AS ENUM('page', 'section', 'component');--> statement-breakpoint
CREATE TABLE "template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "template_type" NOT NULL,
	"category" text NOT NULL,
	"preview_image_id" uuid,
	"component_path" text NOT NULL,
	"config_schema" jsonb DEFAULT '{}'::jsonb,
	"default_config" jsonb DEFAULT '{}'::jsonb,
	"status" "template_status" DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "template_analytics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"assignment_id" uuid,
	"page_views" integer DEFAULT 0 NOT NULL,
	"interactions" integer DEFAULT 0 NOT NULL,
	"conversion_rate" numeric(5, 4),
	"performance_score" numeric(5, 2),
	"last_viewed" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "template_assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"scope" "assignment_scope" NOT NULL,
	"target_identifier" text,
	"target_category" text,
	"config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"assigned_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_preview_image_id_file_id_fk" FOREIGN KEY ("preview_image_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "template_analytics" ADD CONSTRAINT "template_analytics_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "template_analytics" ADD CONSTRAINT "template_analytics_assignment_id_template_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."template_assignment"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "template_assignment" ADD CONSTRAINT "template_assignment_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "template_assignment" ADD CONSTRAINT "template_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;