import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  users,
  follows,
  businessProfiles,
  investorProfiles,
} from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";
import { createNotification } from "./notification.service.js";

// ---------- Follow ----------
export const followUser = async (followerId, followingId) => {
  if (followerId === followingId) {
    throw ApiError.badRequest("You cannot follow yourself");
  }

  const target = await db.query.users.findFirst({
    where: eq(users.id, followingId),
  });
  if (!target) throw ApiError.notFound("User not found");
  if (!target.isActive) throw ApiError.badRequest("Cannot follow an inactive user");

  // Idempotent insert — one row per pair, enforced by unique index
  const [row] = await db
    .insert(follows)
    .values({ followerId, followingId })
    .onConflictDoNothing({
      target: [follows.followerId, follows.followingId],
    })
    .returning();

  // Only notify on an actual new follow (row is present)
  if (row) {
    const follower = await db.query.users.findFirst({
      where: eq(users.id, followerId),
      columns: { id: true, name: true, role: true },
    });
    await createNotification({
      userId: followingId,
      actorId: followerId,
      type: "follow",
      title: `${follower.name} started following you`,
      metadata: { followerId, followerRole: follower.role },
    });
  }

  return { following: true, alreadyFollowing: !row };
};

// ---------- Unfollow ----------
export const unfollowUser = async (followerId, followingId) => {
  if (followerId === followingId) {
    throw ApiError.badRequest("You cannot unfollow yourself");
  }

  const result = await db
    .delete(follows)
    .where(
      and(
        eq(follows.followerId, followerId),
        eq(follows.followingId, followingId)
      )
    )
    .returning();

  return { following: false, wasFollowing: result.length > 0 };
};

// ---------- Is following? ----------
export const isFollowing = async (followerId, followingId) => {
  const row = await db.query.follows.findFirst({
    where: and(
      eq(follows.followerId, followerId),
      eq(follows.followingId, followingId)
    ),
    columns: { id: true },
  });
  return !!row;
};

// ---------- Enrichment helper ----------
// Joins user + the appropriate profile (business or investor) + follow date.
const enrichFollowedUser = (user, businessProfile, investorProfile, followedAt) => ({
  id: user.id,
  name: user.name,
  role: user.role,
  avatarUrl: user.avatarUrl,
  isProfileComplete: user.isProfileComplete,
  followedAt,
  profile:
    user.role === "business"
      ? {
          companyName: businessProfile?.companyName ?? null,
          sector: businessProfile?.sector ?? null,
          city: businessProfile?.city ?? null,
          verificationTier: businessProfile?.verificationTier ?? "unverified",
        }
      : {
          firmName: investorProfile?.firmName ?? null,
          investmentFocus: investorProfile?.investmentFocus ?? null,
          preferredGeography: investorProfile?.preferredGeography ?? null,
          isIdentityVerified: investorProfile?.isIdentityVerified ?? false,
        },
});

// ---------- Who I follow ----------
export const getFollowing = async (userId, { limit = 20, offset = 0 } = {}) => {
  const rows = await db
    .select({
      user: users,
      businessProfile: businessProfiles,
      investorProfile: investorProfiles,
      followedAt: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followingId))
    .leftJoin(businessProfiles, eq(businessProfiles.userId, users.id))
    .leftJoin(investorProfiles, eq(investorProfiles.userId, users.id))
    .where(eq(follows.followerId, userId))
    .orderBy(desc(follows.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(follows)
    .where(eq(follows.followerId, userId));

  return {
    users: rows.map((r) =>
      enrichFollowedUser(r.user, r.businessProfile, r.investorProfile, r.followedAt)
    ),
    pagination: { limit, offset, total: total[0].count },
  };
};

// ---------- Who follows me ----------
export const getFollowers = async (userId, { limit = 20, offset = 0 } = {}) => {
  const rows = await db
    .select({
      user: users,
      businessProfile: businessProfiles,
      investorProfile: investorProfiles,
      followedAt: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followerId))
    .leftJoin(businessProfiles, eq(businessProfiles.userId, users.id))
    .leftJoin(investorProfiles, eq(investorProfiles.userId, users.id))
    .where(eq(follows.followingId, userId))
    .orderBy(desc(follows.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(follows)
    .where(eq(follows.followingId, userId));

  return {
    users: rows.map((r) =>
      enrichFollowedUser(r.user, r.businessProfile, r.investorProfile, r.followedAt)
    ),
    pagination: { limit, offset, total: total[0].count },
  };
};