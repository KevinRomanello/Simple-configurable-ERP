CREATE TABLE "category_voce" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "category_voce_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category_id" integer NOT NULL,
	"voce_id" integer NOT NULL,
	CONSTRAINT "category_voce_categoryId_unique" UNIQUE("category_id")
);
--> statement-breakpoint
CREATE TABLE "inflow_receipt" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inflow_receipt_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"inflow_id" integer NOT NULL,
	"entry_id" integer NOT NULL,
	CONSTRAINT "inflow_receipt_inflowId_unique" UNIQUE("inflow_id"),
	CONSTRAINT "inflow_receipt_entryId_unique" UNIQUE("entry_id")
);
--> statement-breakpoint
-- the two links that were columns become rows of these tables: copied before the columns go, and before the history triggers exist,
-- so that the copy is not written in the History as if somebody had received the inflows or chosen the Voci
INSERT INTO "inflow_receipt" ("inflow_id", "entry_id") SELECT "id", "cash_entry_id" FROM "team_inflow" WHERE "cash_entry_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "category_voce" ("category_id", "voce_id") SELECT "id", "default_voce_id" FROM "category" WHERE "default_voce_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "team_inflow" DROP CONSTRAINT "team_inflow_cashEntryId_unique";--> statement-breakpoint
ALTER TABLE "category" DROP CONSTRAINT "category_default_voce_id_cash_category_id_fk";
--> statement-breakpoint
ALTER TABLE "team_inflow" DROP CONSTRAINT "team_inflow_cash_entry_id_cash_entry_id_fk";
--> statement-breakpoint
ALTER TABLE "category_voce" ADD CONSTRAINT "category_voce_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_voce" ADD CONSTRAINT "category_voce_voce_id_cash_category_id_fk" FOREIGN KEY ("voce_id") REFERENCES "public"."cash_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inflow_receipt" ADD CONSTRAINT "inflow_receipt_inflow_id_team_inflow_id_fk" FOREIGN KEY ("inflow_id") REFERENCES "public"."team_inflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inflow_receipt" ADD CONSTRAINT "inflow_receipt_entry_id_cash_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."cash_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_voce_voce" ON "category_voce" USING btree ("voce_id");--> statement-breakpoint
ALTER TABLE "category" DROP COLUMN "default_voce_id";--> statement-breakpoint
ALTER TABLE "team_inflow" DROP COLUMN "cash_entry_id";--> statement-breakpoint
CREATE TRIGGER audit_inflow_receipt AFTER INSERT OR UPDATE OR DELETE ON inflow_receipt FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_category_voce AFTER INSERT OR UPDATE OR DELETE ON category_voce FOR EACH ROW EXECUTE FUNCTION audit_row();
