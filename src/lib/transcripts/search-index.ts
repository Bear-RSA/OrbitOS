import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { HARD_MAX_LINES_PER_SESSION } from "./ceiling";
import { termsOf } from "./search";

/* ------------------------------------------------------------------ */
/*  Transcript search index                                            */
/*                                                                     */
/*  Two documents per finished transcript, both server-only (the       */
/*  catch-all deny in firestore.rules covers them):                    */
/*                                                                     */
/*    transcript_search/{roomId}  who may read it, when, and its word  */
/*                                list. Small, read on every search.   */
/*    transcript_text/{roomId}    the lines, compacted. Read only for  */
/*                                transcripts the word list matched.   */
/*                                                                     */
/*  Readers are everyone who was asked to consent, which is the same   */
/*  rule `getTranscriptAction` applies. A search can never surface a   */
/*  line its caller could not already open.                            */
/* ------------------------------------------------------------------ */

export const SEARCH_COLLECTION = "transcript_search";
export const TEXT_COLLECTION = "transcript_text";

/**
 * Characters of text kept for search. A Firestore document tops out at
 * 1 MiB; a transcript at its line ceiling could pass that, so the tail
 * past this is left unsearchable rather than failing the write.
 */
export const MAX_INDEXED_CHARS = 700_000;

/** One stored line: name, offset into the call, text. Short keys on purpose. */
export interface IndexedLine {
  n: string;
  a: number;
  t: string;
}

/**
 * Builds or rebuilds the index for one transcript. Does nothing for a
 * transcript that is not finished. Never throws: a missing index makes
 * a transcript unsearchable, it does not make the call fail.
 */
export async function indexTranscript(roomId: string): Promise<boolean> {
  try {
    const ref = adminDb.collection("transcripts").doc(roomId);
    const snap = await ref.get();
    if (!snap.exists) return false;

    const session = snap.data()!;
    if (session.status !== "ended") return false;

    const startedAt: number = session.startedAt?.toMillis?.() ?? 0;
    const endedAt: number = session.endedAt?.toMillis?.() ?? startedAt;

    const lineSnap = await ref
      .collection("lines")
      .orderBy("at", "asc")
      .limit(HARD_MAX_LINES_PER_SESSION)
      .get();

    const lines: IndexedLine[] = [];
    let chars = 0;
    for (const doc of lineSnap.docs) {
      const data = doc.data();
      const text = typeof data.text === "string" ? data.text : "";
      if (!text) continue;
      chars += text.length;
      if (chars > MAX_INDEXED_CHARS) break;
      lines.push({
        n: typeof data.name === "string" ? data.name : "Operative",
        a: Math.max(0, (Number(data.at) || startedAt) - startedAt),
        t: text,
      });
    }

    const title: string = session.title ?? "Meeting";
    const readerIds = Object.keys(session.consent ?? {});
    const now = Timestamp.now();

    const batch = adminDb.batch();
    batch.set(adminDb.collection(SEARCH_COLLECTION).doc(roomId), {
      orgId: session.orgId,
      readerIds,
      title,
      startedAt,
      endedAt,
      lineCount: lines.length,
      terms: termsOf(title, lines.map((line) => ({ text: line.t }))),
      indexedAt: now,
    });
    batch.set(adminDb.collection(TEXT_COLLECTION).doc(roomId), {
      orgId: session.orgId,
      lines,
    });
    batch.update(ref, { searchIndexedAt: now });
    await batch.commit();
    return true;
  } catch (err) {
    console.error(`[TranscriptSearch] Could not index ${roomId}:`, err);
    return false;
  }
}
