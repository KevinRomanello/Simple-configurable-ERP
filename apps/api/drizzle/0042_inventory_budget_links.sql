CREATE TABLE "item_make_project" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_make_project_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	CONSTRAINT "item_make_project_itemId_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "movement_project" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "movement_project_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"movement_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	CONSTRAINT "movement_project_movementId_unique" UNIQUE("movement_id")
);
--> statement-breakpoint
CREATE TABLE "receipt_line" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "receipt_line_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"movement_id" integer NOT NULL,
	"line_id" integer NOT NULL,
	CONSTRAINT "receipt_line_movementId_unique" UNIQUE("movement_id")
);
--> statement-breakpoint
-- the three links that were columns of the inventory become rows of these tables: copied before the columns go, and before the history
-- triggers exist, so that the copy is not written in the History as if somebody had received, used or planned something again
INSERT INTO "receipt_line" ("movement_id", "line_id") SELECT "id", "budget_line_id" FROM "stock_movement" WHERE "budget_line_id" IS NOT NULL ORDER BY "id";--> statement-breakpoint
INSERT INTO "movement_project" ("movement_id", "project_id") SELECT "id", "project_id" FROM "stock_movement" WHERE "project_id" IS NOT NULL ORDER BY "id";--> statement-breakpoint
INSERT INTO "item_make_project" ("item_id", "project_id") SELECT "id", "make_project_id" FROM "inventory_item" WHERE "make_project_id" IS NOT NULL ORDER BY "id";--> statement-breakpoint
ALTER TABLE "inventory_item" DROP CONSTRAINT "inventory_item_make_project_id_project_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_project_id_project_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_budget_line_id_budget_line_id_fk";
--> statement-breakpoint
DROP INDEX "stock_movement_line";--> statement-breakpoint
DROP INDEX "stock_movement_project";--> statement-breakpoint
ALTER TABLE "item_make_project" ADD CONSTRAINT "item_make_project_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_make_project" ADD CONSTRAINT "item_make_project_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_project" ADD CONSTRAINT "movement_project_movement_id_stock_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."stock_movement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_project" ADD CONSTRAINT "movement_project_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_line" ADD CONSTRAINT "receipt_line_movement_id_stock_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."stock_movement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_line" ADD CONSTRAINT "receipt_line_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_make_project_project" ON "item_make_project" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "movement_project_project" ON "movement_project" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "receipt_line_line" ON "receipt_line" USING btree ("line_id");--> statement-breakpoint
ALTER TABLE "inventory_item" DROP COLUMN "make_project_id";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP COLUMN "budget_line_id";--> statement-breakpoint
CREATE TRIGGER audit_receipt_line AFTER INSERT OR UPDATE OR DELETE ON receipt_line FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_movement_project AFTER INSERT OR UPDATE OR DELETE ON movement_project FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_item_make_project AFTER INSERT OR UPDATE OR DELETE ON item_make_project FOR EACH ROW EXECUTE FUNCTION audit_row();
