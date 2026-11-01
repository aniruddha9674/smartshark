import {
  pgTable,
  bigint,
  uuid,
  varchar,
  integer,
  numeric,
  date,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { businesses } from "./businessProfile.model.js";
import { users } from "./user.model.js";

// ═══════════════════════════════════════════════════════════════════
// 1. business_media — product photos, premises, pitch video
// ═══════════════════════════════════════════════════════════════════
export const businessMedia = pgTable(
  "business_media",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 1000 }).notNull(),
    publicId: varchar("public_id", { length: 255 }),
    mediaType: varchar("media_type", { length: 30 }).notNull(),
    caption: varchar("caption", { length: 300 }),
    displayOrder: integer("display_order").default(0).notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessIdx: index("business_media_business_idx").on(
      table.businessId,
      table.displayOrder
    ),
    typeIdx: index("business_media_type_idx").on(table.mediaType),
  })
);

// ═══════════════════════════════════════════════════════════════════
// 2. business_directors — DINs from MCA
// ═══════════════════════════════════════════════════════════════════
export const businessDirectors = pgTable(
  "business_directors",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    din: varchar("din", { length: 8 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    appointedAt: date("appointed_at"),
    isActive: boolean("is_active").default(true).notNull(),
    source: varchar("source", { length: 30 }).default("mca").notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => ({
    businessIdx: index("business_directors_business_idx").on(table.businessId),
    uniqueDin: uniqueIndex("business_directors_din_unique").on(
      table.businessId,
      table.din
    ),
  })
);

// ═══════════════════════════════════════════════════════════════════
// 3. business_charges — secured loans (MCA)
// ═══════════════════════════════════════════════════════════════════
export const businessCharges = pgTable(
  "business_charges",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    chargeId: varchar("charge_id", { length: 50 }),
    holderName: varchar("holder_name", { length: 255 }),
    amount: numeric("amount"),
    creationDate: date("creation_date"),
    status: varchar("status", { length: 30 }),
    source: varchar("source", { length: 30 }).default("mca").notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => ({
    businessIdx: index("business_charges_business_idx").on(table.businessId),
  })
);

// ═══════════════════════════════════════════════════════════════════
// 4. business_evidence_claims — revenue claim provenance tracker
// ═══════════════════════════════════════════════════════════════════
export const businessEvidenceClaims = pgTable(
  "business_evidence_claims",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    claimType: varchar("claim_type", { length: 50 }).notNull(),
    claimedValue: numeric("claimed_value"),
    claimedPeriod: varchar("claimed_period", { length: 30 }),
    evidenceTier: varchar("evidence_tier", { length: 30 })
      .default("claimed")
      .notNull(),
    corroboratingSources: jsonb("corroborating_sources").default([]),
    discrepancyPct: numeric("discrepancy_pct"),
    lastCheckedAt: timestamp("last_checked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessIdx: index("business_evidence_claims_business_idx").on(
      table.businessId,
      table.claimType
    ),
    tierIdx: index("business_evidence_claims_tier_idx").on(table.evidenceTier),
  })
);