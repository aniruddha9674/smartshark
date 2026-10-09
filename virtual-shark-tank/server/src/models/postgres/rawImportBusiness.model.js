import {
  pgTable,
  uuid,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { importBatches } from "./importBatch.model.js";

export const rawImportBusinesses = pgTable(
  "raw_import_businesses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    sourceRowIndex: integer("source_row_index").notNull(),
    rawData: jsonb("raw_data").notNull(),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
  },
  (table) => ({
    batchIdx: index("raw_batch_idx").on(table.batchId),
    unprocessedIdx: index("raw_unprocessed_idx").on(table.processedAt),
  })
);