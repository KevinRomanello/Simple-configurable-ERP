DROP INDEX "inventory_item_name_uq";--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "model" text;--> statement-breakpoint
-- The items that were already there get a placeholder, 'TBD', to be changed by hand (docs/inventario.md, §4).
UPDATE "inventory_item" SET "brand" = 'TBD', "model" = 'TBD';--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_item_identity_uq" ON "inventory_item" USING btree (lower("name"),lower(coalesce("brand", '')),lower(coalesce("model", '')));
