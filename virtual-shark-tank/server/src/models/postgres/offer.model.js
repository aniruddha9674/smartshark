import {
  pgTable,
  uuid,
  numeric,
  text,
  jsonb,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";
import { businesses } from "./businessProfile.model.js";
import { pitches } from "./pitch.model.js";

export const offerStatusEnum = pgEnum("offer_status", [
  "pending",
  "accepted",
  "rejected",
  "countered",
  "withdrawn",
  "expired",
]);

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    pitchId: uuid("pitch_id")
      .notNull()
      .references(() => pitches.id, { onDelete: "cascade" }),

    investorId: uuid("investor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    // Who created THIS row — investor for first offer, either party for counters
    initiatedById: uuid("initiated_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Self-referencing — points to the offer being countered
    parentOfferId: uuid("parent_offer_id"),

    // ---- Terms ----
    amount: numeric("amount").notNull(),
    equityRequested: numeric("equity_requested").notNull(),
    valuation: numeric("valuation").notNull(),

    conditions: jsonb("conditions"),
    message: text("message"),

    // ---- State ----
    status: offerStatusEnum("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    respondedAt: timestamp("responded_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    // "All offers on this pitch, newest first"
    pitchStatusIdx: index("offer_pitch_status_idx").on(
      table.pitchId,
      table.status,
      table.createdAt
    ),
    // "All offers I made as investor"
    investorIdx: index("offer_investor_idx").on(
      table.investorId,
      table.createdAt
    ),
    // "All offers on my business"
    businessIdx: index("offer_business_idx").on(
      table.businessId,
      table.status
    ),
    // Counter thread traversal
    parentIdx: index("offer_parent_idx").on(table.parentOfferId),

    // ONE pending offer per investor per pitch — DB-level race protection.
    // This is what makes "two rapid clicks" impossible to double-submit.
    onePendingPerInvestorPerPitch: uniqueIndex("offer_one_pending_idx")
      .on(table.pitchId, table.investorId)
      .where(sql`${table.status} = 'pending'`),

    checkAmount: check("offer_amount_positive", sql`${table.amount} > 0`),
    checkEquity: check(
      "offer_equity_range",
      sql`${table.equityRequested} > 0 AND ${table.equityRequested} <= 100`
    ),
  })
);