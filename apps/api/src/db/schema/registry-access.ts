// What needs both the registry and the people who sign in: the ERP's roles taken from the registry.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
} from "drizzle-orm/pg-core";
import {  } from "./columns";
import { regField, regView } from "./registry";

/** Where the roles of the ERP come from when they are taken from the registry (docs/anagrafiche.md, §9). One row. */
export const roleSync = pgTable(
  "role_sync",
  {
    id: integer().primaryKey().default(1),
    enabled: boolean().notNull().default(false),
    activeViewId: integer().references(() => regView.id, { onDelete: "set null" }),
    adminViewId: integer().references(() => regView.id, { onDelete: "set null" }),
    pmViewId: integer().references(() => regView.id, { onDelete: "set null" }),
    pmAreasFieldId: integer().references(() => regField.id, { onDelete: "set null" }),
    treasuryViewId: integer().references(() => regView.id, { onDelete: "set null" }),
    sponsorsViewId: integer().references(() => regView.id, { onDelete: "set null" }),
  },
  (t) => [check("role_sync_one_row", sql`${t.id} = 1`)],
);
