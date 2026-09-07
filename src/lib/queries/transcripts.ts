import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { TranscriptSession } from "@/types/transcript";

const TRANSCRIPTS_COLLECTION = "transcripts";

/* ------------------------------------------------------------------ */
/*  Reading the consent question from the browser                      */
/*                                                                     */
/*  One document, by id, and nothing else. The room needs to know      */
/*  whether it is being asked, whether it agreed and whether it is     */
/*  being transcribed — and those three facts are the whole of what    */
/*  this returns.                                                      */
/*                                                                     */
/*  THE LINES ARE NOT HERE, and their absence is the design. A         */
/*  subcollection every participant subscribed to would be a live copy */
/*  of the meeting in every browser, growing by a document per         */
/*  sentence, and it would need a per-line rule to say who may read    */
/*  it. Instead the lines are server-only and the finished transcript  */
/*  comes back once, through `getTranscriptAction`, when somebody       */
/*  actually asks for it.                                              */
/* ------------------------------------------------------------------ */

/**
 * Follows one call's transcript session.
 *
 * Keyed by room rather than by call, because a direct call and a group
 * call keep their identity in different places and the room is the only
 * name both have.
 *
 * Reports `null` for a call nobody has asked about, which is the common
 * case and not an error — every client in every call holds this
 * subscription, and most of them will never see a document appear.
 */
export function subscribeToTranscriptSession(
  roomId: string,
  onChange: (session: TranscriptSession | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    doc(db, TRANSCRIPTS_COLLECTION, roomId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }
      onChange({ id: snapshot.id, ...snapshot.data() } as TranscriptSession);
    },
    (error) => {
      console.error("[Transcript] Subscription error:", error);
      onError?.(error);
      onChange(null);
    }
  );
}
