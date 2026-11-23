ALTER TABLE "reg_comment" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reg_comment" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reg_comment" ADD COLUMN "resolved_by" integer;--> statement-breakpoint
ALTER TABLE "reg_webhook" ADD COLUMN "options" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reg_comment" ADD CONSTRAINT "reg_comment_resolved_by_app_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;