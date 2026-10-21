-- The money of a sponsor in a phase becomes one value and one date, kept on the sponsor itself.
-- Contracts of the same sponsor and phase are merged first: the amounts are added, the earliest
-- date is kept (nothing is lost: the sheet had a zero, undated row next to a real one).
UPDATE "fund_contract" c SET "amount" = m."amount", "inflow_date" = m."inflow_date"
FROM (
  SELECT min("id") AS "keep", sum("amount") AS "amount", min("inflow_date") AS "inflow_date"
  FROM "fund_contract" GROUP BY "fund_id", "phase" HAVING count(*) > 1
) m
WHERE c."id" = m."keep";--> statement-breakpoint
DELETE FROM "fund_contract" c USING (
  SELECT min("id") AS "keep", "fund_id", "phase"
  FROM "fund_contract" GROUP BY "fund_id", "phase" HAVING count(*) > 1
) m
WHERE c."fund_id" = m."fund_id" AND c."phase" = m."phase" AND c."id" <> m."keep";--> statement-breakpoint
ALTER TABLE "fund_contract" ADD CONSTRAINT "fund_contract_fund_phase_uq" UNIQUE("fund_id","phase");
