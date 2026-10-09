import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const importStatusEnum = pgEnum("import_status", [
  "pending",
  "importing",
  "importing_done",
  "harmonizing",
  "done",
  "failed",
]);

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceName: varchar("source_name", { length: 100 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  failedRows: integer("failed_rows").default(0),
  status: importStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
});