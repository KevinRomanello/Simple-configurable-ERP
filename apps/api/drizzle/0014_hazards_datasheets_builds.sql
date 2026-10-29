ALTER TYPE "public"."movement_kind" ADD VALUE 'build';--> statement-breakpoint
CREATE TABLE "item_datasheet" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_datasheet_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" integer,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_datasheet_file" (
	"datasheet_id" integer PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_prices";--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "flammable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "toxic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "carcinogenic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "item_datasheet" ADD CONSTRAINT "item_datasheet_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_datasheet" ADD CONSTRAINT "item_datasheet_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_datasheet_file" ADD CONSTRAINT "item_datasheet_file_datasheet_id_item_datasheet_id_fk" FOREIGN KEY ("datasheet_id") REFERENCES "public"."item_datasheet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_datasheet_item" ON "item_datasheet" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_prices" CHECK (("stock_movement"."kind"::text in ('receipt', 'build') and "stock_movement"."unit_net" is not null and "stock_movement"."unit_gross" is not null and "stock_movement"."unit_team" is not null)
        or ("stock_movement"."kind"::text not in ('receipt', 'build') and "stock_movement"."unit_net" is null and "stock_movement"."unit_gross" is null and "stock_movement"."unit_team" is null));--> statement-breakpoint
-- who added or removed a data sheet is in the history (the bytes, in item_datasheet_file, are not)
CREATE TRIGGER audit_item_datasheet AFTER INSERT OR UPDATE OR DELETE ON item_datasheet FOR EACH ROW EXECUTE FUNCTION audit_row();
