import { z } from "zod";
import { MAX_DISPLAY_NAME } from "@/lib/calls/display-name";

/* ------------------------------------------------------------------ */
/*  Call Validation                                                    */
/*                                                                     */
/*  Shapes only. Whether a room exists, whether the caller shares an   */
/*  org with the callee, and whether the plan allows any of it are     */
/*  decided in `lib/calls/access` against facts read on the server —   */
/*  a zod schema cannot know those and should not pretend to.          */
/* ------------------------------------------------------------------ */

/** Mirrors `isRoomId`, so the form refuses before the server has to. */
export const roomIdSchema = z
  .string()
  .regex(/^r_[0-9a-f]{24}$/, "That is not a valid room.");

/** A uid is opaque to us; only its shape is worth asserting. */
const uid = z.string().trim().min(1, "Required").max(128, "Not a valid user.");

export const startCallSchema = z.object({
  targetUid: uid,
});

export const callIdSchema = z.string().trim().min(1).max(128);

/**
 * Every group-call action takes the thread and nothing else.
 *
 * Not the room id, deliberately. The room a group call runs in is read
 * off the conversation on the server — a client that could name its own
 * room could ask for a pass to one it merely knew the id of, and a room
 * id is a capability precisely because it travels.
 */
export const groupCallSchema = z.object({
  conversationId: z.string().trim().min(1, "Required").max(1_500),
});

/**
 * The walk-in name field.
 *
 * Deliberately permissive here and cleaned properly in
 * `lib/calls/display-name` — a person with no account gets one field and
 * one chance, so this rejects only what is obviously not a name and
 * leaves the sanitizing to the module that owns it.
 */
export const walkInSchema = z.object({
  roomId: roomIdSchema,
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(MAX_DISPLAY_NAME, "That name is too long."),
});

export type StartCallSchema = z.infer<typeof startCallSchema>;
export type GroupCallSchema = z.infer<typeof groupCallSchema>;
export type WalkInSchema = z.infer<typeof walkInSchema>;
