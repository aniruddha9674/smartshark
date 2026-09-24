import * as offerService from "../services/offer.service.js";

export const create = async (req, res) => {
  const offer = await offerService.createOffer(req.user.id, req.body);
  res.status(201).json({ offer });
};

export const counter = async (req, res) => {
  const offer = await offerService.counterOffer(req.params.id, req.user.id, req.body);
  res.status(201).json({ offer });
};

export const accept = async (req, res) => {
  const result = await offerService.acceptOffer(req.params.id, req.user.id);
  res.json(result);
};

export const reject = async (req, res) => {
  const offer = await offerService.rejectOffer(req.params.id, req.user.id);
  res.json({ offer });
};

export const withdraw = async (req, res) => {
  const offer = await offerService.withdrawOffer(req.params.id, req.user.id);
  res.json({ offer });
};

export const getOne = async (req, res) => {
  const offer = await offerService.getOffer(req.params.id, req.user.id);
  res.json({ offer });
};

export const getMine = async (req, res) => {
  const result = await offerService.getMyOffers(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json(result);
};

export const getReceived = async (req, res) => {
  const { businessId, status, limit, offset } = req.query;
  if (!businessId) {
    return res.status(400).json({ error: "businessId query param required" });
  }
  const result = await offerService.getReceivedOffers(businessId, req.user.id, {
    status,
    limit,
    offset,
  });
  res.json(result);
};

export const getThread = async (req, res) => {
  const thread = await offerService.getOfferThread(req.params.id, req.user.id);
  res.json({ thread });
};