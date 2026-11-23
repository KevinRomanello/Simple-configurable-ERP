CREATE TABLE "reg_comment" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reg_comment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"record_id" integer NOT NULL,
	"author_id" integer,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reg_comment" ADD CONSTRAINT "reg_comment_record_id_reg_record_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."reg_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_comment" ADD CONSTRAINT "reg_comment_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reg_comment_record" ON "reg_comment" USING btree ("record_id");--> statement-breakpoint
-- comments are in the history like the records they are about
CREATE TRIGGER audit_reg_comment AFTER INSERT OR UPDATE OR DELETE ON reg_comment FOR EACH ROW EXECUTE FUNCTION audit_row();
