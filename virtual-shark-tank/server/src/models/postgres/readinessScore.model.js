import {
  pgTable,
  uuid,
  integer,
  numeric,
  varchar,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { businesses } from "./businessProfile.model.js";

export const readinessScores = pgTable(
  "readiness_scores",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
        businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    score: integer("score").notNull(),          // 0–100
    modelVersion: varchar("model_version", { length: 50 }).notNull(),

    shapBreakdown: jsonb("shap_breakdown").notNull(),
    suggestions: jsonb("suggestions"),          // improvement suggestions

    sector: varchar("sector", { length: 100 }), // denormalized for benchmark query
    stage: varchar("stage", { length: 50 }),    // denormalized

    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (table) => ({
    businessRecentIdx: index("rs_business_recent_idx").on(
      table.businessId,
      table.computedAt
    ),
    benchmarkIdx: index("rs_benchmark_idx").on(
      table.sector,
      table.computedAt
    ),
  })
);