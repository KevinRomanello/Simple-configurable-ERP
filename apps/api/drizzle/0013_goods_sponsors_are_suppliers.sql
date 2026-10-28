-- A sponsor that gives goods is also a supplier (BOUGHT FROM) of the same name. New sponsors get theirs
-- when they are made; this gives one to the sponsors that were already there (a name that is
-- already a supplier, in any case, is left as it is).
INSERT INTO "supplier" ("name")
SELECT DISTINCT ON (lower("name")) "name" FROM "fund" WHERE "type" IN ('gift', 'gift_vat')
ON CONFLICT DO NOTHING;
