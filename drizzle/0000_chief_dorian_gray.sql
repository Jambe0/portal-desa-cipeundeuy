CREATE TYPE "public"."admin_role" AS ENUM('owner', 'editor');--> statement-breakpoint
CREATE TYPE "public"."directory_kind" AS ENUM('umkm', 'service');--> statement-breakpoint
CREATE TYPE "public"."directory_status" AS ENUM('pending', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."news_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "admin_login_rate_limits" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp (3) with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"last_seen_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"access_key_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'editor' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"access_key_changed_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_click_events" (
	"id" text PRIMARY KEY NOT NULL,
	"directory_entry_id" text NOT NULL,
	"day_bucket" date NOT NULL,
	"visitor_hash" text NOT NULL,
	"network_hash" text NOT NULL,
	"clicked_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "directory_kind" NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"meta" text NOT NULL,
	"phone" text NOT NULL,
	"public_location" text,
	"image_url" text,
	"status" "directory_status" DEFAULT 'pending' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'portal-form' NOT NULL,
	"reviewed_by" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"published_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "news_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tag" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"published_date" date NOT NULL,
	"expires_at" date,
	"status" "news_status" DEFAULT 'draft' NOT NULL,
	"author_email" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"published_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "village_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"head_name" text NOT NULL,
	"head_title" text NOT NULL,
	"greeting_lead" text NOT NULL,
	"welcome_paragraph" text NOT NULL,
	"closing_paragraph" text NOT NULL,
	"population_count" integer DEFAULT 8742 NOT NULL,
	"household_count" integer DEFAULT 2685 NOT NULL,
	"rw_count" integer DEFAULT 12 NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_click_events" ADD CONSTRAINT "directory_click_events_directory_entry_id_directory_entries_id_fk" FOREIGN KEY ("directory_entry_id") REFERENCES "public"."directory_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expiry_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_unique" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "admin_users_active_idx" ON "admin_users" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "directory_click_unique_day_idx" ON "directory_click_events" USING btree ("directory_entry_id","day_bucket","visitor_hash");--> statement-breakpoint
CREATE INDEX "directory_click_date_entry_idx" ON "directory_click_events" USING btree ("day_bucket","directory_entry_id");--> statement-breakpoint
CREATE INDEX "directory_click_network_date_idx" ON "directory_click_events" USING btree ("network_hash","day_bucket");--> statement-breakpoint
CREATE INDEX "directory_status_kind_idx" ON "directory_entries" USING btree ("status","kind");--> statement-breakpoint
CREATE INDEX "directory_public_page_idx" ON "directory_entries" USING btree ("status","kind","published_at","id");--> statement-breakpoint
CREATE INDEX "directory_category_page_idx" ON "directory_entries" USING btree ("status","kind","category","published_at","id");--> statement-breakpoint
CREATE INDEX "directory_moderation_page_idx" ON "directory_entries" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "directory_updated_at_idx" ON "directory_entries" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "directory_phone_idx" ON "directory_entries" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "news_status_date_idx" ON "news_entries" USING btree ("status","published_date");--> statement-breakpoint
CREATE INDEX "news_expires_at_idx" ON "news_entries" USING btree ("expires_at");