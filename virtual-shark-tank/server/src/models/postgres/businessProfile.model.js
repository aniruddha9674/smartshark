import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";
import { importBatches } from "./importBatch.model.js";
import { rawImportBusinesses } from "./rawImportBusiness.model.js";

export const verificationTierEnum = pgEnum("verification_tier", [
  "unverified",
  "basic",
  "verified",
]);

export const fundingInstrumentEnum = pgEnum("funding_instrument", [
  "equity",
  "debt",
  "revenue_share",
  "hybrid",
]);

export const revenueTrendEnum = pgEnum("revenue_trend", [
  "declining",
  "flat",
  "growing_20",
  "growing_50",
  "growing_100",
]);

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    // NULLABLE — MCA-ingested businesses have no owner until claimed
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "cascade",
    }),

    // ─── Identity & MCA source ─────────────────────────────────
    cin: varchar("cin", { length: 21 }),
    companyName: varchar("company_name", { length: 255 }),
    companyRoc: varchar("company_roc", { length: 100 }),
    companyCategory: varchar("company_category", { length: 100 }),
    companySubCategory: varchar("company_sub_category", { length: 100 }),
    companyClass: varchar("company_class", { length: 50 }),
    companyStatus: varchar("company_status", { length: 50 }),
    listingStatus: varchar("listing_status", { length: 50 }),
    authorizedCapital: numeric("authorized_capital"),
    paidUpCapital: numeric("paid_up_capital"),
    incorporationDate: date("incorporation_date"),
    registeredAddress: text("registered_address"),
    country: varchar("country", { length: 100 }),

    // ─── Sector & location ────────────────────────────────────
    sector: varchar("sector", { length: 100 }),
    nicCode: varchar("nic_code", { length: 10 }),
    industrialClassification: varchar("industrial_classification", {
      length: 255,
    }),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 100 }),
    pincode: varchar("pincode", { length: 10 }),

    // ─── Core profile (user-provided) ─────────────────────────
    tagline: varchar("tagline", { length: 300 }),
    description: text("description"),
    businessModel: varchar("business_model", { length: 100 }),
    targetMarket: varchar("target_market", { length: 200 }),
    keyProducts: jsonb("key_products").default([]),
    notableClients: jsonb("notable_clients").default([]),
    differentiation: text("differentiation"),
    competitors: jsonb("competitors").default([]),

    // ─── Verification docs ────────────────────────────────────
    udyamNumber: varchar("udyam_number", { length: 50 }),
    gstNumber: varchar("gst_number", { length: 50 }),
    shopActLicense: varchar("shop_act_license", { length: 50 }),
    verificationTier: verificationTierEnum("verification_tier")
      .default("unverified")
      .notNull(),

    // ─── Team ─────────────────────────────────────────────────
    employeeCount: integer("employee_count"),
    employeeCountSource: varchar("employee_count_source", { length: 30 }),

    // ─── Funding ask ──────────────────────────────────────────
    fundingAsk: numeric("funding_ask"),
    fundingInstrument: fundingInstrumentEnum("funding_instrument"),
    useOfFunds: jsonb("use_of_funds").default([]),
    plannedMilestones: jsonb("planned_milestones").default([]),
    yearsOperating: integer("years_operating"),

    // ─── Traction ─────────────────────────────────────────────
    revenueRange: varchar("revenue_range", { length: 50 }),
    revenueSource: varchar("revenue_source", { length: 30 }),
    revenueTrendBracket: revenueTrendEnum("revenue_trend_bracket"),
    customerCount: integer("customer_count"),
    repeatCustomerPct: numeric("repeat_customer_pct"),
    monthlyOrderVolume: integer("monthly_order_volume"),

    // ─── Existing funding & debt ──────────────────────────────
    priorFunding: jsonb("prior_funding").default([]),
    existingLoans: jsonb("existing_loans").default([]),

    // ─── Compliance & risks ───────────────────────────────────
    licenses: jsonb("licenses").default([]),
    selfDeclaredRisks: text("self_declared_risks"),
    litigationNotes: text("litigation_notes"),

    // ─── Media & presence ─────────────────────────────────────
    websiteUrl: varchar("website_url", { length: 500 }),
    linkedinUrl: varchar("linkedin_url", { length: 500 }),
    twitterUrl: varchar("twitter_url", { length: 500 }),
    logoUrl: varchar("logo_url", { length: 1000 }),
    coverImageUrl: varchar("cover_image_url", { length: 1000 }),
    pitchVideoUrl: varchar("pitch_video_url", { length: 500 }),

    // ─── Cached readiness score ───────────────────────────────
    currentReadinessScore: integer("current_readiness_score"),

    // ─── Provenance (per-field trust) ─────────────────────────
    // shape: { "authorizedCapital": { "source": "mca", "tier": "verified", "updated": "2026-10-20" } }
    fieldProvenance: jsonb("field_provenance").default({}),

    // ─── Profile state ────────────────────────────────────────
    isProfileComplete: boolean("is_profile_complete").default(false).notNull(),
    profileCompletenessPct: integer("profile_completeness_pct").default(0),

    // ─── Timestamps ───────────────────────────────────────────
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),

    // ─── Import / enrichment ──────────────────────────────────
    isExternal: boolean("is_external").default(false).notNull(),
    sourceBatchId: uuid("source_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    sourceRowId: uuid("source_row_id").references(
      () => rawImportBusinesses.id,
      { onDelete: "set null" }
    ),
    dataSource: varchar("data_source", { length: 30 }).default("user"),
    enrichmentStatus: varchar("enrichment_status", { length: 20 })
      .default("pending")
      .notNull(),
    enrichedAt: timestamp("enriched_at"),
  },
  (table) => ({
    ownerIdx: index("business_owner_idx").on(table.ownerId),
    cinUnique: uniqueIndex("businesses_cin_unique").on(table.cin),
    sectorIdx: index("business_sector_idx").on(table.sector),
    stateIdx: index("businesses_state_idx").on(table.state),
    nicIdx: index("businesses_nic_idx").on(table.nicCode),
    statusIdx: index("businesses_status_idx").on(table.companyStatus),
    verificationIdx: index("business_verification_idx").on(
      table.verificationTier
    ),
    isExternalIdx: index("business_is_external_idx").on(table.isExternal),
    sourceBatchIdx: index("business_source_batch_idx").on(table.sourceBatchId),
    enrichmentStatusIdx: index("business_enrichment_status_idx").on(
      table.enrichmentStatus
    ),
    dataSourceIdx: index("businesses_data_source_idx").on(table.dataSource),
    searchIndex: index("business_search_trgm_idx").using(
      "gin",
      sql`(
        COALESCE(company_name, '') || ' ' ||
        COALESCE(sector, '') || ' ' ||
        COALESCE(city, '') || ' ' ||
        COALESCE(description, '')
      ) gin_trgm_ops`
    ),
  })
);