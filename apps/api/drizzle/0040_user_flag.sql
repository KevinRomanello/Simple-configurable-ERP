CREATE TABLE "user_flag" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_flag_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"flag" text NOT NULL,
	CONSTRAINT "user_flag_user_flag_uq" UNIQUE("user_id","flag")
);
--> statement-breakpoint
ALTER TABLE "user_flag" ADD CONSTRAINT "user_flag_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- the two boxes become rows of user_flag: copied before the columns go, and before the history trigger exists, so that the copy is not
-- written in the History as if somebody had ticked the boxes
INSERT INTO "user_flag" ("user_id", "flag") SELECT "id", 'treasury' FROM "app_user" WHERE "treasury";--> statement-breakpoint
INSERT INTO "user_flag" ("user_id", "flag") SELECT "id", 'sponsors' FROM "app_user" WHERE "sponsors";--> statement-breakpoint
ALTER TABLE "app_user" DROP COLUMN "treasury";--> statement-breakpoint
ALTER TABLE "app_user" DROP COLUMN "sponsors";--> statement-breakpoint
CREATE TRIGGER audit_user_flag AFTER INSERT OR UPDATE OR DELETE ON user_flag FOR EACH ROW EXECUTE FUNCTION audit_row();
