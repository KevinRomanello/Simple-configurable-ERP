ALTER TABLE "inventory_item" ADD COLUMN "make_project_id" integer;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "make_from" text;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "make_to" text;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "make_to_spot" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_make_project_id_project_id_fk" FOREIGN KEY ("make_project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;