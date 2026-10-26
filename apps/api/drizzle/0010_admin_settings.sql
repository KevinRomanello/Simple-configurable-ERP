CREATE TABLE "category" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "category_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_field" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "category_field_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category_id" integer,
	"field" text NOT NULL,
	CONSTRAINT "category_field_uq" UNIQUE NULLS NOT DISTINCT("category_id","field"),
	CONSTRAINT "category_field_known" CHECK ("category_field"."field" in ('purpose', 'safetyCodes', 'disposal', 'storageNotes', 'maintenanceNotes'))
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "location_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"site" text NOT NULL,
	"room" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "location_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"variance_threshold" numeric(5, 4) NOT NULL,
	"vat_base_when_total_sponsor" text NOT NULL,
	"inflow_vat_rate" numeric(5, 2) NOT NULL,
	"bank_compare_summary" text NOT NULL,
	"bank_compare_timeline" text NOT NULL,
	CONSTRAINT "setting_one_row" CHECK ("setting"."id" = 1),
	CONSTRAINT "setting_threshold" CHECK ("setting"."variance_threshold" >= 0 and "setting"."variance_threshold" <= 1),
	CONSTRAINT "setting_vat_base" CHECK ("setting"."vat_base_when_total_sponsor" in ('net', 'net-minus-sponsor')),
	CONSTRAINT "setting_inflow_vat" CHECK ("setting"."inflow_vat_rate" >= 0 and "setting"."inflow_vat_rate" <= 100),
	CONSTRAINT "setting_bank_compare" CHECK ("setting"."bank_compare_summary" in ('day', 'month') and "setting"."bank_compare_timeline" in ('day', 'month'))
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "unit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vat_rate" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vat_rate_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rate" numeric(5, 2) NOT NULL,
	CONSTRAINT "vat_rate_rate_unique" UNIQUE("rate"),
	CONSTRAINT "vat_rate_range" CHECK ("vat_rate"."rate" >= 0 and "vat_rate"."rate" <= 100)
);
--> statement-breakpoint
ALTER TABLE "category_field" ADD CONSTRAINT "category_field_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_name_uq" ON "category" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "location_site_room_uq" ON "location" USING btree (lower("site"),lower("room"));--> statement-breakpoint
CREATE UNIQUE INDEX "unit_name_uq" ON "unit" USING btree (lower("name"));--> statement-breakpoint
-- The values that were written in the code until now (docs/hardcoded-registry.md): from here on an
-- admin changes them on the Settings page. Written before the history triggers, so they are not "changes".
INSERT INTO "category" ("name", "position") VALUES ('Components', 1), ('Manufacturing', 2), ('Consumable', 3), ('Asset', 4), ('Logistic', 5), ('Administration', 6), ('Software', 7);--> statement-breakpoint
INSERT INTO "category_field" ("category_id", "field") VALUES ((SELECT "id" FROM "category" WHERE "name" = 'Components'), 'purpose'), ((SELECT "id" FROM "category" WHERE "name" = 'Components'), 'storageNotes'), ((SELECT "id" FROM "category" WHERE "name" = 'Manufacturing'), 'purpose'), ((SELECT "id" FROM "category" WHERE "name" = 'Manufacturing'), 'safetyCodes'), ((SELECT "id" FROM "category" WHERE "name" = 'Manufacturing'), 'disposal'), ((SELECT "id" FROM "category" WHERE "name" = 'Manufacturing'), 'storageNotes'), ((SELECT "id" FROM "category" WHERE "name" = 'Consumable'), 'purpose'), ((SELECT "id" FROM "category" WHERE "name" = 'Consumable'), 'safetyCodes'), ((SELECT "id" FROM "category" WHERE "name" = 'Consumable'), 'disposal'), ((SELECT "id" FROM "category" WHERE "name" = 'Consumable'), 'storageNotes'), ((SELECT "id" FROM "category" WHERE "name" = 'Asset'), 'purpose'), ((SELECT "id" FROM "category" WHERE "name" = 'Asset'), 'maintenanceNotes'), ((SELECT "id" FROM "category" WHERE "name" = 'Asset'), 'storageNotes'), ((SELECT "id" FROM "category" WHERE "name" = 'Logistic'), 'purpose'), ((SELECT "id" FROM "category" WHERE "name" = 'Logistic'), 'storageNotes'), ((SELECT "id" FROM "category" WHERE "name" = 'Administration'), 'purpose'), ((SELECT "id" FROM "category" WHERE "name" = 'Software'), 'purpose'), (NULL, 'purpose'), (NULL, 'storageNotes');--> statement-breakpoint
INSERT INTO "vat_rate" ("rate") VALUES (0), (11), (22);--> statement-breakpoint
INSERT INTO "unit" ("name") VALUES ('pcs'), ('set'), ('box'), ('m'), ('kg'), ('g'), ('l'), ('ml');--> statement-breakpoint
INSERT INTO "location" ("code", "site", "room", "position") VALUES ('s1-r1', 'Site 1', 'Room 1', 1), ('s1-r2', 'Site 1', 'Room 2', 2), ('s1-r3', 'Site 1', 'Room 3', 3), ('s1-r4', 'Site 1', 'Room 4', 4), ('s1-r5', 'Site 1', 'Room 5', 5), ('s2-r1', 'Site 2', 'Room 1', 6), ('s2-r2', 'Site 2', 'Room 2', 7), ('s2-r3', 'Site 2', 'Room 3', 8), ('s2-r4', 'Site 2', 'Room 4', 9), ('s2-r5', 'Site 2', 'Room 5', 10);--> statement-breakpoint
INSERT INTO "setting" ("id", "variance_threshold", "vat_base_when_total_sponsor", "inflow_vat_rate", "bank_compare_summary", "bank_compare_timeline") VALUES (1, 0.15, 'net', 11, 'day', 'month');--> statement-breakpoint
-- Every change made from the Settings page goes into the history, like the rest.
CREATE TRIGGER audit_category AFTER INSERT OR UPDATE OR DELETE ON category FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_category_field AFTER INSERT OR UPDATE OR DELETE ON category_field FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_vat_rate AFTER INSERT OR UPDATE OR DELETE ON vat_rate FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_unit AFTER INSERT OR UPDATE OR DELETE ON unit FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_location AFTER INSERT OR UPDATE OR DELETE ON location FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_setting AFTER INSERT OR UPDATE OR DELETE ON setting FOR EACH ROW EXECUTE FUNCTION audit_row();
