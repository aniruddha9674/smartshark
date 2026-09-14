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

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    participantAId: uuid("participant_a_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    participantBId: uuid("participant_b_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniquePair: uniqueIndex("unique_conversation_pair_idx").on(
      table.participantAId,
      table.participantBId
    ),
    participantAIdx: index("conv_participant_a_idx").on(table.participantAId),
    participantBIdx: index("conv_participant_b_idx").on(table.participantBId),
    orderedPair: check(
      "conversation_ordered_pair",
      sql`${table.participantAId} < ${table.participantBId}`
    ),
  })
);