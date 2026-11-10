CREATE TYPE "public"."cash_account" AS ENUM('cash', 'bank', 'paypal');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'treasurer';--> statement-breakpoint
CREATE TABLE "cash_category" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cash_category_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"sponsorship" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_entry" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cash_entry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_on" date NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_id" integer,
	"method_id" integer,
	"account" "cash_account" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"invoice_checked" boolean DEFAULT false NOT NULL,
	"sponsorship" boolean DEFAULT false NOT NULL,
	CONSTRAINT "cash_entry_amount" CHECK ("cash_entry"."amount" <> 0),
	CONSTRAINT "cash_entry_sponsorship" CHECK (not "cash_entry"."sponsorship" or "cash_entry"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "cash_method" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cash_method_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_opening" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cash_opening_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"year" integer NOT NULL,
	"account" "cash_account" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "cash_opening_year_account_uq" UNIQUE("year","account")
);
--> statement-breakpoint
ALTER TABLE "team_inflow" ADD COLUMN "sponsorship" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_entry" ADD CONSTRAINT "cash_entry_category_id_cash_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."cash_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entry" ADD CONSTRAINT "cash_entry_method_id_cash_method_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."cash_method"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_category_name_uq" ON "cash_category" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "cash_entry_on" ON "cash_entry" USING btree ("entry_on");--> statement-breakpoint
CREATE INDEX "cash_entry_category" ON "cash_entry" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "cash_entry_method" ON "cash_entry" USING btree ("method_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_method_name_uq" ON "cash_method" USING btree (lower("name"));--> statement-breakpoint
-- the Voci and the payment methods of the sheet of the treasury (the same as CASH_CATEGORIES and CASH_METHODS in modules/cash/defaults.ts)
INSERT INTO cash_category (name, position, sponsorship) VALUES ('1. QUOTE ASSOCIATIVE', 1, false), ('2.1 da soci e tesserati', 2, false), ('2.2 da altre associazioni', 3, false), ('2.3 da altri (ad es. Federazioni)', 4, false), ('3.1 da soci', 5, false), ('3.2 da non soci', 6, false), ('4.1 da comune, provincia, regione, stato', 7, false), ('4.2 da Comunità Europea e da altri organismi internazionali', 8, false), ('4.3 da 5 per mille', 9, false), ('4.4 da università', 10, false), ('5. ENTRATE DA ATTIVITA’ COMMERCIALI', 11, false), ('6.1 Da pubblicità e sponsorizzazioni', 12, true), ('6.2 per attività svolte nei confronti di non associati', 13, false), ('6.3 Entrate commerciali di altro tipo (rimborsi)', 14, false), ('7.1 Da rendite patrimoniali', 15, false), ('7.2 rendite finanziarie', 16, false), ('7.3 altro: CAMBI ATTIVI', 17, false), ('1.1 Attrezzature', 18, false), ('1.2 Cancelleria e materiali da ufficio', 19, false), ('1.3 Materiale sportivo (per le ASD)', 20, false), ('1.4 Altro', 21, false), ('2.1 Assicurazioni', 22, false), ('2.2 Servizi informatici', 23, false), ('2.3 Spese postali', 24, false), ('2.4 Consulenze/ servizi contabili', 25, false), ('2.5 Altri', 26, false), ('3.1 Luce', 27, false), ('3.2 Acqua', 28, false), ('3.3 Gas', 29, false), ('3.4 Altre', 30, false), ('4.1 Affitti', 31, false), ('4.2 Noleggi', 32, false), ('4.3 Altri', 33, false), ('5.1 Affiliazioni a federazioni', 34, false), ('5.2 Altri', 35, false), ('6.1 Costi per collaboratori (occasionali, forfettari e dipendenti)', 36, false), ('6.2 Rimborsi spese analitici', 37, false), ('6.3 Altri costi', 38, false), ('7.1 Commissioni e spese tenuta conto', 39, false), ('7.2 Altri', 40, false), ('8.1 IRES/IRAP', 41, false), ('8.2 Imposta di bollo', 42, false), ('8.3 Dazi doganali', 43, false), ('9.1 IVA a credito', 44, false), ('9.2 IVA a debito', 45, false), ('9.3 Liquidazione IVA', 46, false), ('9.4 Pec aruba', 47, false), ('9.5 saldo fattura', 48, false);--> statement-breakpoint
INSERT INTO cash_method (name, position) VALUES ('Completato bonifico', 1), ('Completato visa', 2), ('Cassa', 3), ('Paypal', 4), ('Automatico', 5);--> statement-breakpoint
-- the register, its opening balances and its lists are in the history, like everything that changes money
CREATE TRIGGER audit_cash_entry AFTER INSERT OR UPDATE OR DELETE ON cash_entry FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_cash_opening AFTER INSERT OR UPDATE OR DELETE ON cash_opening FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_cash_category AFTER INSERT OR UPDATE OR DELETE ON cash_category FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_cash_method AFTER INSERT OR UPDATE OR DELETE ON cash_method FOR EACH ROW EXECUTE FUNCTION audit_row();
