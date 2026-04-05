import { z } from "zod";

export const addMemberSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
