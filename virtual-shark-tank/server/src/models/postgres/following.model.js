import {
  pgTable,
  uuid,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";

export const follows = pgTable(
  "follows",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingId: uuid("following_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    uniqueFollow: uniqueIndex("unique_follow_idx").on(
      table.followerId,
      table.followingId
    ),
    followingIdx: index("following_idx").on(table.followingId),
    noSelfFollow: check(
      "no_self_follow",
      sql`${table.followerId} <> ${table.followingId}`
    ),
  })
);