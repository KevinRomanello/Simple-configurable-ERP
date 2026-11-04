CREATE TYPE "public"."param_kind" AS ENUM('number', 'list', 'text', 'yesno');--> statement-breakpoint
CREATE TABLE "item_param_value" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_param_value_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"param_id" integer NOT NULL,
	"number" numeric,
	"text" text,
	"flag" boolean,
	CONSTRAINT "item_param_value_uq" UNIQUE("item_id","param_id"),
	CONSTRAINT "item_param_value_one" CHECK (num_nonnulls("item_param_value"."number", "item_param_value"."text", "item_param_value"."flag") = 1)
);
--> statement-breakpoint
CREATE TABLE "item_type" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_type_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"area_id" integer,
	"hazards" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_type_param" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_type_param_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" "param_kind" NOT NULL,
	"unit" text,
	"prefixes" boolean DEFAULT false NOT NULL,
	"choices" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "item_type_param_number" CHECK ("item_type_param"."kind" = 'number' or ("item_type_param"."unit" is null and not "item_type_param"."prefixes")),
	CONSTRAINT "item_type_param_list" CHECK ("item_type_param"."kind" = 'list' or cardinality("item_type_param"."choices") = 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "area_id" integer;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "type_id" integer;--> statement-breakpoint
ALTER TABLE "item_param_value" ADD CONSTRAINT "item_param_value_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_param_value" ADD CONSTRAINT "item_param_value_param_id_item_type_param_id_fk" FOREIGN KEY ("param_id") REFERENCES "public"."item_type_param"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_type" ADD CONSTRAINT "item_type_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_type_param" ADD CONSTRAINT "item_type_param_type_id_item_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."item_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_param_value_param" ON "item_param_value" USING btree ("param_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_type_name_uq" ON "item_type" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "item_type_area" ON "item_type" USING btree ("area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_type_param_name_uq" ON "item_type_param" USING btree ("type_id",lower("name"));--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_type_id_item_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."item_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_item_area" ON "inventory_item" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "inventory_item_type" ON "inventory_item" USING btree ("type_id");--> statement-breakpoint
-- types, their parameters and what is written in them for each item are in the history, like the items
CREATE TRIGGER audit_item_type AFTER INSERT OR UPDATE OR DELETE ON item_type FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_item_type_param AFTER INSERT OR UPDATE OR DELETE ON item_type_param FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_item_param_value AFTER INSERT OR UPDATE OR DELETE ON item_param_value FOR EACH ROW EXECUTE FUNCTION audit_row();
