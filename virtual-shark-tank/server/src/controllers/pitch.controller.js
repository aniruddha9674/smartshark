import { inArray, eq } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { pitches, businesses } from "../models/postgres/index.js";
import * as pitchService from "../services/pitch.service.js";
import * as eventService from "../services/event.service.js";

// ---------- CREATE ----------
export const create = async (req, res) => {
  const { businessId, ...rest } = req.body;
  const pitch = await pitchService.createPitch(businessId, req.user.id, rest);
  res.status(201).json({ pitch });
};

// ---------- LIST MINE ----------
export const listMine = async (req, res) => {
  const { businessId } = req.query;
  if (!businessId) {
    return res.status(400).json({ error: "businessId query param required" });
  }
  const pitchList = await pitchService.getMyPitches(businessId, req.user.id);
  res.json({ pitches: pitchList });
};

// ---------- GET ONE ----------
export const getOne = async (req, res) => {
  const pitch = await pitchService.getPitch(req.params.id, req.user.id);
  res.json({ pitch });
};

// ---------- UPDATE ----------
export const update = async (req, res) => {
  const pitch = await pitchService.updatePitch(
    req.params.id,
    req.user.id,
    req.body
  );
  res.json({ pitch });
};

// ---------- PUBLISH ----------
export const publish = async (req, res) => {
  const pitch = await pitchService.publishPitch(req.params.id, req.user.id);
  res.json({ pitch });
};

// ---------- CLOSE ----------
export const close = async (req, res) => {
  const pitch = await pitchService.closePitch(req.params.id, req.user.id);
  res.json({ pitch });
};

// ---------- DELETE ----------
export const remove = async (req, res) => {
  const result = await pitchService.deletePitch(req.params.id, req.user.id);
  res.json(result);
};

// ---------- LIST LIVE ----------
export const listLive = async (req, res) => {
  const { stage, revenueRange, businessId, limit, offset } = req.query;
  const pitchList = await pitchService.listLivePitches({
    stage,
    revenueRange,
    businessId,
    limit,
    offset,
  });
  res.json({ pitches: pitchList });
};

// ---------- RECENTLY VIEWED ----------
export const getRecentlyViewed = async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const pitchIds = await eventService.getRecentlyViewedPitches(
    req.user.id,
    limit
  );

  if (!pitchIds.length) {
    return res.json({ pitches: [] });
  }

  const rows = await db
    .select({
      pitch: {
        id: pitches.id,
        title: pitches.title,
        tagline: pitches.tagline,
        askAmount: pitches.askAmount,
        equityOffered: pitches.equityOffered,
        status: pitches.status,
      },
      business: {
        id: businesses.id,
        companyName: businesses.companyName,
        sector: businesses.sector,
        city: businesses.city,
      },
    })
    .from(pitches)
    .innerJoin(businesses, eq(businesses.id, pitches.businessId))
    .where(inArray(pitches.id, pitchIds));

  const map = new Map(rows.map((r) => [r.pitch.id, r]));
  const ordered = pitchIds.map((id) => map.get(id)).filter(Boolean);

  res.json({ pitches: ordered });
};