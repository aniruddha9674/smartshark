import { pgTable, uuid, varchar, numeric, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";

export const investorProfiles = pgTable("investor_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  panNumber: varchar("pan_number", { length: 20 }),
  firmName: varchar("firm_name", { length: 255 }),
  investmentFocus: varchar("investment_focus", { length: 255 }),
  preferredGeography: varchar("preferred_geography", { length: 255 }),
  minTicketSize: numeric("min_ticket_size"),
  maxTicketSize: numeric("max_ticket_size"),
  isIdentityVerified: boolean("is_identity_verified").default(false),
});