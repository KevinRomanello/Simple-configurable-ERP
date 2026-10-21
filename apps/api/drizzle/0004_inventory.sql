CREATE TYPE "public"."item_origin" AS ENUM('bought', 'made');--> statement-breakpoint
CREATE TYPE "public"."movement_kind" AS ENUM('receipt', 'use', 'transfer', 'adjustment', 'disposal');--> statement-breakpoint
CREATE TABLE "component_part" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "component_part_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"component_id" integer NOT NULL,
	"part_id" integer NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"note" text,
	CONSTRAINT "component_part_uq" UNIQUE("component_id","part_id"),
	CONSTRAINT "component_part_quantity" CHECK ("component_part"."quantity" > 0),
	CONSTRAINT "component_part_not_itself" CHECK ("component_part"."component_id" <> "component_part"."part_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_item" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventory_item_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text,
	"name" text NOT NULL,
	"purpose" text,
	"category" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"origin" "item_origin" DEFAULT 'bought' NOT NULL,
	"safety_codes" text,
	"disposal" text,
	"storage_notes" text,
	"maintenance_notes" text,
	"image_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_image" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"full" "bytea" NOT NULL,
	"thumb" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movement" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_movement_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"kind" "movement_kind" NOT NULL,
	"occurred_on" date NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"location" text NOT NULL,
	"spot" text DEFAULT '' NOT NULL,
	"to_location" text,
	"to_spot" text,
	"unit_net" numeric(14, 4),
	"unit_gross" numeric(14, 4),
	"unit_team" numeric(14, 4),
	"project_id" integer,
	"budget_line_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movement_quantity" CHECK (("stock_movement"."kind" = 'adjustment' and "stock_movement"."quantity" <> 0) or ("stock_movement"."kind" <> 'adjustment' and "stock_movement"."quantity" > 0)),
	CONSTRAINT "stock_movement_prices" CHECK (("stock_movement"."kind" = 'receipt' and "stock_movement"."unit_net" is not null and "stock_movement"."unit_gross" is not null and "stock_movement"."unit_team" is not null)
        or ("stock_movement"."kind" <> 'receipt' and "stock_movement"."unit_net" is null and "stock_movement"."unit_gross" is null and "stock_movement"."unit_team" is null)),
	CONSTRAINT "stock_movement_transfer" CHECK (("stock_movement"."kind" = 'transfer') = ("stock_movement"."to_location" is not null))
);
--> statement-breakpoint
ALTER TABLE "component_part" ADD CONSTRAINT "component_part_component_id_inventory_item_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."inventory_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_part" ADD CONSTRAINT "component_part_part_id_inventory_item_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."inventory_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_image" ADD CONSTRAINT "item_image_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_budget_line_id_budget_line_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_line"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_item_name_uq" ON "inventory_item" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_item_code_uq" ON "inventory_item" USING btree (lower("code")) WHERE "inventory_item"."code" is not null;--> statement-breakpoint
CREATE INDEX "stock_movement_item" ON "stock_movement" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "stock_movement_line" ON "stock_movement" USING btree ("budget_line_id");