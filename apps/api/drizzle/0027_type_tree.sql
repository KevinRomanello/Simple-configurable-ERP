DROP INDEX "item_type_name_uq";--> statement-breakpoint
ALTER TABLE "item_type" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "item_type" ADD CONSTRAINT "item_type_parent_id_item_type_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."item_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_type_parent" ON "item_type" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_type_name_uq" ON "item_type" USING btree (coalesce("parent_id", 0),lower("name"));