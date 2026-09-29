import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    // Nullable — pre-login events have no user
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // varchar not enum — event types evolve constantly, we don't want a
    // migration every time we add one
    eventType: varchar("event_type", { length: 50 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }),
    entityId: uuid("entity_id"),

    // Per-event-shape payload. Documented via the code registry, not the DB
    metadata: jsonb("metadata"),

    // Bump when the metadata shape changes for a given eventType
    schemaVersion: integer("schema_version").default(1).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // "Show me my recent activity" — dashboard, recently viewed
    userRecentIdx: index("event_user_recent_idx").on(
      table.userId,
      table.createdAt
    ),
    // "Who interacted with this entity?" — pitch analytics, business views
    entityRecentIdx: index("event_entity_recent_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt
    ),
    // "How many X happened today?" — analytics, aggregations
    typeRecentIdx: index("event_type_recent_idx").on(
      table.eventType,
      table.createdAt
    ),
  })
);