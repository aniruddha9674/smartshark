import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";

export const notificationTypeEnum = pgEnum("notification_type", [
  "new_match",
  "new_message",
  "follow",
  "profile_update",
  "score_change",
  "verification_update",
  "saved_business_activity",
  "system",
  // Offers
  "new_offer",
  "offer_accepted",
  "offer_rejected",
  "offer_countered",
  "offer_withdrawn",
  "offer_expired",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Deterministic dedup key set by the caller, e.g. "follow:userA:businessB"
    eventId: varchar("event_id", { length: 255 }),

    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    metadata: jsonb("metadata"),

    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // Hot query: unread for me, newest first — index-only scan
    userUnreadCreatedIdx: index("notif_user_unread_created_idx").on(
      table.userId,
      table.isRead,
      table.createdAt
    ),
    // All my notifications, newest first
    userCreatedIdx: index("notif_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
    // Dedup guard — same event can only produce one notification
    eventIdUnique: uniqueIndex("notif_event_id_unique").on(table.eventId),
  })
);