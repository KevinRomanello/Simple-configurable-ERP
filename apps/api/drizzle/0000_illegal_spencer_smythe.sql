CREATE TYPE "public"."fund_kind" AS ENUM('team', 'external');--> statement-breakpoint
CREATE TYPE "public"."phase" AS ENUM('estimate', 'actual');--> statement-breakpoint
CREATE TYPE "public"."sponsor_type" AS ENUM('none', 'partial', 'total');--> statement-breakpoint
CREATE TABLE "area" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "area_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "area_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "bank_snapshot" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bank_snapshot_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"as_of_date" date,
	CONSTRAINT "bank_snapshot_seasonId_unique" UNIQUE("season_id")
);
--> statement-breakpoint
CREATE TABLE "budget_line" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "budget_line_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"position" integer NOT NULL,
	"item" text NOT NULL,
	"category" text,
	"priority" text,
	"note" text,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fund_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" "fund_kind" NOT NULL,
	"pays_vat_estimate" boolean DEFAULT false NOT NULL,
	"pays_vat_actual" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_contract" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fund_contract_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"fund_id" integer NOT NULL,
	"phase" "phase" NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"inflow_date" date,
	CONSTRAINT "fund_contract_non_negative" CHECK ("fund_contract"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "line_figures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "line_figures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"line_id" integer NOT NULL,
	"phase" "phase" NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"unit_net_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"sponsor_type" "sponsor_type",
	"sponsor_value" numeric(14, 2),
	"vat_rate" numeric(5, 2),
	"fund_id" integer,
	"supplier_id" integer,
	"purchase_date" date,
	"arrival_date" date,
	CONSTRAINT "line_figures_line_phase_uq" UNIQUE("line_id","phase"),
	CONSTRAINT "line_figures_non_negative" CHECK ("line_figures"."quantity" >= 0 and "line_figures"."unit_net_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"name" text NOT NULL,
	"owner_name" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "season_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	CONSTRAINT "season_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "supplier_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_inflow" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "team_inflow_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season_id" integer NOT NULL,
	"phase" "phase" NOT NULL,
	"source_name" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"inflow_date" date,
	CONSTRAINT "team_inflow_non_negative" CHECK ("team_inflow"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bank_snapshot" ADD CONSTRAINT "bank_snapshot_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund" ADD CONSTRAINT "fund_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_contract" ADD CONSTRAINT "fund_contract_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_figures" ADD CONSTRAINT "line_figures_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_figures" ADD CONSTRAINT "line_figures_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_figures" ADD CONSTRAINT "line_figures_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_inflow" ADD CONSTRAINT "team_inflow_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fund_season_name_uq" ON "fund" USING btree ("season_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "fund_one_team_per_season" ON "fund" USING btree ("season_id") WHERE "fund"."kind" = 'team';--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_name_uq" ON "supplier" USING btree (lower("name"));