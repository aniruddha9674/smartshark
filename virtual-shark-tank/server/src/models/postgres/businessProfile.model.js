import { pgTable, uuid, varchar, text, numeric, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";

export const verificationTierEnum = pgEnum("verification_tier", ["unverified", "basic", "verified"]);

export const businessProfiles = pgTable("business_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  companyName: varchar("company_name", { length: 255 }),
  sector: varchar("sector", { length: 100 }),
  city: varchar("city", { length: 100 }),
  description: text("description"),
  udyamNumber: varchar("udyam_number", { length: 50 }),
  gstNumber: varchar("gst_number", { length: 50 }),
  shopActLicense: varchar("shop_act_license", { length: 50 }),
  verificationTier: verificationTierEnum("verification_tier").default("unverified"),
  fundingAsk: numeric("funding_ask"),
  yearsOperating: integer("years_operating"),
});