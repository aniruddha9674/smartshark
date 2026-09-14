import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";

export const profileEditHistory = pgTable(
  "profile_edit_history",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    businessId: uuid("business_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    editedById: uuid("edited_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    fieldName: varchar("field_name", { length: 100 }).notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    fieldType: varchar("field_type", { length: 30 }).default("string"),

    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (table) => ({
    businessRecentIdx: index("peh_business_recent_idx").on(
      table.businessId,
      table.changedAt
    ),
    fieldIdx: index("peh_field_idx").on(table.businessId, table.fieldName),
  })
);