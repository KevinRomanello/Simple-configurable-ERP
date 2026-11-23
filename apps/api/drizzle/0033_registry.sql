CREATE TABLE "api_token" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_token_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" integer NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app_secret" (
	"name" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_field" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reg_field_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"table_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"unique_values" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_file" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reg_file_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"record_id" integer NOT NULL,
	"field_id" integer NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by" integer,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_link" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reg_link_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"field_id" integer NOT NULL,
	"record_id" integer NOT NULL,
	"target_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "reg_link_uq" UNIQUE("field_id","record_id","target_id")
);
--> statement-breakpoint
CREATE TABLE "reg_record" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reg_record_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"table_id" integer NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "reg_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"people_table_id" integer,
	"email_field_id" integer,
	CONSTRAINT "reg_settings_one_row" CHECK ("reg_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "reg_table" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reg_table_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT '' NOT NULL,
	"section" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"primary_field_id" integer,
	"access" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_view" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reg_view_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"table_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"position" integer NOT NULL,
	"slug" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "reg_view_type" CHECK ("reg_view"."type" in ('grid', 'form', 'gallery', 'kanban'))
);
--> statement-breakpoint
CREATE TABLE "reg_webhook" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reg_webhook_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"table_id" integer NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"events" text[] NOT NULL,
	"filter" jsonb,
	"secret" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_webhook_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reg_webhook_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"webhook_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"event" text NOT NULL,
	"record_id" integer,
	"status" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "role_sync" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"active_view_id" integer,
	"admin_view_id" integer,
	"pm_view_id" integer,
	"pm_areas_field_id" integer,
	"treasury_view_id" integer,
	"sponsors_view_id" integer,
	CONSTRAINT "role_sync_one_row" CHECK ("role_sync"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_field" ADD CONSTRAINT "reg_field_table_id_reg_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."reg_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_file" ADD CONSTRAINT "reg_file_record_id_reg_record_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."reg_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_file" ADD CONSTRAINT "reg_file_field_id_reg_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."reg_field"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_file" ADD CONSTRAINT "reg_file_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_link" ADD CONSTRAINT "reg_link_field_id_reg_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."reg_field"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_link" ADD CONSTRAINT "reg_link_record_id_reg_record_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."reg_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_link" ADD CONSTRAINT "reg_link_target_id_reg_record_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."reg_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_record" ADD CONSTRAINT "reg_record_table_id_reg_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."reg_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_record" ADD CONSTRAINT "reg_record_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_record" ADD CONSTRAINT "reg_record_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_settings" ADD CONSTRAINT "reg_settings_people_table_id_reg_table_id_fk" FOREIGN KEY ("people_table_id") REFERENCES "public"."reg_table"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_settings" ADD CONSTRAINT "reg_settings_email_field_id_reg_field_id_fk" FOREIGN KEY ("email_field_id") REFERENCES "public"."reg_field"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_view" ADD CONSTRAINT "reg_view_table_id_reg_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."reg_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_webhook" ADD CONSTRAINT "reg_webhook_table_id_reg_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."reg_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_webhook_log" ADD CONSTRAINT "reg_webhook_log_webhook_id_reg_webhook_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."reg_webhook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_sync" ADD CONSTRAINT "role_sync_active_view_id_reg_view_id_fk" FOREIGN KEY ("active_view_id") REFERENCES "public"."reg_view"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_sync" ADD CONSTRAINT "role_sync_admin_view_id_reg_view_id_fk" FOREIGN KEY ("admin_view_id") REFERENCES "public"."reg_view"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_sync" ADD CONSTRAINT "role_sync_pm_view_id_reg_view_id_fk" FOREIGN KEY ("pm_view_id") REFERENCES "public"."reg_view"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_sync" ADD CONSTRAINT "role_sync_pm_areas_field_id_reg_field_id_fk" FOREIGN KEY ("pm_areas_field_id") REFERENCES "public"."reg_field"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_sync" ADD CONSTRAINT "role_sync_treasury_view_id_reg_view_id_fk" FOREIGN KEY ("treasury_view_id") REFERENCES "public"."reg_view"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_sync" ADD CONSTRAINT "role_sync_sponsors_view_id_reg_view_id_fk" FOREIGN KEY ("sponsors_view_id") REFERENCES "public"."reg_view"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_token_hash_uq" ON "api_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_token_user" ON "api_token" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reg_field_name_uq" ON "reg_field" USING btree ("table_id",lower("name"));--> statement-breakpoint
CREATE INDEX "reg_file_record" ON "reg_file" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "reg_link_record" ON "reg_link" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "reg_link_target" ON "reg_link" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "reg_record_table" ON "reg_record" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reg_table_name_uq" ON "reg_table" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "reg_view_name_uq" ON "reg_view" USING btree ("table_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "reg_view_slug_uq" ON "reg_view" USING btree (lower("slug"));--> statement-breakpoint
CREATE INDEX "reg_webhook_table" ON "reg_webhook" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "reg_webhook_log_hook" ON "reg_webhook_log" USING btree ("webhook_id","at");--> statement-breakpoint
-- the registry and its settings are in the history, like the rest of the data; the files (binary), the
-- log of the webhooks and the secrets of the server are not
CREATE TRIGGER audit_reg_table AFTER INSERT OR UPDATE OR DELETE ON reg_table FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_reg_field AFTER INSERT OR UPDATE OR DELETE ON reg_field FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_reg_view AFTER INSERT OR UPDATE OR DELETE ON reg_view FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_reg_record AFTER INSERT OR UPDATE OR DELETE ON reg_record FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_reg_link AFTER INSERT OR UPDATE OR DELETE ON reg_link FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_reg_webhook AFTER INSERT OR UPDATE OR DELETE ON reg_webhook FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_reg_settings AFTER INSERT OR UPDATE OR DELETE ON reg_settings FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_role_sync AFTER INSERT OR UPDATE OR DELETE ON role_sync FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
CREATE TRIGGER audit_api_token AFTER INSERT OR UPDATE OR DELETE ON api_token FOR EACH ROW EXECUTE FUNCTION audit_row();--> statement-breakpoint
-- the two one-row tables start empty: nothing chosen, the link of the roles off
INSERT INTO reg_settings (id) VALUES (1);--> statement-breakpoint
INSERT INTO role_sync (id) VALUES (1);
