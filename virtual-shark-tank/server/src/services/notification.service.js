import { eq, and, desc, lt, sql } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { users, notifications } from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";

// Maps notification type → the preference column on users
const PREFERENCE_MAP = {
  follow: "notifyFollow",
  new_message: "notifyNewMessage",
  new_match: "notifyNewMatch",
  profile_update: "notifyProfileUpdate",
  score_change: "notifyScoreChange",
  verification_update: "notifyVerification",
  saved_business_activity: null,
  system: null,
  new_offer: null,
  offer_accepted: null,
  offer_rejected: null,
  offer_countered: null,
  offer_withdrawn: null,
  offer_expired: null,
};

// ============================================================
// CREATE
// ============================================================

/**
 * Create a notification for a user.
 *
 * - Checks the recipient's preference for this type.
 * - Silently returns null if the user has opted out.
 * - Never throws — a failed notification must not fail the calling request.
 * - Dedupes by `eventId` — same event ID produces exactly one row.
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
  eventId = null,
}) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        notifyFollow: true,
        notifyNewMessage: true,
        notifyNewMatch: true,
        notifyProfileUpdate: true,
        notifyScoreChange: true,
        notifyVerification: true,
      },
    });

    if (!user) return null;

    const prefKey = PREFERENCE_MAP[type];
    if (prefKey && user[prefKey] === false) return null;

    const [notification] = await db
      .insert(notifications)
      .values({ userId, actorId, type, title, body, metadata, eventId })
      .onConflictDoNothing({ target: notifications.eventId })
      .returning();

    return notification ?? null;
  } catch (err) {
    console.error("Failed to create notification:", err.message);
    return null;
  }
};

// ============================================================
// READ
// ============================================================

export const listNotifications = async (
  userId,
  { type, unread, limit = 20, offset = 0 } = {}
) => {
  const conditions = [eq(notifications.userId, userId)];
  if (type) conditions.push(eq(notifications.type, type));
  if (unread === true) conditions.push(eq(notifications.isRead, false));

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(notifications)
    .where(and(...conditions));

  return {
    notifications: rows,
    pagination: { limit, offset, total: totalRow.count },
  };
};

export const getUnreadCount = async (userId) => {
  const [row] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    );
  return { count: row.count };
};

// ============================================================
// STATE CHANGES
// ============================================================

export const markRead = async (notificationId, userId) => {
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      )
    )
    .returning();

  if (!updated) throw ApiError.notFound("Notification not found");
  return updated;
};

export const markAllRead = async (userId) => {
  const result = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    )
    .returning({ id: notifications.id });

  return { markedRead: result.length };
};

export const deleteNotification = async (notificationId, userId) => {
  const result = await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      )
    )
    .returning({ id: notifications.id });

  if (result.length === 0) throw ApiError.notFound("Notification not found");
  return { deleted: true };
};

// ============================================================
// CLEANUP
// ============================================================

/**
 * Delete read notifications older than RETENTION_DAYS.
 * Unread notifications are always kept.
 */
export const cleanupOldNotifications = async (retentionDays = 90) => {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await db
    .delete(notifications)
    .where(
      and(eq(notifications.isRead, true), lt(notifications.createdAt, cutoff))
    )
    .returning({ id: notifications.id });

  return { deleted: result.length, cutoff };
};