import {
  pgTable,
  uuid,
  numeric,
  text,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";
import { businesses } from "./businessProfile.model.js";
import { pitches } from "./pitch.model.js";
import { offers } from "./offer.model.js";

export const investmentStatusEnum = pgEnum("investment_status", [
  "active",
  "exited",
  "written_off",
]);

export const investments = pgTable(
  "investments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    offerId: uuid("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "restrict" }),

    pitchId: uuid("pitch_id")
      .notNull()
      .references(() => pitches.id, { onDelete: "restrict" }),

    investorId: uuid("investor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),

    // Snapshot of terms at accept-time — immutable
    amount: numeric("amount").notNull(),
    equity: numeric("equity").notNull(),
    valuation: numeric("valuation").notNull(),

    status: investmentStatusEnum("status").default("active").notNull(),
    investedAt: timestamp("invested_at").defaultNow().notNull(),

    exitValue: numeric("exit_value"),
    exitedAt: timestamp("exited_at"),

    notes: text("notes"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    offerUnique: uniqueIndex("investment_offer_unique").on(table.offerId),
    investorIdx: index("investment_investor_idx").on(table.investorId),
    businessIdx: index("investment_business_idx").on(table.businessId),
    pitchIdx: index("investment_pitch_idx").on(table.pitchId),
  })
);