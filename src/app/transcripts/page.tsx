"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Download, Search, Vault, X } from "lucide-react";

import {
  listTranscriptsAction,
  searchTranscriptsAction,
  type TranscriptSearchHit,
  type TranscriptSummary,
} from "@/app/actions/transcript-search";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AppHeader } from "@/components/nav/app-header";
import { DialogNotice } from "@/components/ui/dialog-parts";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { VaultDocumentDialog } from "@/components/vault/vault-document-dialog";
import { useAuth } from "@/contexts/auth-context";
import { useTranscript } from "@/hooks/use-transcript";
import { durationLabel, offsetLabel } from "@/lib/transcripts/render";
import type { Snippet } from "@/lib/transcripts/search";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  /transcripts                                                       */
/*                                                                     */
/*  Every transcribed call you were in, newest first, and a search     */
/*  across all of them. Nobody sees a transcript of a call they were   */
/*  not asked about — the server applies that rule to both the list    */
/*  and the search, so this page never has to.                         */
/* ------------------------------------------------------------------ */

const SECTION =
  "rounded-[28px] bg-surface-raised/40 p-5 ring-1 ring-inset ring-line/[0.05] sm:p-7";

const ROW = cn(
  "flex w-full flex-col gap-1 rounded-2xl px-3 py-3 text-left",
  "transition-colors duration-quick hover:bg-surface-control/50",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
);

function dateLabel(millis: number): string {
  return millis ? format(new Date(millis), "d MMM yyyy, HH:mm") : "Date unknown";
}

/** Snippet text with the matched word starts marked. */
function Highlighted({ snippet }: { snippet: Snippet }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  snippet.highlights.forEach(([start, end], i) => {
    if (start > cursor) parts.push(snippet.text.slice(cursor, start));
    parts.push(
      <mark key={i} className="rounded-sm bg-orbit-amber/25 px-0.5 text-ink">
        {snippet.text.slice(start, end)}
      </mark>
    );
    cursor = end;
  });
  if (cursor < snippet.text.length) parts.push(snippet.text.slice(cursor));
  return <>{parts}</>;
}

