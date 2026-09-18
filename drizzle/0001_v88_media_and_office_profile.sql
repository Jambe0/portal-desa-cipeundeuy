ALTER TABLE "directory_entries" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "directory_entries" ADD COLUMN "image_mime" text;--> statement-breakpoint
ALTER TABLE "directory_entries" ADD COLUMN "image_bytes" integer;--> statement-breakpoint
ALTER TABLE "directory_entries" ADD COLUMN "image_width" integer;--> statement-breakpoint
ALTER TABLE "directory_entries" ADD COLUMN "image_height" integer;--> statement-breakpoint
ALTER TABLE "directory_entries" ADD COLUMN "icon_key" text;--> statement-breakpoint
ALTER TABLE "village_profile" ADD COLUMN "office_phone" text NOT NULL DEFAULT '+62 858-4685-8441';--> statement-breakpoint
ALTER TABLE "village_profile" ADD COLUMN "office_email" text NOT NULL DEFAULT 'desacipeundeuy113@gmail.com';--> statement-breakpoint
ALTER TABLE "village_profile" ADD COLUMN "service_hours_mon_thu" text NOT NULL DEFAULT '08.00 - 16.00 WIB';--> statement-breakpoint
ALTER TABLE "village_profile" ADD COLUMN "service_hours_friday" text NOT NULL DEFAULT '08.00 - 16.30 WIB';--> statement-breakpoint
CREATE UNIQUE INDEX "directory_image_key_idx" ON "directory_entries" USING btree ("image_key");
