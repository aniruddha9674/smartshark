import {
  pgTable,
  uuid,
  integer,
  varchar,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  check,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";
import { businesses } from "./businessProfile.model.js";

export const matchStatusEnum = pgEnum("match_status", [
  "pending",
  "viewed",
  "shortlisted",
  "passed",
  "connected",
]);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
       businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    matchScore: integer("match_score").notNull(),
    matchReasons: jsonb("match_reasons").notNull(),
    modelVersion: varchar("model_version", { length: 50 })
      .default("rules-v1")
      .notNull(),

    status: matchStatusEnum("status").default("pending").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    uniquePair: uniqueIndex("unique_match_pair_idx").on(
      table.businessId,
      table.investorId
    ),
    investorScoreIdx: index("match_investor_score_idx").on(
      table.investorId,
      table.matchScore
    ),
    businessScoreIdx: index("match_business_score_idx").on(
      table.businessId,
      table.matchScore
    ),
    noSelfMatch: check(
      "no_self_match",
      sql`${table.businessId} <> ${table.investorId}`
    ),
    
  })
);
