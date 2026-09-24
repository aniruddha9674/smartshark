import { eq, and, ne, desc, sql, inArray, or } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  offers,
  pitches,
  businesses,
  users,
} from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";
import { createNotification } from "./notification.service.js";
import { createInvestment } from "./investment.service.js";
import { getOrCreateConversation } from "./conversation.service.js";
import { enforceLimit } from "./rateLimit.service.js";
import {
  OFFER_DEFAULT_EXPIRY_DAYS,
  OFFER_MAX_COUNTER_DEPTH,
  MAX_OFFERS_PER_DAY,
} from "../validators/offer.validator.js";

// ============================================================
// HELPERS
// ============================================================

const computeValuation = (amount, equity) => {
  const a = Number(amount);
  const e = Number(equity);
  return (a / (e / 100)).toFixed(2);
};

const computeExpiry = (days) => {
  const d = days ?? OFFER_DEFAULT_EXPIRY_DAYS;
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
};

const assertNotExpired = async (offer) => {
  if (offer.status !== "pending") return;
  if (new Date(offer.expiresAt) > new Date()) return;

  await db
    .update(offers)
    .set({ status: "expired", respondedAt: new Date() })
    .where(eq(offers.id, offer.id));

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, offer.businessId),
    columns: { ownerId: true },
  });

  await Promise.allSettled([
    createNotification({
      userId: offer.investorId,
      type: "offer_expired",
      title: "Your offer expired",
      metadata: { offerId: offer.id, pitchId: offer.pitchId },
      eventId: `offer_expired_investor:${offer.id}`,
    }),
    business
      ? createNotification({
          userId: business.ownerId,
          type: "offer_expired",
          title: "An offer expired",
          metadata: { offerId: offer.id, pitchId: offer.pitchId },
          eventId: `offer_expired_business:${offer.id}`,
        })
      : Promise.resolve(null),
  ]);

  throw ApiError.badRequest("Offer has expired");
};

const assertCanCounter = (offer, userId) => {
  if (offer.initiatedById === userId) {
    throw ApiError.forbidden("You cannot counter your own offer. Wait for the other party to respond.");
  }
};

const getThreadDepth = async (offerId) => {
  let depth = 1;
  let current = offerId;
  while (depth <= OFFER_MAX_COUNTER_DEPTH + 2) {
    const row = await db.query.offers.findFirst({
      where: eq(offers.id, current),
      columns: { parentOfferId: true },
    });
    if (!row?.parentOfferId) return depth;
    current = row.parentOfferId;
    depth++;
  }
  return depth;
};

// ============================================================
// CREATE
// ============================================================

export const createOffer = async (investorId, data) => {
  const { pitchId, amount, equityRequested, conditions, message, expiresInDays } = data;

  const pitch = await db.query.pitches.findFirst({
    where: eq(pitches.id, pitchId),
  });
  if (!pitch) throw ApiError.notFound("Pitch not found");
  if (pitch.status !== "live") {
    throw ApiError.badRequest(`Cannot offer on a ${pitch.status} pitch`);
  }

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, pitch.businessId),
    columns: { id: true, ownerId: true, companyName: true },
  });
  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId === investorId) {
    throw ApiError.badRequest("You cannot make an offer on your own business");
  }

  enforceLimit(investorId, "create_offer", MAX_OFFERS_PER_DAY);

  const existingPending = await db.query.offers.findFirst({
    where: and(
      eq(offers.pitchId, pitchId),
      eq(offers.investorId, investorId),
      eq(offers.status, "pending")
    ),
    columns: { id: true },
  });
  if (existingPending) {
    throw ApiError.conflict("You already have a pending offer on this pitch");
  }

  const [offer] = await db
    .insert(offers)
    .values({
      pitchId,
      investorId,
      businessId: business.id,
      initiatedById: investorId,
      amount: String(amount),
      equityRequested: String(equityRequested),
      valuation: computeValuation(amount, equityRequested),
      conditions: conditions || null,
      message: message || null,
      expiresAt: computeExpiry(expiresInDays),
      status: "pending",
    })
    .returning();

  const investor = await db.query.users.findFirst({
    where: eq(users.id, investorId),
    columns: { name: true },
  });
  await createNotification({
    userId: business.ownerId,
    actorId: investorId,
    type: "new_offer",
    title: `New offer from ${investor.name}`,
    body: `₹${amount} for ${equityRequested}%`,
    metadata: { offerId: offer.id, pitchId, businessId: business.id },
    eventId: `offer_created:${offer.id}`,
  });

  return offer;
};

