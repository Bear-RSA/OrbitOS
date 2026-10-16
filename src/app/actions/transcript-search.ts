"use server";

import { z } from "zod";

import { adminDb } from "@/lib/firebase/admin";
import { requireCaller } from "@/lib/auth/caller";
import { resolveTranscriptLimit } from "@/lib/auth/permissions";
import { createSearchGuard, SEARCH_WINDOW_MS } from "@/lib/messages/gif-guard";
import {
  hasAllTerms,
  pickSnippets,
  queryTerms,
  type Snippet,
} from "@/lib/transcripts/search";
import {
  SEARCH_COLLECTION,
  TEXT_COLLECTION,
  indexTranscript,
  type IndexedLine,
} from "@/lib/transcripts/search-index";

/* ------------------------------------------------------------------ */
/*  Past transcripts: list and search                                  */
/*                                                                     */
/*  Both resolve the caller from the session and show only transcripts */
/*  the caller was asked to consent to — the rule `getTranscriptAction` */
/*  already applies when one is opened. Other members of the same      */
/*  workspace see nothing of a meeting they were not in, including     */
/*  that it happened.                                                  */
/*                                                                     */
/*  Search reads Firestore, so it has a plan gate (a workspace whose   */
/*  plan has no transcripts cannot search them) and hard ceilings that */
/*  always apply: scanned documents per search, results per search,    */
/*  and searches per person per hour.                                  */
/* ------------------------------------------------------------------ */

/** Index documents read per search. */
const HARD_MAX_SCANNED = 1_000;
/** Results returned per search, newest first. */
const HARD_MAX_RESULTS = 20;
/** Transcripts listed on the page. */
const HARD_MAX_LISTED = 1_000;
/** Older transcripts indexed per visit, so the first visit stays quick. */
const BACKFILL_PER_VISIT = 5;

/** Searches per person per hour, and for the whole deployment. */
const MAX_SEARCHES_PER_USER = 60;
const MAX_SEARCHES_GLOBAL = 3_000;
const guard = createSearchGuard(SEARCH_WINDOW_MS, MAX_SEARCHES_PER_USER, MAX_SEARCHES_GLOBAL);

type ActionResult<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

export interface TranscriptSummary {
  roomId: string;
  title: string;
  startedAt: number;
  endedAt: number;
  lineCount: number;
  filed: boolean;
}

export interface TranscriptSearchHit {
  roomId: string;
  title: string;
  startedAt: number;
  endedAt: number;
  matchingLines: number;
  snippets: Snippet[];
}

async function searchIncluded(orgId: string): Promise<boolean> {
  return (await resolveTranscriptLimit(orgId)) !== 0;
}

/**
 * The finished transcripts the caller was part of, newest first.
 * Also indexes a few older ones that predate search, so the list
 * becomes fully searchable over the first visits.
 */
export async function listTranscriptsAction(): Promise<
  ActionResult<{ transcripts: TranscriptSummary[]; searchEnabled: boolean }>
> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    // Two equality filters: served by single-field indexes, no composite.
    const snap = await adminDb
      .collection("transcripts")
      .where("orgId", "==", caller.orgId)
      .where("status", "==", "ended")
      .limit(HARD_MAX_LISTED)
      .get();

    const mine = snap.docs.filter((doc) => Boolean(doc.data().consent?.[caller.uid]));

    const unindexed = mine.filter((doc) => !doc.data().searchIndexedAt);
    for (const doc of unindexed.slice(0, BACKFILL_PER_VISIT)) {
      await indexTranscript(doc.id);
    }

    const transcripts = mine
      .map((doc) => {
        const data = doc.data();
        const startedAt: number = data.startedAt?.toMillis?.() ?? 0;
        return {
          roomId: doc.id,
          title: (data.title as string) ?? "Meeting",
          startedAt,
          endedAt: data.endedAt?.toMillis?.() ?? startedAt,
          lineCount: Number(data.lineCount) || 0,
          filed: Boolean(data.vaultDocumentId),
        };
      })
      .sort((a, b) => b.startedAt - a.startedAt);

    return {
      success: true,
      transcripts,
      searchEnabled: await searchIncluded(caller.orgId),
    };
  } catch (err) {
    console.error("[TranscriptSearch] Failed to list transcripts:", err);
    return { success: false, error: "Could not load your transcripts." };
  }
}

const searchSchema = z.object({ query: z.string().trim().min(1).max(200) });

export async function searchTranscriptsAction(
  input: unknown
): Promise<ActionResult<{ hits: TranscriptSearchHit[]; totalMatches: number }>> {
  try {
    const parsed = searchSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Type something to search for." };

    const wanted = queryTerms(parsed.data.query);
    if (wanted.length === 0) {
      return { success: false, error: "Search for a word of two letters or more." };
    }

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    if (!(await searchIncluded(caller.orgId))) {
      return { success: false, error: "Transcript search comes with Standard and Pro." };
    }

    const admission = guard.admit(caller.uid);
    if (!admission.allowed) {
      const minutes = Math.max(1, Math.ceil(admission.retryAfterMs / 60_000));
      return {
        success: false,
        error: `That's a lot of searches. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      };
    }

    // One array-contains filter: served by the automatic single-field index.
    const snap = await adminDb
      .collection(SEARCH_COLLECTION)
      .where("readerIds", "array-contains", caller.uid)
      .limit(HARD_MAX_SCANNED)
      .get();

    const matches = snap.docs
      .filter((doc) => {
        const data = doc.data();
        return data.orgId === caller.orgId && hasAllTerms(data.terms ?? [], wanted);
      })
      .sort((a, b) => (b.data().startedAt ?? 0) - (a.data().startedAt ?? 0));

    const top = matches.slice(0, HARD_MAX_RESULTS);
    const texts =
      top.length === 0
        ? []
        : await adminDb.getAll(
            ...top.map((doc) => adminDb.collection(TEXT_COLLECTION).doc(doc.id))
          );

    const hits: TranscriptSearchHit[] = top.map((doc, index) => {
      const data = doc.data();
      const lines = ((texts[index]?.data()?.lines ?? []) as IndexedLine[]).map((line) => ({
        name: line.n,
        at: line.a,
        text: line.t,
      }));
      const { snippets, matchingLines } = pickSnippets(lines, wanted);
      return {
        roomId: doc.id,
        title: data.title ?? "Meeting",
        startedAt: data.startedAt ?? 0,
        endedAt: data.endedAt ?? data.startedAt ?? 0,
        matchingLines,
        snippets,
      };
    });

    return { success: true, hits, totalMatches: matches.length };
  } catch (err) {
    console.error("[TranscriptSearch] Search failed:", err);
    return { success: false, error: "Search failed. Try again." };
  }
}
