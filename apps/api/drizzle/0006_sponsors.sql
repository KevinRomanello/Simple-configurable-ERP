CREATE TYPE "public"."fund_mode" AS ENUM('virtual', 'cash');--> statement-breakpoint
CREATE TYPE "public"."fund_type" AS ENUM('fund', 'gift', 'gift_vat');--> statement-breakpoint
CREATE TABLE "line_fund" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "line_fund_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"figures_id" integer NOT NULL,
	"position" integer NOT NULL,
	"fund_id" integer NOT NULL,
	CONSTRAINT "line_fund_position_uq" UNIQUE("figures_id","position"),
	CONSTRAINT "line_fund_fund_uq" UNIQUE("figures_id","fund_id")
);
--> statement-breakpoint
ALTER TABLE "fund" ADD COLUMN "mode" "fund_mode" DEFAULT 'virtual' NOT NULL;--> statement-breakpoint
ALTER TABLE "fund" ADD COLUMN "type" "fund_type" DEFAULT 'fund' NOT NULL;--> statement-breakpoint
ALTER TABLE "fund" ADD COLUMN "vat_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "fund" ADD COLUMN "group_name" text;--> statement-breakpoint
ALTER TABLE "line_fund" ADD CONSTRAINT "line_fund_figures_id_line_figures_id_fk" FOREIGN KEY ("figures_id") REFERENCES "public"."line_figures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_fund" ADD CONSTRAINT "line_fund_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The one fund of each line becomes the first (and only) row of its list of funds.
INSERT INTO "line_fund" ("figures_id", "position", "fund_id") SELECT "id", 1, "fund_id" FROM "line_figures" WHERE "fund_id" IS NOT NULL;--> statement-breakpoint
-- A sponsor now brings its own VAT rate: the one its lines already use (the most common), else 22.
UPDATE "fund" SET "vat_rate" = coalesce(
  (SELECT mode() WITHIN GROUP (ORDER BY lf."vat_rate") FROM "line_figures" lf WHERE lf."fund_id" = "fund"."id" AND lf."vat_rate" IS NOT NULL),
  22
) WHERE "kind" = 'external';--> statement-breakpoint
ALTER TABLE "line_figures" DROP CONSTRAINT "line_figures_fund_id_fund_id_fk";--> statement-breakpoint
ALTER TABLE "line_figures" DROP COLUMN "fund_id";--> statement-breakpoint
ALTER TABLE "fund" ADD CONSTRAINT "fund_team_is_plain" CHECK ("fund"."kind" <> 'team' or ("fund"."mode" = 'virtual' and "fund"."type" = 'fund' and "fund"."vat_rate" is null and "fund"."group_name" is null));--> statement-breakpoint
ALTER TABLE "fund" ADD CONSTRAINT "fund_cash_gives_fund" CHECK ("fund"."mode" = 'virtual' or "fund"."type" = 'fund');--> statement-breakpoint
ALTER TABLE "fund" ADD CONSTRAINT "fund_sponsor_has_rate" CHECK ("fund"."kind" = 'team' or "fund"."vat_rate" is not null);--> statement-breakpoint
-- The history (see 0002) also covers the funds of a line.
CREATE TRIGGER audit_line_fund AFTER INSERT OR UPDATE OR DELETE ON line_fund FOR EACH ROW EXECUTE FUNCTION audit_row();