// ============================================================
// COUNTER
// ============================================================

export const counterOffer = async (parentOfferId, userId, data) => {
  const { amount, equityRequested, conditions, message, expiresInDays } = data;

  const parent = await db.query.offers.findFirst({
    where: eq(offers.id, parentOfferId),
  });
  if (!parent) throw ApiError.notFound("Offer not found");

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, parent.businessId),
    columns: { ownerId: true },
  });

  const isInvestor = parent.investorId === userId;
  const isOwner = business?.ownerId === userId;
  if (!isInvestor && !isOwner) {
    throw ApiError.forbidden("You are not part of this offer");
  }

  await assertNotExpired(parent);

  if (parent.status !== "pending") {
    throw ApiError.badRequest(`Cannot counter a ${parent.status} offer`);
  }

  assertCanCounter(parent, userId);

  const depth = await getThreadDepth(parent.id);
  if (depth >= OFFER_MAX_COUNTER_DEPTH) {
    throw ApiError.badRequest(
      `Counter chain reached maximum depth (${OFFER_MAX_COUNTER_DEPTH}). Accept, reject, or let it expire.`
    );
  }

  const otherUserId = isInvestor ? business.ownerId : parent.investorId;

  const newOffer = await db.transaction(async (tx) => {
    await tx
      .update(offers)
      .set({ status: "countered", respondedAt: new Date() })
      .where(eq(offers.id, parent.id));

    const [inserted] = await tx
      .insert(offers)
      .values({
        pitchId: parent.pitchId,
        investorId: parent.investorId,
        businessId: parent.businessId,
        initiatedById: userId,
        parentOfferId: parent.id,
        amount: String(amount),
        equityRequested: String(equityRequested),
        valuation: computeValuation(amount, equityRequested),
        conditions: conditions || null,
        message: message || null,
        expiresAt: computeExpiry(expiresInDays),
        status: "pending",
      })
      .returning();

    return inserted;
  });

  const actor = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { name: true },
  });
  await createNotification({
    userId: otherUserId,
    actorId: userId,
    type: "offer_countered",
    title: `${actor.name} countered your offer`,
    body: `₹${amount} for ${equityRequested}%`,
    metadata: { offerId: newOffer.id, parentOfferId: parent.id, pitchId: parent.pitchId },
    eventId: `offer_countered:${newOffer.id}`,
  });

  return newOffer;
};

// ============================================================
// ACCEPT
// ============================================================

