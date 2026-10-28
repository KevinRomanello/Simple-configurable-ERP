-- Goods given against an advertising counter-invoice always owe the same VAT, 11%: the rate is no
-- longer chosen. Brings any sponsor of that type that had another rate to 11.
UPDATE "fund" SET "vat_rate" = '11.00' WHERE "type" = 'gift_vat' AND "vat_rate" <> 11;
