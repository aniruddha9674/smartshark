import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { businesses } from "./businessProfile.model.js";

export const profileDrafts = pgTable(
  "profile_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    jobId: varchar("job_id", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    step: varchar("step", { length: 30 }).notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    drafts: jsonb("drafts"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessIdx: index("profile_drafts_business_idx").on(table.businessId),
    jobIdx: index("profile_drafts_job_idx").on(table.jobId),
  })
);