import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  jsonb,
  timestamp,
  pgEnum,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { businesses } from "./businessProfile.model.js";

// ---- Enums ----
export const pitchStatusEnum = pgEnum("pitch_status", [
  "draft",
  "live",
  "closed",
  "funded",
  "withdrawn",
]);

export const pitchStageEnum = pgEnum("pitch_stage", [
  "idea",
  "mvp",
  "early_revenue",
  "growth",
  "scale",
]);

export const pitchRevenueRangeEnum = pgEnum("pitch_revenue_range", [
  "pre_revenue",
  "under_10L",
  "10L_1Cr",
  "1Cr_10Cr",
  "10Cr_plus",
]);

export const pitches = pgTable(
  "pitches",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    // ---- Identity ----
    title: varchar("title", { length: 255 }).notNull(),
    tagline: varchar("tagline", { length: 300 }),
    shortPitch: varchar("short_pitch", { length: 500 }),
    longSummary: text("long_summary"),

    // ---- The ask ----
    askAmount: numeric("ask_amount").notNull(),
    equityOffered: numeric("equity_offered").notNull(),
    valuation: numeric("valuation").notNull(),

    // ---- Traction snapshot (structured for filtering) ----
    stage: pitchStageEnum("stage"),
    revenueRange: pitchRevenueRangeEnum("revenue_range"),
    monthlyGrowthPct: numeric("monthly_growth_pct"),
    teamSize: integer("team_size"),
    foundedYear: integer("founded_year"),

    // ---- The story (flexible, display-only) ----
    // Expected keys: problem, solution, marketSize, tractionNarrative,
    // teamNarrative, competition, businessModel, useOfFunds, milestones
    content: jsonb("content"),

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
    // For future investor filtering: "live pitches in stage X with revenue Y"
    stageFilterIdx: index("pitch_stage_revenue_idx").on(
      table.status,
      table.stage,
      table.revenueRange
    ),
    checkEquity: check(
      "pitch_equity_range",
      sql`${table.equityOffered} > 0 AND ${table.equityOffered} <= 100`
    ),
    checkAsk: check(
      "pitch_ask_positive",
      sql`${table.askAmount} > 0`
    ),
    checkTeamSize: check(
      "pitch_team_size_positive",
      sql`${table.teamSize} IS NULL OR ${table.teamSize} > 0`
    ),
    checkFoundedYear: check(
      "pitch_founded_year_range",
      sql`${table.foundedYear} IS NULL OR (${table.foundedYear} >= 1900 AND ${table.foundedYear} <= 2100)`
    ),
  })
);