import * as verificationService from "../services/verification.service.js";

export const create = async (req, res) => {
  const verification = await verificationService.createVerification({
    userId: req.user.id,
    ...req.body,
  });
  res.status(201).json({ verification });
};

export const listMine = async (req, res) => {
  const verifications = await verificationService.listMyVerifications(
    req.user.id,
    req.query
  );
  res.json({ verifications });
};

export const getOne = async (req, res) => {
  const verification = await verificationService.getVerification(
    req.params.id,
    req.user.id
  );
  res.json({ verification });
};

export const apply = async (req, res) => {
  const result = await verificationService.applyToBusinessProfile(
    req.params.id,
    req.user.id,
    req.body.confirmedFields
  );
  res.json(result);
};