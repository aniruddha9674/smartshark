const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const validateUuidParams = (...names) => (req, res, next) => {
  for (const name of names) {
    const value = req.params[name] ?? "";
    if (!UUID_RE.test(value)) {
      return res.status(400).json({ error: `Invalid ${name}` });
    }
  }
  next();
};