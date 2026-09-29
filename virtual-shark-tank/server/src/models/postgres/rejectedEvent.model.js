import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";

/**
 * Every attempt to log an unregistered event type lands here.
 *
 * Once a week, a human reviews this:
 *   - Attempted 100+ times → likely needed, add to registry
 *   - Attempted once by one user → typo, ignore
 *
 * This is what makes the registry self-maintaining — the data tells us
 * which events are needed, not a developer's guess.
 */
export const rejectedEvents = pgTable(
  "rejected_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    attemptedType: varchar("attempted_type", { length: 50 }).notNull(),
    count: integer("count").default(1).notNull(),
    sampleUserId: uuid("sample_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => ({
    typeUnique: uniqueIndex("rejected_event_type_unique").on(
      table.attemptedType
    ),
  })
);