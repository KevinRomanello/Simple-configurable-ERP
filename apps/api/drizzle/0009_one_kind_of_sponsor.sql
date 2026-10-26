-- A sponsor is always a virtual fund now: money that goes into the bank is an inflow of CASH FLOW
-- (which owes 11% VAT), and a fund always covers the VAT of its purchases at its own rate.
-- A sponsor that was paid into the bank becomes one inflow per contract, so nothing is lost.
INSERT INTO "team_inflow" ("season_id", "phase", "source_name", "amount", "inflow_date")
SELECT f."season_id", c."phase", f."name", c."amount", c."inflow_date"
FROM "fund_contract" c JOIN "fund" f ON f."id" = c."fund_id"
WHERE f."mode" = 'cash';--> statement-breakpoint
DELETE FROM "line_fund" WHERE "fund_id" IN (SELECT "id" FROM "fund" WHERE "mode" = 'cash');--> statement-breakpoint
DELETE FROM "fund_contract" WHERE "fund_id" IN (SELECT "id" FROM "fund" WHERE "mode" = 'cash');--> statement-breakpoint
DELETE FROM "fund" WHERE "mode" = 'cash';--> statement-breakpoint
ALTER TABLE "fund" DROP CONSTRAINT "fund_cash_gives_fund";--> statement-breakpoint
ALTER TABLE "fund" DROP CONSTRAINT "fund_team_is_plain";--> statement-breakpoint
ALTER TABLE "fund" DROP COLUMN "pays_vat";--> statement-breakpoint
ALTER TABLE "fund" DROP COLUMN "mode";--> statement-breakpoint
ALTER TABLE "fund" ADD CONSTRAINT "fund_team_is_plain" CHECK ("fund"."kind" <> 'team' or ("fund"."type" = 'fund' and "fund"."vat_rate" is null and "fund"."group_name" is null));--> statement-breakpoint
DROP TYPE "public"."fund_mode";