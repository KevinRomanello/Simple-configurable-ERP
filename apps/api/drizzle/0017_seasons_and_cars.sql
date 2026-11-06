ALTER TABLE "budget_line" ADD COLUMN "car_season_id" integer;--> statement-breakpoint
-- every season has the car the team builds in it: the existing ones get a name to rename in Settings
ALTER TABLE "season" ADD COLUMN "car" text;--> statement-breakpoint
UPDATE "season" SET "car" = 'Car ' || "name";--> statement-breakpoint
ALTER TABLE "season" ALTER COLUMN "car" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "season" ADD COLUMN "read_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "car_season_id" integer;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_car_season_id_season_id_fk" FOREIGN KEY ("car_season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_car_season_id_season_id_fk" FOREIGN KEY ("car_season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_line_car" ON "budget_line" USING btree ("car_season_id");--> statement-breakpoint
CREATE INDEX "stock_movement_car" ON "stock_movement" USING btree ("car_season_id");--> statement-breakpoint
-- a new season, its car and its lock are changed from Settings: they go into the history like the rest
CREATE TRIGGER audit_season AFTER INSERT OR UPDATE OR DELETE ON season FOR EACH ROW EXECUTE FUNCTION audit_row();
