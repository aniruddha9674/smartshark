import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { importBatches } from "./importBatch.model.js";
import { rawImportBusinesses } from "./rawImportBusiness.model.js";

export const harmonizationErrors = pgTable(
  "harmonization_errors",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rawRowId: uuid("raw_row_id")
      .notNull()
      .references(() => rawImportBusinesses.id, { onDelete: "cascade" }),
    errorType: varchar("error_type", { length: 50 }).notNull(),
    fieldName: varchar("field_name", { length: 100 }),
    message: text("message").notNull(),
    rawData: jsonb("raw_data").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    batchIdx: index("harm_err_batch_idx").on(table.batchId),
    typeIdx: index("harm_err_type_idx").on(table.errorType),
  })
);