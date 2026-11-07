import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { businesses } from "./businessProfile.model.js";

export const profileDrafts = pgTable("profile_drafts", {
  businessId: uuid("business_id")
    .primaryKey()
    .references(() => businesses.id, { onDelete: "cascade" }),
  drafts: jsonb("drafts").notNull(),
  extractionMethods: jsonb("extraction_methods").notNull().default({}),
  rawText: text("raw_text"),
  sourceUrl: varchar("source_url", { length: 500 }),
  fetchedAt: timestamp("fetched_at"),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});