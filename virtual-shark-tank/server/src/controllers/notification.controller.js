import * as notificationService from "../services/notification.service.js";

export const list = async (req, res) => {
  const { type, unread, limit, offset } = req.query;
  const result = await notificationService.listNotifications(req.user.id, {
    type: type || undefined,
    unread: unread === "true" ? true : undefined,
    limit: Number(limit) || 20,
    offset: Number(offset) || 0,
  });
  res.json(result);
};

export const unreadCount = async (req, res) => {
  const result = await notificationService.getUnreadCount(req.user.id);
  res.json(result);
};

export const markRead = async (req, res) => {
  const updated = await notificationService.markRead(req.params.id, req.user.id);
  res.json({ notification: updated });
};

export const markAllRead = async (req, res) => {
  const result = await notificationService.markAllRead(req.user.id);
  res.json(result);
};

export const remove = async (req, res) => {
  const result = await notificationService.deleteNotification(
    req.params.id,
    req.user.id
  );
  res.json(result);
};