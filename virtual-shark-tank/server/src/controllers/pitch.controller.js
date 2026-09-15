import * as pitchService from "../services/pitch.service.js";

// POST /api/pitches — business creates a draft
export const create = async (req, res) => {
  const pitch = await pitchService.createPitch(req.user.id, req.body);
  res.status(201).json({ pitch });
};

// GET /api/pitches/me — business lists own pitches
export const listMine = async (req, res) => {
  const pitches = await pitchService.getMyPitches(req.user.id);
  res.json({ pitches });
};

// GET /api/pitches/:id — owner or anyone (if live)
export const getOne = async (req, res) => {
  const pitch = await pitchService.getPitch(req.params.id, req.user.id);
  res.json({ pitch });
};

// PATCH /api/pitches/:id — owner, draft only
export const update = async (req, res) => {
  const pitch = await pitchService.updatePitch(
    req.params.id,
    req.user.id,
    req.body
  );
  res.json({ pitch });
};

// POST /api/pitches/:id/publish
export const publish = async (req, res) => {
  const pitch = await pitchService.publishPitch(req.params.id, req.user.id);
  res.json({ pitch });
};

// POST /api/pitches/:id/close
export const close = async (req, res) => {
  const pitch = await pitchService.closePitch(req.params.id, req.user.id);
  res.json({ pitch });
};

// DELETE /api/pitches/:id
export const remove = async (req, res) => {
  const result = await pitchService.deletePitch(req.params.id, req.user.id);
  res.json(result);
};

// GET /api/pitches — investor browse (live only, with filters)
export const listLive = async (req, res) => {
  const { stage, revenueRange, limit, offset } = req.query;
  const pitches = await pitchService.listLivePitches({
    stage,
    revenueRange,
    limit,
    offset,
  });
  res.json({ pitches });
};