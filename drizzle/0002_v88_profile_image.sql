ALTER TABLE "village_profile" ADD COLUMN IF NOT EXISTS "profile_image_key" text;--> statement-breakpoint
ALTER TABLE "village_profile" ADD COLUMN IF NOT EXISTS "profile_image_mime" text;--> statement-breakpoint
ALTER TABLE "village_profile" ADD COLUMN IF NOT EXISTS "profile_image_bytes" integer;--> statement-breakpoint
ALTER TABLE "village_profile" ADD COLUMN IF NOT EXISTS "profile_image_width" integer;--> statement-breakpoint
ALTER TABLE "village_profile" ADD COLUMN IF NOT EXISTS "profile_image_height" integer;
