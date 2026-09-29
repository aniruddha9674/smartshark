import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";
import { pitches } from "./pitch.model.js";

export const feedImpressions = pgTable(
  "feed_impressions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    pitchId: uuid("pitch_id")
      .notNull()
      .references(() => pitches.id, { onDelete: "cascade" }),

    // Where the pitch was shown
    surface: varchar("surface", { length: 50 }).notNull(),

    // Position in the list (0-indexed) — critically important for training
    position: integer("position").notNull(),

    // What score the ranker gave it at serve time — lets you compare
    // ranker versions later
    score: numeric("score"),

    // Which ranker produced this. "rules-v1" now, "ml-v2" later
    modelVersion: varchar("model_version", { length: 50 }).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // "My impressions" — for debugging what a user saw
    userRecentIdx: index("impression_user_recent_idx").on(
      table.userId,
      table.createdAt
    ),
    // "Who saw this pitch?" — pitch popularity, analytics
    pitchRecentIdx: index("impression_pitch_recent_idx").on(
      table.pitchId,
      table.createdAt
    ),
    // Dedup guard — one impression per (user, pitch, surface) per hour
    // Prevents double-logging when the page re-renders
    dedupIdx: index("impression_dedup_idx").on(
      table.userId,
      table.pitchId,
      table.surface,
      table.createdAt
    ),
  })
);