CREATE TABLE "order_line" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_line_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"line_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	CONSTRAINT "order_line_lineId_unique" UNIQUE("line_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_order" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_order_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_name" CHECK (length(trim("purchase_order"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_order_id_purchase_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_line_order" ON "order_line" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_season_name_uq" ON "purchase_order" USING btree ("season_id",lower("name"));--> statement-breakpoint
-- An order is lines of the budget bought together: one whose last line goes (taken out, moved to another order, or deleted from the budget,
-- which takes its row of order_line along) goes too, in the same transaction. The database does it, so that every way a line leaves an
-- order is covered, the budget's own deletes too (the budget does not know about orders: they are of the bridge to the register).
CREATE FUNCTION drop_empty_order() RETURNS trigger AS $$
BEGIN
  DELETE FROM purchase_order WHERE id = OLD.order_id AND NOT EXISTS (SELECT 1 FROM order_line WHERE order_id = OLD.order_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER order_line_drop_empty_order AFTER DELETE OR UPDATE OF order_id ON order_line FOR EACH ROW EXECUTE FUNCTION drop_empty_order();--> statement-breakpoint
CREATE TRIGGER audit_purchase_order AFTER INSERT OR UPDATE OR DELETE ON purchase_order FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_order_line AFTER INSERT OR UPDATE OR DELETE ON order_line FOR EACH ROW EXECUTE FUNCTION audit_row();
