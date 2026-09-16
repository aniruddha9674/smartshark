import { z } from "zod";

// Start or get a conversation with another user
export const startConversationSchema = z.object({
  userId: z.string().uuid("Must be a valid user ID"),
});

// Send a message
export const sendMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(5000, "Message too long"),
});

// List messages in a thread — supports incremental polling via `since`
export const listMessagesQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// List conversations
export const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});