export const acceptOffer = async (offerId, userId) => {
  const offer = await db.query.offers.findFirst({
    where: eq(offers.id, offerId),
  });
  if (!offer) throw ApiError.notFound("Offer not found");

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, offer.businessId),
    columns: { id: true, ownerId: true, companyName: true },
  });
  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId !== userId) {
    throw ApiError.forbidden("Only the business owner can accept this offer");
  }

  await assertNotExpired(offer);

  if (offer.status !== "pending") {
    throw ApiError.badRequest(`Cannot accept a ${offer.status} offer`);
  }

  const pitch = await db.query.pitches.findFirst({
    where: eq(pitches.id, offer.pitchId),
  });
  if (!pitch) throw ApiError.notFound("Pitch not found");
  if (pitch.status !== "live") {
    throw ApiError.badRequest(`Cannot accept an offer on a ${pitch.status} pitch`);
  }

  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(offers)
      .where(eq(offers.id, offerId))
      .limit(1);
    if (!current || current.status !== "pending") {
      throw ApiError.conflict("Offer is no longer pending");
    }

    const [accepted] = await tx
      .update(offers)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(eq(offers.id, offerId))
      .returning();

    const siblings = await tx
      .update(offers)
      .set({ status: "rejected", respondedAt: new Date() })
      .where(
        and(
          eq(offers.pitchId, offer.pitchId),
          eq(offers.status, "pending"),
          ne(offers.id, offerId)
        )
      )
      .returning({ id: offers.id, investorId: offers.investorId });

    await tx
      .update(pitches)
      .set({ status: "funded", closedAt: new Date(), updatedAt: new Date() })
      .where(eq(pitches.id, offer.pitchId));

    const investment = await createInvestment(tx, {
      offerId: accepted.id,
      pitchId: accepted.pitchId,
      investorId: accepted.investorId,
      businessId: accepted.businessId,
      amount: accepted.amount,
      equity: accepted.equityRequested,
      valuation: accepted.valuation,
    });

    return { accepted, siblings, investment };
  });

  try {
    await getOrCreateConversation(offer.investorId, userId);
  } catch (err) {
    console.error("Failed to create conversation on accept:", err.message);
  }

  await createNotification({
    userId: offer.investorId,
    actorId: userId,
    type: "offer_accepted",
    title: `Your offer was accepted by ${business.companyName}`,
    body: `₹${offer.amount} for ${offer.equityRequested}%`,
    metadata: {
      offerId: offer.id,
      investmentId: result.investment.id,
      pitchId: offer.pitchId,
      businessId: business.id,
    },
    eventId: `offer_accepted:${offer.id}`,
  });

  await Promise.allSettled(
    result.siblings.map((s) =>
      createNotification({
        userId: s.investorId,
        type: "offer_rejected",
        title: `Your offer was not accepted`,
        body: `Another offer was accepted on this pitch`,
        metadata: { offerId: s.id, pitchId: offer.pitchId },
        eventId: `offer_auto_rejected:${s.id}`,
      })
    )
  );

  return { offer: result.accepted, investment: result.investment };
};

// ============================================================
// REJECT
// ============================================================

export const rejectOffer = async (offerId, userId) => {
  const offer = await db.query.offers.findFirst({
    where: eq(offers.id, offerId),
  });
  if (!offer) throw ApiError.notFound("Offer not found");

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, offer.businessId),
    columns: { ownerId: true },
  });
  if (!business || business.ownerId !== userId) {
    throw ApiError.forbidden("Only the business owner can reject this offer");
  }

  await assertNotExpired(offer);

  if (offer.status !== "pending") {
    throw ApiError.badRequest(`Cannot reject a ${offer.status} offer`);
  }

  const [updated] = await db
    .update(offers)
    .set({ status: "rejected", respondedAt: new Date() })
    .where(eq(offers.id, offerId))
    .returning();

  await createNotification({
    userId: offer.investorId,
    actorId: userId,
    type: "offer_rejected",
    title: "Your offer was rejected",
    metadata: { offerId: offer.id, pitchId: offer.pitchId },
    eventId: `offer_rejected:${offer.id}`,
  });

  return updated;
};

// ============================================================
// WITHDRAW
// ============================================================

export const withdrawOffer = async (offerId, userId) => {
  const offer = await db.query.offers.findFirst({
    where: eq(offers.id, offerId),
  });
  if (!offer) throw ApiError.notFound("Offer not found");

  if (offer.initiatedById !== userId || offer.investorId !== userId) {
    throw ApiError.forbidden("Only the investor who made this offer can withdraw it");
  }

  await assertNotExpired(offer);

  if (offer.status !== "pending") {
    throw ApiError.badRequest(`Cannot withdraw a ${offer.status} offer`);
  }

  const [updated] = await db
    .update(offers)
    .set({ status: "withdrawn", respondedAt: new Date() })
    .where(eq(offers.id, offerId))
    .returning();

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, offer.businessId),
    columns: { ownerId: true },
  });

  if (business) {
    await createNotification({
      userId: business.ownerId,
      actorId: userId,
      type: "offer_withdrawn",
      title: "An offer was withdrawn",
      metadata: { offerId: offer.id, pitchId: offer.pitchId },
      eventId: `offer_withdrawn:${offer.id}`,
    });
  }

  return updated;
};

