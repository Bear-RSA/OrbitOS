import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Message Validation                                                 */
/*                                                                     */
/*  Shapes only, the same split `lib/validations/call` makes. Whether  */
/*  the people named share an org, and whether the caller may post in  */
/*  the thread, are decided in `lib/messages/access` against facts     */
/*  read on the server — a zod schema cannot know those.               */
/* ------------------------------------------------------------------ */

/**
 * How long one message may be.
 *
 * Generous enough for a paragraph of brief, short enough that a pasted
 * document is refused at the field rather than becoming a row every
 * participant's listener has to download for the rest of the thread's
 * life.
 */
export const MAX_MESSAGE_LENGTH = 4_000;

export const MAX_GROUP_NAME_LENGTH = 60;

/**
 * Bodies in one group.
 *
 * Not a tier limit and not a cost ceiling — messages bill nothing per
 * head. It bounds the `participantIds` array, which is read by every
 * rule evaluation on the document and denormalized into
 * `participantNames`, so an unbounded list would make every read of the
 * thread heavier for everyone in it.
 */
export const MAX_GROUP_PARTICIPANTS = 50;

/**
 * How much of a message is copied onto the conversation for the left
 * rail. Long enough to recognise the thread, short enough that the
 * preview never becomes a second copy of the message.
 */
export const MESSAGE_PREVIEW_LENGTH = 140;

/** A uid is opaque to us; only its shape is worth asserting. */
const uid = z.string().trim().min(1, "Required").max(128, "Not a valid user.");

export const conversationIdSchema = z.string().trim().min(1).max(1_500);

export const messageTextSchema = z
  .string()
  .trim()
  .min(1, "Write something first.")
  .max(MAX_MESSAGE_LENGTH, "That message is too long.");

export const openDmSchema = z.object({
  targetUid: uid,
});

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the group a name.")
    .max(MAX_GROUP_NAME_LENGTH, "That name is too long."),
  /* The creator is added by the action from the session, never sent —
     so this is the list of OTHER people and the bound is one short. */
  participantUids: z
    .array(uid)
    .min(1, "Choose at least one other person.")
    .max(MAX_GROUP_PARTICIPANTS - 1, "That is too many people for one group."),
});

/**
 * How much may ride along with a forwarded task.
 *
 * Shorter than a message on purpose. The card carries the substance;
 * this is the sentence that says why it landed in your thread, and a
 * field that invites a paragraph turns the card into a footnote.
 */
export const MAX_FORWARD_NOTE_LENGTH = 500;

export const forwardTaskSchema = z.object({
  taskId: z.string().trim().min(1, "Required").max(128, "Not a valid task."),
  conversationId: conversationIdSchema,
  /* Optional, and that is the point: the card already says what it is,
     so forwarding with nothing to add must not be a validation error. */
  note: z
    .string()
    .trim()
    .max(MAX_FORWARD_NOTE_LENGTH, "That note is too long.")
    .optional()
    .default(""),
});

export const sendMessageSchema = z.object({
  conversationId: conversationIdSchema,
  text: messageTextSchema,
});

export type OpenDmInput = z.infer<typeof openDmSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ForwardTaskInput = z.infer<typeof forwardTaskSchema>;

/** Trims a message down to what the left rail shows. */
export function messagePreview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= MESSAGE_PREVIEW_LENGTH
    ? flat
    : `${flat.slice(0, MESSAGE_PREVIEW_LENGTH - 1)}…`;
}
