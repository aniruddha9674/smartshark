import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  users,
  businesses,
  investorProfiles,
  follows,
} from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";
import { createNotification } from "./notification.service.js";

// ============================================================
// FOLLOW A BUSINESS
// ============================================================

export const followBusiness = async (followerId, businessId) => {
  // Cannot follow your own business
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
  });
  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId === followerId) {
    throw ApiError.badRequest("You cannot follow your own business");
  }

  const [row] = await db
    .insert(follows)
    .values({
      followerId,
      targetType: "business",
      targetBusinessId: businessId,
      targetUserId: null,
    })
    .onConflictDoNothing({
      target: [follows.followerId, follows.targetBusinessId],
    })
    .returning();

  // Notify the business owner only on a fresh follow
  if (row) {
    const follower = await db.query.users.findFirst({
      where: eq(users.id, followerId),
      columns: { id: true, name: true },
    });
    await createNotification({
      userId: business.ownerId,
      actorId: followerId,
      type: "follow",
      title: `${follower.name} started following ${business.companyName || "your business"}`,
      metadata: {
        followerId,
        businessId,
        targetType: "business",
      },
    });
  }

  return { following: true, alreadyFollowing: !row };
};

export const unfollowBusiness = async (followerId, businessId) => {
  const result = await db
    .delete(follows)
    .where(
      and(
        eq(follows.followerId, followerId),
        eq(follows.targetBusinessId, businessId)
      )
    )
    .returning();

  return { following: false, wasFollowing: result.length > 0 };
};

export const isFollowingBusiness = async (followerId, businessId) => {
  const row = await db.query.follows.findFirst({
    where: and(
      eq(follows.followerId, followerId),
      eq(follows.targetBusinessId, businessId)
    ),
    columns: { id: true },
  });
  return !!row;
};

// ============================================================
// FOLLOW AN INVESTOR (a person)
// ============================================================

export const followInvestor = async (followerId, targetUserId) => {
  if (followerId === targetUserId) {
    throw ApiError.badRequest("You cannot follow yourself");
  }

  // Target must exist and be an investor (have an investor_profiles row)
  const target = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
  });
  if (!target) throw ApiError.notFound("User not found");
  if (!target.isActive) throw ApiError.badRequest("Cannot follow an inactive user");

  const investorProfile = await db.query.investorProfiles.findFirst({
    where: eq(investorProfiles.userId, targetUserId),
    columns: { id: true },
  });
  if (!investorProfile) {
    throw ApiError.badRequest("Target user is not an investor");
  }

  const [row] = await db
    .insert(follows)
    .values({
      followerId,
      targetType: "investor",
      targetUserId,
      targetBusinessId: null,
    })
    .onConflictDoNothing({
      target: [follows.followerId, follows.targetUserId],
    })
    .returning();

  if (row) {
    const follower = await db.query.users.findFirst({
      where: eq(users.id, followerId),
      columns: { id: true, name: true },
    });
    await createNotification({
      userId: targetUserId,
      actorId: followerId,
      type: "follow",
      title: `${follower.name} started following you`,
      metadata: {
        followerId,
        targetUserId,
        targetType: "investor",
      },
    });
  }

  return { following: true, alreadyFollowing: !row };
};

export const unfollowInvestor = async (followerId, targetUserId) => {
  if (followerId === targetUserId) {
    throw ApiError.badRequest("You cannot unfollow yourself");
  }

  const result = await db
    .delete(follows)
    .where(
      and(
        eq(follows.followerId, followerId),
        eq(follows.targetUserId, targetUserId)
      )
    )
    .returning();

  return { following: false, wasFollowing: result.length > 0 };
};

export const isFollowingInvestor = async (followerId, targetUserId) => {
  const row = await db.query.follows.findFirst({
    where: and(
      eq(follows.followerId, followerId),
      eq(follows.targetUserId, targetUserId)
    ),
    columns: { id: true },
  });
  return !!row;
};

// ============================================================
// WHO I FOLLOW (both types, merged)
// ============================================================

