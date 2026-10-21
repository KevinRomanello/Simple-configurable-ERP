ALTER TABLE "fund" ADD COLUMN "pays_vat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- One box per fund (question Q5, answered on 21 October 2026): it is ticked if either of the two was.
UPDATE "fund" SET "pays_vat" = "pays_vat_estimate" OR "pays_vat_actual";--> statement-breakpoint
ALTER TABLE "fund" DROP COLUMN "pays_vat_estimate";--> statement-breakpoint
ALTER TABLE "fund" DROP COLUMN "pays_vat_actual";