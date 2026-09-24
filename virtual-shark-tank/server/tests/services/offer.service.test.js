import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businesses,
  pitches,
  offers,
  investments,
  conversations,
  notifications,
} from "../../src/models/postgres/index.js";
import * as offerService from "../../src/services/offer.service.js";
import { _resetAll as resetRateLimits } from "../../src/services/rateLimit.service.js";
import { ApiError } from "../../src/utils/apiError.js";
import { MAX_OFFERS_PER_DAY } from "../../src/validators/offer.validator.js";

// ============================================================
// HELPERS
// ============================================================

const createUser = async (overrides = {}) => {
  const [user] = await db
    .insert(users)
    .values({
      name: `User ${Math.random().toString(36).slice(2, 7)}`,
      email: `u-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "$2b$12$fake",
      ...overrides,
    })
    .returning();
  return user;
};

const createBusinessFor = async (ownerId, overrides = {}) => {
  const [biz] = await db
    .insert(businesses)
    .values({
      ownerId,
      companyName: `Biz ${Math.random().toString(36).slice(2, 7)}`,
      isProfileComplete: true,
      ...overrides,
    })
    .returning();
  return biz;
};

const createLivePitch = async (businessId, overrides = {}) => {
  const [pitch] = await db
    .insert(pitches)
    .values({
      businessId,
      title: "Seed Round",
      tagline: "Invest",
      shortPitch: "We do X",
      longSummary: "Long form",
      askAmount: "5000000",
      equityOffered: "8",
      valuation: "62500000.00",
      stage: "mvp",
      revenueRange: "under_10L",
      status: "live",
      publishedAt: new Date(),
      ...overrides,
    })
    .returning();
  return pitch;
};

const createDraftPitch = async (businessId) => {
  return createLivePitch(businessId, { status: "draft", publishedAt: null });
};

// Full setup: investor + business owner + business + live pitch
const setup = async () => {
  const investor = await createUser();
  const owner = await createUser();
  const business = await createBusinessFor(owner.id);
  const pitch = await createLivePitch(business.id);
  return { investor, owner, business, pitch };
};

const validOfferData = (pitchId, overrides = {}) => ({
  pitchId,
  amount: 5000000,
  equityRequested: 8,
  ...overrides,
});

// ============================================================
// TESTS
// ============================================================

describe("offer.service", () => {
  beforeEach(async () => {
  await db.delete(investments);   // must go first — RESTRICT on users
  await db.delete(users);          // cascades to everything else
  resetRateLimits();
});

  // ----------------------------------------------------------
  // createOffer
  // ----------------------------------------------------------
  describe("createOffer", () => {
    it("creates a pending offer on a live pitch", async () => {
      const { investor, pitch, business } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      expect(offer.status).toBe("pending");
      expect(offer.investorId).toBe(investor.id);
      expect(offer.businessId).toBe(business.id);
      expect(offer.initiatedById).toBe(investor.id);
      expect(offer.parentOfferId).toBeNull();
    });

    it("computes valuation from amount and equity", async () => {
      const { investor, pitch } = await setup();
      const offer = await offerService.createOffer(
        investor.id,
        validOfferData(pitch.id, { amount: 5000000, equityRequested: 8 })
      );
      // 5,000,000 / 0.08 = 62,500,000
      expect(offer.valuation).toBe("62500000.00");
    });

    it("sets expiresAt ~7 days ahead by default", async () => {
      const { investor, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      const days = (new Date(offer.expiresAt) - Date.now()) / (1000 * 60 * 60 * 24);
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
    });

    it("respects a custom expiresInDays", async () => {
      const { investor, pitch } = await setup();
      const offer = await offerService.createOffer(
        investor.id,
        validOfferData(pitch.id, { expiresInDays: 14 })
      );
      const days = (new Date(offer.expiresAt) - Date.now()) / (1000 * 60 * 60 * 24);
      expect(days).toBeGreaterThan(13.9);
      expect(days).toBeLessThan(14.1);
    });

    it("rejects an offer on a draft pitch", async () => {
      const owner = await createUser();
      const business = await createBusinessFor(owner.id);
      const draft = await createDraftPitch(business.id);
      const investor = await createUser();

      await expect(
        offerService.createOffer(investor.id, validOfferData(draft.id))
      ).rejects.toThrow(ApiError);
    });

    it("rejects an offer on a closed pitch", async () => {
      const { investor, business } = await setup();
      const closed = await createLivePitch(business.id, { status: "closed" });

      await expect(
        offerService.createOffer(investor.id, validOfferData(closed.id))
      ).rejects.toThrow(ApiError);
    });

    it("rejects an offer on a nonexistent pitch", async () => {
      const investor = await createUser();
      const fake = "00000000-0000-0000-0000-000000000000";

      await expect(
        offerService.createOffer(investor.id, validOfferData(fake))
      ).rejects.toThrow(ApiError);
    });

    it("rejects an offer from the business owner on their own pitch", async () => {
      const { owner, pitch } = await setup();

      await expect(
        offerService.createOffer(owner.id, validOfferData(pitch.id))
      ).rejects.toThrow(ApiError);
    });

    it("rejects a second pending offer by the same investor on the same pitch", async () => {
      const { investor, pitch } = await setup();
      await offerService.createOffer(investor.id, validOfferData(pitch.id));

      await expect(
        offerService.createOffer(investor.id, validOfferData(pitch.id))
      ).rejects.toThrow(ApiError);
    });

    it("allows a new offer after the previous one was rejected", async () => {
      const { investor, owner, pitch } = await setup();
      const first = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.rejectOffer(first.id, owner.id);

      // Should succeed — old one is terminal, not pending
      const second = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      expect(second.id).not.toBe(first.id);
    });

    it("allows two different investors to make offers on the same pitch", async () => {
      const { pitch } = await setup();
      const i1 = await createUser();
      const i2 = await createUser();

      await offerService.createOffer(i1.id, validOfferData(pitch.id));
      await offerService.createOffer(i2.id, validOfferData(pitch.id));

      const all = await db.select().from(offers);
      expect(all.length).toBe(2);
    });

    it("creates a notification for the business owner", async () => {
      const { investor, owner, pitch } = await setup();
      await offerService.createOffer(investor.id, validOfferData(pitch.id));

      const notifs = await db.select().from(notifications);
      const toOwner = notifs.filter((n) => n.userId === owner.id && n.type === "new_offer");
      expect(toOwner.length).toBe(1);
    });

    it("enforces the daily rate limit", async () => {
      const { pitch } = await setup();
      const investor = await createUser();

      // Saturation: 20 in one day
      const { enforceLimit } = await import("../../src/services/rateLimit.service.js");
      for (let i = 0; i < MAX_OFFERS_PER_DAY; i++) {
        enforceLimit(investor.id, "create_offer", MAX_OFFERS_PER_DAY);
      }

      await expect(
        offerService.createOffer(investor.id, validOfferData(pitch.id))
      ).rejects.toThrow(ApiError);
    });
  });

  // ----------------------------------------------------------
  // counterOffer
  // ----------------------------------------------------------
  describe("counterOffer", () => {
    it("business owner can counter an investor's offer", async () => {
      const { investor, owner, pitch } = await setup();
      const original = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      const counter = await offerService.counterOffer(original.id, owner.id, {
        amount: 6000000,
        equityRequested: 10,
      });

      expect(counter.initiatedById).toBe(owner.id);
      expect(counter.parentOfferId).toBe(original.id);
      expect(counter.status).toBe("pending");
    });

    it("marks the parent as countered", async () => {
      const { investor, owner, pitch } = await setup();
      const original = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.counterOffer(original.id, owner.id, {
        amount: 6000000,
        equityRequested: 10,
      });

      const [parent] = await db.select().from(offers).where(eq(offers.id, original.id));
      expect(parent.status).toBe("countered");
    });

    it("investor can counter the business owner's counter — alternation", async () => {
      const { investor, owner, pitch } = await setup();
      const o1 = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      const o2 = await offerService.counterOffer(o1.id, owner.id, {
        amount: 6000000,
        equityRequested: 10,
      });
      const o3 = await offerService.counterOffer(o2.id, investor.id, {
        amount: 5500000,
        equityRequested: 9,
      });

      expect(o3.initiatedById).toBe(investor.id);
      expect(o3.parentOfferId).toBe(o2.id);
    });

    it("rejects a counter from the same party who made the current offer", async () => {
      const { investor, owner, pitch } = await setup();
      const original = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      // Investor tries to counter their own offer
      await expect(
        offerService.counterOffer(original.id, investor.id, {
          amount: 6000000,
          equityRequested: 10,
        })
      ).rejects.toThrow(ApiError);
    });

    it("rejects a counter from a non-participant", async () => {
      const { investor, pitch } = await setup();
      const outsider = await createUser();
      const original = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      await expect(
        offerService.counterOffer(original.id, outsider.id, {
          amount: 6000000,
          equityRequested: 10,
        })
      ).rejects.toThrow(ApiError);
    });

    it("rejects countering a non-pending offer", async () => {
      const { investor, owner, pitch } = await setup();
      const original = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.rejectOffer(original.id, owner.id);

      await expect(
        offerService.counterOffer(original.id, owner.id, {
          amount: 6000000,
          equityRequested: 10,
        })
      ).rejects.toThrow(ApiError);
    });

    it("notifies the other party", async () => {
      const { investor, pitch } = await setup();
      const original = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      // Owner counters → investor should be notified
      const owner = await db.query.businesses.findFirst({
        where: eq(businesses.id, original.businessId),
        columns: { ownerId: true },
      });

      await offerService.counterOffer(original.id, owner.ownerId, {
        amount: 6000000,
        equityRequested: 10,
      });

      const notifs = await db.select().from(notifications);
      const toInvestor = notifs.filter(
        (n) => n.userId === investor.id && n.type === "offer_countered"
      );
      expect(toInvestor.length).toBe(1);
    });
  });

  // ----------------------------------------------------------
  // acceptOffer — the atomic transaction
  // ----------------------------------------------------------
  describe("acceptOffer", () => {
    it("accepts a pending offer and creates an investment", async () => {
      const { investor, owner, business, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      const result = await offerService.acceptOffer(offer.id, owner.id);

      expect(result.offer.status).toBe("accepted");
      expect(result.investment).toBeDefined();
      expect(result.investment.investorId).toBe(investor.id);
      expect(result.investment.businessId).toBe(business.id);
      expect(result.investment.pitchId).toBe(pitch.id);
      expect(result.investment.amount).toBe("5000000");
      expect(result.investment.equity).toBe("8");
    });

    it("funds the pitch", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.acceptOffer(offer.id, owner.id);

      const [updated] = await db.select().from(pitches).where(eq(pitches.id, pitch.id));
      expect(updated.status).toBe("funded");
      expect(updated.closedAt).toBeDefined();
    });

    it("auto-rejects sibling pending offers on the same pitch", async () => {
      const { investor, owner, pitch } = await setup();
      const otherInvestor = await createUser();

      const winner = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      const loser = await offerService.createOffer(
        otherInvestor.id,
        validOfferData(pitch.id)
      );

      await offerService.acceptOffer(winner.id, owner.id);

      const [loserRow] = await db.select().from(offers).where(eq(offers.id, loser.id));
      expect(loserRow.status).toBe("rejected");
    });

    it("creates a conversation between investor and business owner", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.acceptOffer(offer.id, owner.id);

      const convos = await db.select().from(conversations);
      expect(convos.length).toBe(1);

      const { participantAId, participantBId } = convos[0];
      const ids = [participantAId, participantBId].sort();
      expect(ids).toEqual([investor.id, owner.id].sort());
    });

    it("notifies the accepted investor", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.acceptOffer(offer.id, owner.id);

      const notifs = await db.select().from(notifications);
      const toInvestor = notifs.filter(
        (n) => n.userId === investor.id && n.type === "offer_accepted"
      );
      expect(toInvestor.length).toBe(1);
    });

    it("notifies rejected sibling bidders", async () => {
      const { investor, owner, pitch } = await setup();
      const otherInvestor = await createUser();

      const winner = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.createOffer(otherInvestor.id, validOfferData(pitch.id));

      await offerService.acceptOffer(winner.id, owner.id);

      const notifs = await db.select().from(notifications);
      const toLoser = notifs.filter(
        (n) => n.userId === otherInvestor.id && n.type === "offer_rejected"
      );
      expect(toLoser.length).toBe(1);
    });

    it("rejects accept from non-owner", async () => {
      const { investor, pitch } = await setup();
      const attacker = await createUser();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      await expect(offerService.acceptOffer(offer.id, attacker.id)).rejects.toThrow(ApiError);
    });

    it("rejects accept from the investor who made it", async () => {
      const { investor, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      await expect(offerService.acceptOffer(offer.id, investor.id)).rejects.toThrow(ApiError);
    });

    it("rejects accepting an offer on a non-live pitch", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      // Business closes the pitch before accepting
      await db.update(pitches).set({ status: "closed" }).where(eq(pitches.id, pitch.id));

      await expect(offerService.acceptOffer(offer.id, owner.id)).rejects.toThrow(ApiError);
    });

    it("rejects accepting an already-terminal offer", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.rejectOffer(offer.id, owner.id);

      await expect(offerService.acceptOffer(offer.id, owner.id)).rejects.toThrow(ApiError);
    });
  });

  // ----------------------------------------------------------
  // rejectOffer
  // ----------------------------------------------------------
  describe("rejectOffer", () => {
    it("owner can reject a pending offer", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      const rejected = await offerService.rejectOffer(offer.id, owner.id);
      expect(rejected.status).toBe("rejected");
      expect(rejected.respondedAt).toBeDefined();
    });

    it("notifies the investor", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.rejectOffer(offer.id, owner.id);

      const notifs = await db.select().from(notifications);
      const toInvestor = notifs.filter(
        (n) => n.userId === investor.id && n.type === "offer_rejected"
      );
      expect(toInvestor.length).toBe(1);
    });

    it("rejects a non-owner", async () => {
      const { investor, pitch } = await setup();
      const attacker = await createUser();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      await expect(offerService.rejectOffer(offer.id, attacker.id)).rejects.toThrow(ApiError);
    });

    it("rejects a non-pending offer", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.rejectOffer(offer.id, owner.id);

      await expect(offerService.rejectOffer(offer.id, owner.id)).rejects.toThrow(ApiError);
    });
  });

  // ----------------------------------------------------------
  // withdrawOffer
  // ----------------------------------------------------------
  describe("withdrawOffer", () => {
    it("investor can withdraw their pending offer", async () => {
      const { investor, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      const withdrawn = await offerService.withdrawOffer(offer.id, investor.id);
      expect(withdrawn.status).toBe("withdrawn");
    });

    it("notifies the business owner", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.withdrawOffer(offer.id, investor.id);

      const notifs = await db.select().from(notifications);
      const toOwner = notifs.filter(
        (n) => n.userId === owner.id && n.type === "offer_withdrawn"
      );
      expect(toOwner.length).toBe(1);
    });

    it("rejects withdraw from the business owner", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      await expect(offerService.withdrawOffer(offer.id, owner.id)).rejects.toThrow(ApiError);
    });

    it("rejects withdrawing a non-pending offer", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.rejectOffer(offer.id, owner.id);

      await expect(offerService.withdrawOffer(offer.id, investor.id)).rejects.toThrow(ApiError);
    });
  });

  // ----------------------------------------------------------
  // Lazy expiry
  // ----------------------------------------------------------
  describe("lazy expiry", () => {
    it("marks an expired offer and rejects the action", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      // Force-expire
      await db
        .update(offers)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(offers.id, offer.id));

      await expect(offerService.acceptOffer(offer.id, owner.id)).rejects.toThrow(ApiError);

      const [row] = await db.select().from(offers).where(eq(offers.id, offer.id));
      expect(row.status).toBe("expired");
    });

    it("expired offer cannot be countered", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await db
        .update(offers)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(offers.id, offer.id));

      await expect(
        offerService.counterOffer(offer.id, owner.id, {
          amount: 6000000,
          equityRequested: 10,
        })
      ).rejects.toThrow(ApiError);
    });
  });

  // ----------------------------------------------------------
  // Read functions
  // ----------------------------------------------------------
  describe("getOffer", () => {
    it("investor can fetch their own offer", async () => {
      const { investor, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      const fetched = await offerService.getOffer(offer.id, investor.id);
      expect(fetched.id).toBe(offer.id);
    });

    it("business owner can fetch an offer on their business", async () => {
      const { investor, owner, pitch } = await setup();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      const fetched = await offerService.getOffer(offer.id, owner.id);
      expect(fetched.id).toBe(offer.id);
    });

    it("outsider cannot fetch", async () => {
      const { investor, pitch } = await setup();
      const outsider = await createUser();
      const offer = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      await expect(offerService.getOffer(offer.id, outsider.id)).rejects.toThrow(ApiError);
    });
  });

  describe("getMyOffers", () => {
    it("returns only offers I made", async () => {
      const { investor, pitch } = await setup();
      const otherInvestor = await createUser();
      await offerService.createOffer(investor.id, validOfferData(pitch.id));
      await offerService.createOffer(otherInvestor.id, validOfferData(pitch.id));

      const result = await offerService.getMyOffers(investor.id);
      expect(result.offers.length).toBe(1);
      expect(result.offers[0].offer.investorId).toBe(investor.id);
    });

    it("empty when I made none", async () => {
      const investor = await createUser();
      const result = await offerService.getMyOffers(investor.id);
      expect(result.offers).toEqual([]);
    });
  });

  describe("getReceivedOffers", () => {
    it("owner sees offers on their business", async () => {
      const { investor, owner, business, pitch } = await setup();
      await offerService.createOffer(investor.id, validOfferData(pitch.id));

      const result = await offerService.getReceivedOffers(business.id, owner.id);
      expect(result.offers.length).toBe(1);
    });

    it("rejects a non-owner", async () => {
      const { business } = await setup();
      const attacker = await createUser();

      await expect(
        offerService.getReceivedOffers(business.id, attacker.id)
      ).rejects.toThrow(ApiError);
    });
  });

  describe("getOfferThread", () => {
    it("returns the full counter chain in order", async () => {
      const { investor, owner, pitch } = await setup();
      const o1 = await offerService.createOffer(investor.id, validOfferData(pitch.id));
      const o2 = await offerService.counterOffer(o1.id, owner.id, {
        amount: 6000000,
        equityRequested: 10,
      });
      const o3 = await offerService.counterOffer(o2.id, investor.id, {
        amount: 5500000,
        equityRequested: 9,
      });

      const thread = await offerService.getOfferThread(o3.id, investor.id);
      expect(thread.length).toBe(3);
      expect(thread[0].id).toBe(o1.id);
      expect(thread[1].id).toBe(o2.id);
      expect(thread[2].id).toBe(o3.id);
    });

    it("rejects an outsider", async () => {
      const { investor, pitch } = await setup();
      const outsider = await createUser();
      const o1 = await offerService.createOffer(investor.id, validOfferData(pitch.id));

      await expect(offerService.getOfferThread(o1.id, outsider.id)).rejects.toThrow(ApiError);
    });
  });
});