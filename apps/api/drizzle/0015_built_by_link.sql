ALTER TABLE "stock_movement" ADD COLUMN "built_by" integer;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_built_by_stock_movement_id_fk" FOREIGN KEY ("built_by") REFERENCES "public"."stock_movement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movement_built_by" ON "stock_movement" USING btree ("built_by");--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_built_by" CHECK ("stock_movement"."built_by" is null or "stock_movement"."kind" = 'use');