// client/src/schemas/auth.ts
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  role: z.enum(["business", "investor"]),
});

export type RegisterData = z.infer<typeof registerSchema>;