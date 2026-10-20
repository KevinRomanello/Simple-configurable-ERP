-- History of changes (audit_log), written by the database itself.
--
-- One generic function records every insert, update and delete of the tables it is attached to,
-- with the row before and after, in the same transaction as the change: a change and its history
-- can never disagree, nothing can forget to log, and cascaded deletes are recorded too.
--
-- Who is changing is told by the API at the start of each write transaction:
--   select set_config('app.actor_id', '<user id>', true);
-- Without it (the seed, the importer, a manual SQL session) the actor is null.

CREATE FUNCTION audit_row() RETURNS trigger AS $$
DECLARE
  actor integer := nullif(current_setting('app.actor_id', true), '')::integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (actor_id, table_name, row_id, action, after)
    VALUES (actor, TG_TABLE_NAME, NEW.id, 'insert', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (actor_id, table_name, row_id, action, before, after)
    VALUES (actor, TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO audit_log (actor_id, table_name, row_id, action, before)
    VALUES (actor, TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_project AFTER INSERT OR UPDATE OR DELETE ON project FOR EACH ROW EXECUTE FUNCTION audit_row();
--> statement-breakpoint
CREATE TRIGGER audit_budget_line AFTER INSERT OR UPDATE OR DELETE ON budget_line FOR EACH ROW EXECUTE FUNCTION audit_row();
--> statement-breakpoint
CREATE TRIGGER audit_line_figures AFTER INSERT OR UPDATE OR DELETE ON line_figures FOR EACH ROW EXECUTE FUNCTION audit_row();
--> statement-breakpoint
CREATE TRIGGER audit_fund AFTER INSERT OR UPDATE OR DELETE ON fund FOR EACH ROW EXECUTE FUNCTION audit_row();
--> statement-breakpoint
CREATE TRIGGER audit_fund_contract AFTER INSERT OR UPDATE OR DELETE ON fund_contract FOR EACH ROW EXECUTE FUNCTION audit_row();
--> statement-breakpoint
CREATE TRIGGER audit_team_inflow AFTER INSERT OR UPDATE OR DELETE ON team_inflow FOR EACH ROW EXECUTE FUNCTION audit_row();
--> statement-breakpoint
CREATE TRIGGER audit_bank_snapshot AFTER INSERT OR UPDATE OR DELETE ON bank_snapshot FOR EACH ROW EXECUTE FUNCTION audit_row();
--> statement-breakpoint
CREATE TRIGGER audit_supplier AFTER INSERT OR UPDATE OR DELETE ON supplier FOR EACH ROW EXECUTE FUNCTION audit_row();
--> statement-breakpoint
CREATE TRIGGER audit_app_user AFTER INSERT OR UPDATE OR DELETE ON app_user FOR EACH ROW EXECUTE FUNCTION audit_row();
--> statement-breakpoint
CREATE TRIGGER audit_user_area AFTER INSERT OR UPDATE OR DELETE ON user_area FOR EACH ROW EXECUTE FUNCTION audit_row();
