CREATE TABLE "app_module" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_module_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "app_module_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TRIGGER audit_app_module AFTER INSERT OR UPDATE OR DELETE ON app_module FOR EACH ROW EXECUTE FUNCTION audit_row();
