import {
  pgTable,
  uuid,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";

export const profileViews = pgTable(
  "profile_views",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    viewerId: uuid("viewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewedId: uuid("viewed_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewCount: integer("view_count").default(1).notNull(),
    lastViewedAt: timestamp("last_viewed_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniquePair: uniqueIndex("unique_profile_view_idx").on(
      table.viewerId,
      table.viewedId
    ),
    viewerRecentIdx: index("pv_viewer_recent_idx").on(
      table.viewerId,
      table.lastViewedAt
    ),
    viewedIdx: index("pv_viewed_idx").on(table.viewedId),
    noSelfView: check(
      "no_self_view",
      sql`${table.viewerId} <> ${table.viewedId}`
    ),
  })
);