/** The open transcript: the full text, Download, and File to the Vault. */
function Reader({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const { transcript, error, filed, download, file, presetFile } = useTranscript(roomId);
  const [filing, setFiling] = useState(false);

  return (
    <section className={cn(SECTION, "mb-6")} aria-label="Open transcript">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-light tracking-tight text-ink">
            {transcript?.title ?? "Transcript"}
          </h2>
          {transcript && (
            <p className="text-[12px] text-ink-dim">
              {dateLabel(transcript.startedAt)} · {durationLabel(transcript.startedAt, transcript.endedAt)} ·{" "}
              {transcript.lineCount} line{transcript.lineCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {transcript && (
            <>
              <button
                type="button"
                onClick={download}
                aria-label="Download"
                className="rounded-lg p-2 text-ink-dim transition-colors hover:bg-surface-control hover:text-ink"
              >
                <Download className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setFiling(true)}
                disabled={filed}
                aria-label={filed ? "Already in the Vault" : "File to the Vault"}
                className="rounded-lg p-2 text-ink-dim transition-colors hover:bg-surface-control hover:text-ink disabled:opacity-40"
              >
                <Vault className="h-4 w-4" aria-hidden />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-ink-dim transition-colors hover:bg-surface-control hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {error ? (
        <DialogNotice tone="red">{error}</DialogNotice>
      ) : !transcript ? (
        <div className="flex justify-center py-8">
          <OrbitLoader size={48} />
        </div>
      ) : (
        <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-surface-control/40 p-4 font-sans text-[13px] leading-relaxed text-ink-muted">
          {transcript.text}
        </pre>
      )}

      {presetFile && (
        <VaultDocumentDialog open={filing} onOpenChange={setFiling} presetFile={presetFile} onSubmit={file} />
      )}
    </section>
  );
}

export default function TranscriptsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const readerRef = useRef<HTMLDivElement>(null);

  const [transcripts, setTranscripts] = useState<TranscriptSummary[] | null>(null);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ query: string; hits: TranscriptSearchHit[]; total: number } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user?.orgId) return;
    listTranscriptsAction().then((result) => {
      if (!result.success) {
        setError(result.error);
        setTranscripts([]);
        return;
      }
      setTranscripts(result.transcripts);
      setSearchEnabled(result.searchEnabled);
    });
  }, [user?.orgId]);

  const open = useCallback((roomId: string) => {
    setOpenId(roomId);
    // The reader sits above the list; bring it into view on a phone.
    requestAnimationFrame(() => readerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const search = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const q = query.trim();
      if (!q) {
        setResults(null);
        setSearchError(null);
        return;
      }
      setSearching(true);
      setSearchError(null);
      const result = await searchTranscriptsAction({ query: q });
      setSearching(false);
      if (!result.success) {
        setSearchError(result.error);
        return;
      }
      setResults({ query: q, hits: result.hits, total: result.totalMatches });
    },
    [query]
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults(null);
    setSearchError(null);
  }, []);

  if (loading || !user || transcripts === null) {
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center bg-ground">
        <OrbitLoader />
      </div>
    );
  }

  return (
    <DashboardShell className="min-h-screen bg-ground text-ink selection:bg-surface-hover selection:text-ink-strong">
      <AppHeader user={user} />

      <ScrollReveal>
        <div className="mb-10">
          <h1 className="mb-4 text-5xl font-light tracking-tighter text-ink">Transcripts</h1>
          <p className="max-w-xl text-[13px] leading-relaxed text-ink-dim">
            Every transcribed call you were in. Only the people who were asked to agree can see a transcript.
          </p>
        </div>
      </ScrollReveal>

      {error && <DialogNotice tone="red" className="mb-6 max-w-xl">{error}</DialogNotice>}

      {transcripts.length > 0 &&
        (searchEnabled ? (
          <form onSubmit={search} role="search" className="mb-6 flex max-w-xl items-center gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-2xl bg-surface-control/60 px-4 py-3 ring-1 ring-inset ring-line/[0.06] focus-within:ring-focus">
              <Search className="h-4 w-4 shrink-0 text-ink-dim" aria-hidden />
              <span className="sr-only">Search transcripts</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="What did we agree about the logo?"
                maxLength={200}
                className="min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-dim focus:outline-none sm:text-[14px]"
              />
              {results && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="rounded-md p-0.5 text-ink-dim hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </label>
            <button
              type="submit"
              disabled={searching}
              aria-label="Search"
              className="flex h-[46px] w-[46px] items-center justify-center rounded-2xl bg-ink text-on-ink transition-transform duration-quick active:scale-[0.97] disabled:opacity-50"
            >
              {searching ? <OrbitLoader size={18} /> : <Search className="h-4 w-4" aria-hidden />}
            </button>
          </form>
        ) : (
          <p className="mb-6 max-w-xl text-[12px] text-ink-dim">
            Searching transcripts comes with Standard and Pro. You can still open and download each one below.
          </p>
        ))}

      {searchError && <DialogNotice tone="red" className="mb-6 max-w-xl">{searchError}</DialogNotice>}

      <div ref={readerRef} className="scroll-mt-28">
        {openId && <Reader key={openId} roomId={openId} onClose={() => setOpenId(null)} />}
      </div>

      <div className="flex flex-col gap-6 pb-24">
        {results ? (
          <section className={SECTION}>
            <h2 className="mb-3 text-[15px] font-light tracking-tight text-ink">
              {results.total === 0
                ? `Nothing matches “${results.query}”`
                : `${results.total} transcript${results.total === 1 ? "" : "s"} mention “${results.query}”`}
              {results.total > results.hits.length && (
                <span className="ml-2 text-[12px] text-ink-dim">showing the newest {results.hits.length}</span>
              )}
            </h2>
            <ul className="-mx-3 flex flex-col">
              {results.hits.map((hit) => (
                <li key={hit.roomId}>
                  <button type="button" onClick={() => open(hit.roomId)} className={ROW}>
                    <span className="truncate text-[14px] text-ink">{hit.title}</span>
                    <span className="text-[12px] text-ink-dim">
                      {dateLabel(hit.startedAt)}
                      {hit.matchingLines > 0 &&
                        ` · ${hit.matchingLines} matching line${hit.matchingLines === 1 ? "" : "s"}`}
                    </span>
                    {hit.snippets.map((snippet, i) => (
                      <span key={i} className="block text-[13px] leading-relaxed text-ink-muted">
                        <span className="font-mono text-[11px] text-ink-dim">{offsetLabel(snippet.at)}</span>{" "}
                        <span className="text-ink">{snippet.name}:</span> <Highlighted snippet={snippet} />
                      </span>
                    ))}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className={SECTION}>
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-light tracking-tight text-ink">
              Your calls
              {transcripts.length > 0 && (
                <span className="font-mono text-[11px] tabular-nums text-ink-muted">{transcripts.length}</span>
              )}
            </h2>
            {transcripts.length === 0 ? (
              <p className="text-[13px] text-ink-dim">
                No transcripts yet. Start one from the transcript button during a call.
              </p>
            ) : (
              <ul className="-mx-3 flex flex-col">
                {transcripts.map((t) => (
                  <li key={t.roomId}>
                    <button type="button" onClick={() => open(t.roomId)} className={ROW}>
                      <span className="truncate text-[14px] text-ink">{t.title}</span>
                      <span className="text-[12px] text-ink-dim">
                        {dateLabel(t.startedAt)} · {durationLabel(t.startedAt, t.endedAt)} · {t.lineCount} line
                        {t.lineCount === 1 ? "" : "s"}
                        {t.filed && " · In the Vault"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
