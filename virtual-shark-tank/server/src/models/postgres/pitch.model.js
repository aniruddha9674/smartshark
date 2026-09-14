import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  jsonb,
  timestamp,
  pgEnum,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";

export const pitchStatusEnum = pgEnum("pitch_status", [
  "draft",
  "live",
  "closed",
  "funded",
  "withdrawn",
]);

export const pitches = pgTable(
  "pitches",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    businessId: uuid("business_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // ---- Core content ----
    title: varchar("title", { length: 255 }).notNull(),
    tagline: varchar("tagline", { length: 300 }),
    shortPitch: varchar("short_pitch", { length: 500 }),
    longSummary: text("long_summary"),

    // ---- The ask ----
    askAmount: numeric("ask_amount").notNull(),
    equityOffered: numeric("equity_offered").notNull(),
    valuation: numeric("valuation").notNull(),

    // ---- Media (URLs only) ----
    videoUrl: varchar("video_url", { length: 500 }),
    pitchDeckUrl: varchar("pitch_deck_url", { length: 500 }),
    coverImageUrl: varchar("cover_image_url", { length: 500 }),

    // ---- Flexible ----
    sectorSpecificFields: jsonb("sector_specific_fields"),

    // ---- State ----
    status: pitchStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at"),
    closedAt: timestamp("closed_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    businessIdx: index("pitch_business_idx").on(
      table.businessId,
      table.status
    ),
    liveFeedIdx: index("pitch_live_feed_idx").on(
      table.status,
      table.publishedAt
    ),
    checkEquity: check(
      "pitch_equity_range",
      sql`${table.equityOffered} > 0 AND ${table.equityOffered} <= 100`
    ),
    checkAsk: check(
      "pitch_ask_positive",
      sql`${table.askAmount} > 0`
    ),
  })
);