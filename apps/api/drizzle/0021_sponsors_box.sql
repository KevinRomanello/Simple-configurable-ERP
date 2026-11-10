-- Roles: `sp` (keeps the sponsors) becomes a box of a project manager, next to the treasury.
ALTER TABLE "app_user" ADD COLUMN "sponsors" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "role" SET DEFAULT 'viewer'::text;--> statement-breakpoint
-- a person with the role `sp` (the migration 0019, which never left development) is a project manager with the box
UPDATE "app_user" SET "role" = 'pm', "sponsors" = true WHERE "role" = 'sp';--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'pm', 'viewer');--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "role" SET DEFAULT 'viewer'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "app_user" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";
