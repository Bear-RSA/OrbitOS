import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Notification Validation                                            */
/*                                                                     */
/*  Shapes only, the same split `lib/validations/call` makes. Whether  */
/*  a token belongs to the caller is decided in                        */
/*  `actions/notifications` against the session cookie — a zod schema  */
/*  cannot know that and should not pretend to.                        */
/* ------------------------------------------------------------------ */

/**
 * An FCM registration token.
 *
 * Opaque to us, so only its shape is worth asserting — but the bounds
 * are not decoration. This string is hashed into a document id and
 * stored, so an unbounded field is an unbounded write, and a blank one
 * would register a row that can never be rung.
 */
export const pushTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, "That is not a device token.")
    .max(4_096, "That device token is too long."),
});

export type PushTokenInput = z.infer<typeof pushTokenSchema>;
