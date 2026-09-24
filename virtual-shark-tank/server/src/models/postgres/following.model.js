import {
  pgTable,
  uuid,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user.model.js";
import { businesses } from "./businessProfile.model.js";

export const followTargetTypeEnum = pgEnum("follow_target_type", [
  "business",
  "investor",
]);

export const follows = pgTable(
  "follows",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    targetType: followTargetTypeEnum("target_type").notNull(),

    // Exactly one of these is set, based on targetType
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    targetBusinessId: uuid("target_business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserFollow: uniqueIndex("unique_user_follow_idx").on(
      table.followerId,
      table.targetUserId
    ),
    uniqueBusinessFollow: uniqueIndex("unique_business_follow_idx").on(
      table.followerId,
      table.targetBusinessId
    ),
    followerIdx: index("follow_follower_idx").on(table.followerId),
    targetUserIdx: index("follow_target_user_idx").on(table.targetUserId),
    targetBusinessIdx: index("follow_target_business_idx").on(
      table.targetBusinessId
    ),
    // Exactly one target must be set, and it must match targetType
    targetConsistency: check(
      "follow_target_consistency",
      sql`(
        (${table.targetType} = 'business' AND ${table.targetBusinessId} IS NOT NULL AND ${table.targetUserId} IS NULL)
        OR
        (${table.targetType} = 'investor' AND ${table.targetUserId} IS NOT NULL AND ${table.targetBusinessId} IS NULL)
      )`
    ),
  })
);