export const getFollowing = async (userId, { limit = 20, offset = 0 } = {}) => {
  // Fetch all my follows
  const rows = await db
    .select()
    .from(follows)
    .where(eq(follows.followerId, userId))
    .orderBy(desc(follows.createdAt));

  const businessIds = rows
    .filter((r) => r.targetType === "business" && r.targetBusinessId)
    .map((r) => r.targetBusinessId);
  const investorIds = rows
    .filter((r) => r.targetType === "investor" && r.targetUserId)
    .map((r) => r.targetUserId);

  // Batch-fetch businesses + owners
  const businessRows = businessIds.length
    ? await db
        .select({
          business: businesses,
          owner: {
            id: users.id,
            name: users.name,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(businesses)
        .innerJoin(users, eq(users.id, businesses.ownerId))
        .where(inArray(businesses.id, businessIds))
    : [];
  const businessMap = new Map(businessRows.map((r) => [r.business.id, r]));

  // Batch-fetch investors + profiles
  const investorRows = investorIds.length
    ? await db
        .select({
          user: {
            id: users.id,
            name: users.name,
            avatarUrl: users.avatarUrl,
          },
          profile: investorProfiles,
        })
        .from(users)
        .leftJoin(investorProfiles, eq(investorProfiles.userId, users.id))
        .where(inArray(users.id, investorIds))
    : [];
  const investorMap = new Map(investorRows.map((r) => [r.user.id, r]));

  // Merge into a single list, newest first (already sorted from follows)
  const merged = rows.map((r) => {
    if (r.targetType === "business") {
      const entry = businessMap.get(r.targetBusinessId);
      if (!entry) return null;
      return {
        type: "business",
        id: entry.business.id,
        companyName: entry.business.companyName,
        sector: entry.business.sector,
        city: entry.business.city,
        verificationTier: entry.business.verificationTier,
        isProfileComplete: entry.business.isProfileComplete,
        owner: entry.owner,
        followedAt: r.createdAt,
      };
    }
    const entry = investorMap.get(r.targetUserId);
    if (!entry) return null;
    return {
      type: "investor",
      id: entry.user.id,
      name: entry.user.name,
      avatarUrl: entry.user.avatarUrl,
      firmName: entry.profile?.firmName ?? null,
      investmentFocus: entry.profile?.investmentFocus ?? null,
      preferredGeography: entry.profile?.preferredGeography ?? null,
      isIdentityVerified: entry.profile?.isIdentityVerified ?? false,
      followedAt: r.createdAt,
    };
  }).filter(Boolean);

  // Paginate in-memory (list is small per user)
  const total = merged.length;
  const paged = merged.slice(offset, offset + limit);

  return {
    following: paged,
    pagination: { limit, offset, total },
  };
};

// ============================================================
// WHO FOLLOWS MY BUSINESS
// ============================================================

export const getBusinessFollowers = async (
  businessId,
  requestingUserId,
  { limit = 20, offset = 0 } = {}
) => {
  // Only the owner can list followers of their business
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
    columns: { id: true, ownerId: true, companyName: true },
  });
  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId !== requestingUserId) {
    throw ApiError.forbidden("You do not own this business");
  }

  const rows = await db
    .select({
      follower: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
      followedAt: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followerId))
    .where(eq(follows.targetBusinessId, businessId))
    .orderBy(desc(follows.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(follows)
    .where(eq(follows.targetBusinessId, businessId));

  return {
    followers: rows.map((r) => ({
      id: r.follower.id,
      name: r.follower.name,
      avatarUrl: r.follower.avatarUrl,
      followedAt: r.followedAt,
    })),
    pagination: { limit, offset, total: totalRow.count },
  };
};

// ============================================================
// WHO FOLLOWS ME (as an investor)
// ============================================================

export const getInvestorFollowers = async (
  investorUserId,
  { limit = 20, offset = 0 } = {}
) => {
  const rows = await db
    .select({
      follower: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
      followedAt: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followerId))
    .where(eq(follows.targetUserId, investorUserId))
    .orderBy(desc(follows.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(follows)
    .where(eq(follows.targetUserId, investorUserId));

  return {
    followers: rows.map((r) => ({
      id: r.follower.id,
      name: r.follower.name,
      avatarUrl: r.follower.avatarUrl,
      followedAt: r.followedAt,
    })),
    pagination: { limit, offset, total: totalRow.count },
  };
};