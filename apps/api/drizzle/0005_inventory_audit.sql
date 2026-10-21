-- The history (see 0002) also covers the inventory: items, every movement of goods, and the bills
-- of materials. The pictures are left out on purpose: they are binary and would fill the history;
-- a change of picture shows as a change of `image_updated_at` on the item.
CREATE TRIGGER audit_inventory_item AFTER INSERT OR UPDATE OR DELETE ON inventory_item FOR EACH ROW EXECUTE FUNCTION audit_row();
--> statement-breakpoint
CREATE TRIGGER audit_stock_movement AFTER INSERT OR UPDATE OR DELETE ON stock_movement FOR EACH ROW EXECUTE FUNCTION audit_row();
--> statement-breakpoint
CREATE TRIGGER audit_component_part AFTER INSERT OR UPDATE OR DELETE ON component_part FOR EACH ROW EXECUTE FUNCTION audit_row();
