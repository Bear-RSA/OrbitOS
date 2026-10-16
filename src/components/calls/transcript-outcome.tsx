"use client";

import { useState } from "react";
import { Download, FileText, Vault, X } from "lucide-react";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import { VaultDocumentDialog } from "@/components/vault/vault-document-dialog";
import { useTranscript } from "@/hooks/use-transcript";
import { durationLabel } from "@/lib/transcripts/render";
import { GlassSurface } from "@/components/ui/glass-surface";

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
  const { transcript, error, filed, download, file, presetFile } = useTranscript(roomId);
  const [filing, setFiling] = useState(false);

  return (
    <>
      <GlassSurface
        fallback="bg-surface-container/95 backdrop-blur-2xl"
        tint="surface-control"
        weight="overlay"
        role="status"
        aria-live="polite"
        className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-6 z-[60] max-w-[calc(100vw-3rem)] w-[320px] animate-fade-in rounded-2xl border border-line/[0.08] p-5 shadow-overlay"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
            <p className="text-[12px] text-ink-dim">
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
            <OrbitLoader size={48} />
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
      </GlassSurface>

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
