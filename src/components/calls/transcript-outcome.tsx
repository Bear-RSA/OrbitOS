"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, Vault, X } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { VaultDocumentDialog } from "@/components/vault/vault-document-dialog";
import { depositToVault } from "@/lib/vault/deposit";
import {
  attachTranscriptVaultDocumentAction,
  getTranscriptAction,
  type TranscriptPayload,
} from "@/app/actions/transcripts";
import { durationLabel } from "@/lib/transcripts/render";
import type { VaultCategory, VaultClearance } from "@/types/vault";

/* ------------------------------------------------------------------ */
/*  After the call                                                     */
/*                                                                     */
/*  The card that hands the transcript over. It outlives the room —    */
/*  the shell that recorded this is already gone — which is why the    */
/*  call context remembers the room id rather than this component      */
/*  being mounted somewhere inside the call.                           */
/*                                                                     */
/*  Two ways out of here, and they are different promises. DOWNLOAD is */
/*  a file on this person's machine and nothing else. FILE TO VAULT    */
/*  puts it on a shelf under a clearance, where the workspace keeps    */
/*  the rest of its records — which is a decision about who else may   */
/*  read the meeting, so it goes through the same dialog every other   */
/*  filing does rather than being a second button that quietly         */
/*  publishes.                                                         */
/* ------------------------------------------------------------------ */

interface TranscriptOutcomeProps {
  roomId: string;
  title: string;
  onClose: () => void;
}

export function TranscriptOutcome({ roomId, title, onClose }: TranscriptOutcomeProps) {
  const [transcript, setTranscript] = useState<TranscriptPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);
  const [filed, setFiled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getTranscriptAction({ roomId }).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setTranscript(result.transcript);
        setFiled(Boolean(result.transcript.vaultDocumentId));
      } else {
        setError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  /* A blob and a detached anchor, the same way the Vault hands over a
     signed download. Nothing about this file exists on a server that
     could serve it directly — it is rendered on request. */
  const download = useCallback(() => {
    if (!transcript) return;

    const blob = new Blob([transcript.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = transcript.fileName;
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [transcript]);

  const file = useCallback(
    async (input: {
      file: File | null;
      name: string;
      note: string;
      category: VaultCategory;
      clearance: VaultClearance;
    }) => {
      if (!input.file) throw new Error("Nothing to file.");

      const { documentId } = await depositToVault({ ...input, file: input.file });

      /* Recorded on the transcript so a second visit to this card knows
         it already has a home. A failure here leaves a filed document
         the transcript does not know about, which is untidy rather than
         wrong — so it does not undo the filing. */
      await attachTranscriptVaultDocumentAction({ roomId, documentId });
      setFiled(true);
    },
    [roomId]
  );

  /* Memoized, and it has to be. The dialog reseeds its form whenever the
     file it was handed changes, so a fresh File on every render would
     wipe the label the operator is halfway through typing. */
  const presetFile = useMemo(
    () =>
      transcript
        ? new File([transcript.text], transcript.fileName, {
            type: "text/plain;charset=utf-8",
          })
        : null,
    [transcript]
  );

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-6 right-6 z-[60] w-[320px] animate-fade-in rounded-2xl border border-line/[0.08] bg-surface-container/95 p-5 shadow-overlay backdrop-blur-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
              Transcript ready
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-ink-dim transition-colors hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <p className="mb-1 truncate text-[14px] font-medium tracking-tight text-ink">
          {transcript?.title || title}
        </p>

        {error ? (
          <p className="mt-3 text-[11px] font-light leading-relaxed text-orbit-red">
            {error}
          </p>
        ) : !transcript ? (
          <div className="flex justify-center py-6">
            <Loader />
          </div>
        ) : (
          <>
            <p className="mb-4 text-[11px] font-light text-ink-dim">
              {transcript.lineCount === 0
                ? "Nothing was captured — no supported browser was listening."
                : `${transcript.lineCount} line${
                    transcript.lineCount === 1 ? "" : "s"
                  } over ${durationLabel(transcript.startedAt, transcript.endedAt)}`}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={download}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line/[0.06] bg-surface-control px-3 py-2.5 text-[12px] font-light tracking-wide text-ink transition-colors hover:bg-surface-raised"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download
              </button>

              <button
                type="button"
                onClick={() => setFiling(true)}
                disabled={filed}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line/[0.06] bg-surface-control px-3 py-2.5 text-[12px] font-light tracking-wide text-ink transition-colors hover:bg-surface-raised disabled:opacity-40"
              >
                <Vault className="h-3.5 w-3.5" aria-hidden />
                {filed ? "In the Vault" : "File it"}
              </button>
            </div>
          </>
        )}
      </div>

      {presetFile && (
        <VaultDocumentDialog
          open={filing}
          onOpenChange={setFiling}
          presetFile={presetFile}
          onSubmit={file}
        />
      )}
    </>
  );
}
