CREATE TABLE "cash_entry_line" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cash_entry_line_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_id" integer NOT NULL,
	"line_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "cash_entry_line_uq" UNIQUE("entry_id","line_id"),
	CONSTRAINT "cash_entry_line_amount" CHECK ("cash_entry_line"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "team_inflow" ADD COLUMN "cash_entry_id" integer;--> statement-breakpoint
ALTER TABLE "cash_entry_line" ADD CONSTRAINT "cash_entry_line_entry_id_cash_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."cash_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entry_line" ADD CONSTRAINT "cash_entry_line_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_entry_line_line" ON "cash_entry_line" USING btree ("line_id");--> statement-breakpoint
ALTER TABLE "team_inflow" ADD CONSTRAINT "team_inflow_cash_entry_id_cash_entry_id_fk" FOREIGN KEY ("cash_entry_id") REFERENCES "public"."cash_entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_inflow" ADD CONSTRAINT "team_inflow_cashEntryId_unique" UNIQUE("cash_entry_id");
--> statement-breakpoint
-- which payment pays which budget line is in the history too
CREATE TRIGGER audit_cash_entry_line AFTER INSERT OR UPDATE OR DELETE ON cash_entry_line FOR EACH ROW EXECUTE FUNCTION audit_row();
