CREATE INDEX "budget_line_project" ON "budget_line" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "component_part_part" ON "component_part" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "line_figures_supplier" ON "line_figures" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "line_fund_fund" ON "line_fund" USING btree ("fund_id");--> statement-breakpoint
CREATE INDEX "project_season" ON "project" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "project_area" ON "project" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "stock_movement_project" ON "stock_movement" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "team_inflow_season" ON "team_inflow" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "user_area_area" ON "user_area" USING btree ("area_id");