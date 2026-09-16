import { eq } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { users, notifications } from "../models/postgres/index.js";

// Maps notification type → the preference column on users
const PREFERENCE_MAP = {
  follow: "notifyFollow",
  new_message: "notifyNewMessage",
  new_match: "notifyNewMatch",
  profile_update: "notifyProfileUpdate",
  score_change: "notifyScoreChange",
  verification_update: "notifyVerification",
  saved_business_activity: null, // no pref, always send
  system: null,                  // always send
};

/**
 * Create a notification for a user.
 *
 * - Checks the recipient's preference for this type.
 * - Silently returns null if the user has opted out.
 * - Never throws — a failed notification must not fail the calling request.
 *
 * @returns {object|null} The created notification, or null if skipped.
 */
export const createNotification = async ({
  userId,
  actorId = null,
  type,
  title,
  body = null,
  metadata = null,
}) => {
  try {
    // Look up preference
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, notifyFollow: true, notifyNewMessage: true,
                 notifyNewMatch: true, notifyProfileUpdate: true,
                 notifyScoreChange: true, notifyVerification: true },
    });

    if (!user) return null;

    const prefKey = PREFERENCE_MAP[type];
    if (prefKey && user[prefKey] === false) return null;

    const [notification] = await db
      .insert(notifications)
      .values({ userId, actorId, type, title, body, metadata })
      .returning();

    return notification;
  } catch (err) {
    // Notifications must never break the calling operation.
    console.error("Failed to create notification:", err.message);
    return null;
  }
};