// ============================================================
// READ
// ============================================================

export const getOffer = async (offerId, userId) => {
  const offer = await db.query.offers.findFirst({
    where: eq(offers.id, offerId),
  });
  if (!offer) throw ApiError.notFound("Offer not found");

  if (offer.investorId === userId) return offer;

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, offer.businessId),
    columns: { ownerId: true },
  });
  if (!business || business.ownerId !== userId) {
    throw ApiError.forbidden("You are not part of this offer");
  }

  return offer;
};

export const getMyOffers = async (investorId, { limit = 20, offset = 0 } = {}) => {
  const rows = await db
    .select({
      offer: offers,
      pitch: {
        id: pitches.id,
        title: pitches.title,
        stage: pitches.stage,
      },
      business: {
        id: businesses.id,
        companyName: businesses.companyName,
        sector: businesses.sector,
      },
    })
    .from(offers)
    .innerJoin(pitches, eq(pitches.id, offers.pitchId))
    .innerJoin(businesses, eq(businesses.id, offers.businessId))
    .where(eq(offers.investorId, investorId))
    .orderBy(desc(offers.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(offers)
    .where(eq(offers.investorId, investorId));

  return {
    offers: rows,
    pagination: { limit, offset, total: totalRow.count },
  };
};

export const getReceivedOffers = async (businessId, userId, { status, limit = 20, offset = 0 } = {}) => {
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
    columns: { ownerId: true },
  });
  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId !== userId) {
    throw ApiError.forbidden("You do not own this business");
  }

  const conditions = [eq(offers.businessId, businessId)];
  if (status) conditions.push(eq(offers.status, status));

  const rows = await db
    .select({
      offer: offers,
      investor: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
      pitch: {
        id: pitches.id,
        title: pitches.title,
        askAmount: pitches.askAmount,
        equityOffered: pitches.equityOffered,
      },
    })
    .from(offers)
    .innerJoin(users, eq(users.id, offers.investorId))
    .innerJoin(pitches, eq(pitches.id, offers.pitchId))
    .where(and(...conditions))
    .orderBy(desc(offers.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(offers)
    .where(and(...conditions));

  return {
    offers: rows,
    pagination: { limit, offset, total: totalRow.count },
  };
};

export const getOfferThread = async (anyOfferId, userId) => {
  let rootId = anyOfferId;
  for (let i = 0; i < OFFER_MAX_COUNTER_DEPTH + 2; i++) {
    const row = await db.query.offers.findFirst({
      where: eq(offers.id, rootId),
      columns: { parentOfferId: true },
    });
    if (!row?.parentOfferId) break;
    rootId = row.parentOfferId;
  }

  const chain = [];
  let currentId = rootId;
  while (currentId) {
    const offer = await db.query.offers.findFirst({
      where: eq(offers.id, currentId),
    });
    if (!offer) break;
    chain.push(offer);

    const next = await db.query.offers.findFirst({
      where: eq(offers.parentOfferId, currentId),
    });
    currentId = next?.id;
  }

  if (chain.length === 0) throw ApiError.notFound("Offer thread not found");

  const root = chain[0];
  if (root.investorId !== userId) {
    const business = await db.query.businesses.findFirst({
      where: eq(businesses.id, root.businessId),
      columns: { ownerId: true },
    });
    if (!business || business.ownerId !== userId) {
      throw ApiError.forbidden("You are not part of this offer thread");
    }
  }

  return chain;
};