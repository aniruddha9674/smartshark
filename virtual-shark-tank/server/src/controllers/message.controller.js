import * as messageService from "../services/message.service.js";

// GET /api/conversations/:id/messages
export const list = async (req, res) => {
  const result = await messageService.listMessages(
    req.params.id,
    req.user.id,
    {
      since: req.query.since,
      limit: req.query.limit,
      offset: req.query.offset,
    }
  );
  res.json(result);
};

// POST /api/conversations/:id/messages
export const send = async (req, res) => {
  const message = await messageService.sendMessage(
    req.params.id,
    req.user.id,
    req.body.body
  );
  res.status(201).json({ message });
};

// POST /api/conversations/:id/read
export const markRead = async (req, res) => {
  const result = await messageService.markConversationRead(
    req.params.id,
    req.user.id
  );
  res.json(result);
};