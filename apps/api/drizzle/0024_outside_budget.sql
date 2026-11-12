ALTER TABLE "area" ADD COLUMN "derived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_category" ADD COLUMN "scope" text DEFAULT 'project' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_category" ADD CONSTRAINT "cash_category_scope_known" CHECK ("cash_category"."scope" in ('project', 'outside', 'ignore'));--> statement-breakpoint
-- starting values for the Voci the register already has: everything is outside the budget (a stamp duty, a fee, an
-- insurance) except what is spent on a project and what the budget already counts (sponsorship, VAT)
UPDATE "cash_category" SET "scope" = 'outside';--> statement-breakpoint
UPDATE "cash_category" SET "scope" = 'project' WHERE lower("name") IN ('1.1 attrezzature', '1.4 altro');--> statement-breakpoint
UPDATE "cash_category" SET "scope" = 'ignore' WHERE lower("name") IN ('6.1 da pubblicità e sponsorizzazioni', '9.1 iva a credito', '9.2 iva a debito', '9.3 liquidazione iva');
