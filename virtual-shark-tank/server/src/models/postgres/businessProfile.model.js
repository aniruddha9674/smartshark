import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";

export const verificationTierEnum = pgEnum("verification_tier", [
  "unverified",
  "basic",
  "verified",
]);

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    // NOT unique — a user can own many businesses
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // ---- Core profile ----
    companyName: varchar("company_name", { length: 255 }),
    sector: varchar("sector", { length: 100 }),
    city: varchar("city", { length: 100 }),
    description: text("description"),

    // ---- Verification docs ----
    udyamNumber: varchar("udyam_number", { length: 50 }),
    gstNumber: varchar("gst_number", { length: 50 }),
    shopActLicense: varchar("shop_act_license", { length: 50 }),
    verificationTier: verificationTierEnum("verification_tier")
      .default("unverified")
      .notNull(),

    // ---- Business facts ----
    fundingAsk: numeric("funding_ask"),        // kept for now; may move to pitches later
    yearsOperating: integer("years_operating"),

    // ---- Completion flag (per business) ----
    isProfileComplete: boolean("is_profile_complete").default(false).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    ownerIdx: index("business_owner_idx").on(table.ownerId),
    sectorIdx: index("business_sector_idx").on(table.sector),
    verificationIdx: index("business_verification_idx").on(table.verificationTier),
  })
);