import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["business", "investor", "admin"]);

export const users = pgTable(
  "users",
  {
    // ---- Identity / auth ----
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: roleEnum("role").notNull().default("business"),

    // ---- Account state ----
    isVerified: boolean("is_verified").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),       // fixed
    isProfileComplete: boolean("is_profile_complete").default(false).notNull(),

    // ---- Settings: display ----
    avatarUrl: varchar("avatar_url", { length: 500 }),
    language: varchar("language", { length: 10 }).default("en").notNull(),
    theme: varchar("theme", { length: 10 }).default("system").notNull(),

    // ---- Settings: notification preferences ----
    notifyNewMatch: boolean("notify_new_match").default(true).notNull(),
    notifyNewMessage: boolean("notify_new_message").default(true).notNull(),
    notifyFollow: boolean("notify_follow").default(true).notNull(),
    notifyProfileUpdate: boolean("notify_profile_update").default(true).notNull(),
    notifyScoreChange: boolean("notify_score_change").default(true).notNull(),
    notifyVerification: boolean("notify_verification").default(true).notNull(),

    // ---- Timestamps ----
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex("email_idx").on(table.email),
  })
);