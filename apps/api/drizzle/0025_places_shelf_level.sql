ALTER TABLE "location" ADD COLUMN "shelf" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "level" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- there is no site any more (a place is a room, a shelf and a level): the old site goes in front of the room name, so
-- nothing is lost; the codes stay, so the movements and the stock stay where they are, and the names are changed in Settings
UPDATE "location" SET "room" = "site" || ' - ' || "room";--> statement-breakpoint
DROP INDEX "location_site_room_uq";--> statement-breakpoint
ALTER TABLE "location" DROP COLUMN "site";--> statement-breakpoint
CREATE UNIQUE INDEX "location_room_shelf_level_uq" ON "location" USING btree (lower("room"),lower("shelf"),lower("level"));
