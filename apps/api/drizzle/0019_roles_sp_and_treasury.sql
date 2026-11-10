-- Roles: `sp` (keeps the sponsors) replaces `treasurer`, and the treasury becomes a box of a project manager.
ALTER TABLE "app_user" ADD COLUMN "treasury" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "role" SET DEFAULT 'viewer'::text;--> statement-breakpoint
-- a treasurer (the role of the migration 0018, which never left development) is a project manager with the box
UPDATE "app_user" SET "role" = 'pm', "treasury" = true WHERE "role" = 'treasurer';--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'pm', 'viewer', 'sp');--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "role" SET DEFAULT 'viewer'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";
