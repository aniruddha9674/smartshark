import * as conversationService from "../services/conversation.service.js";

// POST /api/conversations
export const start = async (req, res) => {
  const { conversation, created } = await conversationService.getOrCreateConversation(
    req.user.id,
    req.body.userId
  );
  res.status(created ? 201 : 200).json({ conversation });
};

// GET /api/conversations
export const list = async (req, res) => {
  const result = await conversationService.listConversations(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json(result);
};

// GET /api/conversations/:id
export const getOne = async (req, res) => {
  const conversation = await conversationService.getConversation(
    req.params.id,
    req.user.id
  );
  res.json({ conversation });
};

// GET /api/conversations/unread-count
export const getUnread = async (req, res) => {
  const result = await conversationService.getTotalUnread(req.user.id);
  res.json(result);
};