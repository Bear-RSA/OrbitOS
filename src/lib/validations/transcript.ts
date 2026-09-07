import { z } from "zod";
import { roomIdSchema } from "@/lib/validations/call";
import { HARD_MAX_LINES_PER_FLUSH } from "@/lib/transcripts/ceiling";

/* ------------------------------------------------------------------ */
/*  Transcript validation                                              */
/*                                                                     */
/*  Shapes only, the same bargain `validations/call` makes. Whether    */
/*  the caller is in this call, whether the room has agreed, and       */
/*  whether the plan allows a transcript at all are decided on the     */
/*  server against documents — a zod schema cannot know any of that.   */
/*                                                                     */
/*  Note what is NOT here: no uid, and no speaker name. A line is      */
/*  attributed to whoever the session cookie says sent it. A client    */
/*  that could name its own speaker could put words in a colleague's   */
/*  mouth, in a record the workspace keeps.                            */
/* ------------------------------------------------------------------ */

export const transcriptRequestSchema = z.object({
  roomId: roomIdSchema,
  callKind: z.enum(["direct", "group"]),
  /** One of these is required, decided by `callKind` on the server. */
  callId: z.string().trim().min(1).max(128).optional(),
  conversationId: z.string().trim().min(1).max(1_500).optional(),
  title: z.string().trim().min(1, "Required").max(120),
});

export const transcriptDecisionSchema = z.object({
  roomId: roomIdSchema,
  decision: z.enum(["accepted", "declined"]),
});

export const transcriptRoomSchema = z.object({
  roomId: roomIdSchema,
});

/**
 * One flush.
 *
 * Capped at the batch size rather than merely validated against it, so a
 * client that has fallen behind cannot catch up by sending a thousand
 * lines in one write. `at` is the speaker's own clock: it only ever
 * orders lines relative to the others, so a skewed clock costs accuracy
 * in one transcript rather than correctness anywhere.
 */
export const transcriptLinesSchema = z.object({
  roomId: roomIdSchema,
  lines: z
    .array(
      z.object({
        seq: z.number().int().min(0).max(1_000_000),
        at: z.number().int().min(0),
        /* Generous here and trimmed properly in `cleanLineText`, which
           owns the stored length. */
        text: z.string().min(1).max(4_000),
      })
    )
    .min(1)
    .max(HARD_MAX_LINES_PER_FLUSH),
});

export const transcriptFilingSchema = z.object({
  roomId: roomIdSchema,
  documentId: z.string().trim().min(1).max(128),
});

export type TranscriptRequestSchema = z.infer<typeof transcriptRequestSchema>;
export type TranscriptDecisionSchema = z.infer<typeof transcriptDecisionSchema>;
export type TranscriptLinesSchema = z.infer<typeof transcriptLinesSchema>;
