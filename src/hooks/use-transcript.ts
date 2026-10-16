"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  attachTranscriptVaultDocumentAction,
  getTranscriptAction,
  type TranscriptPayload,
} from "@/app/actions/transcripts";
import { depositToVault } from "@/lib/vault/deposit";
import type { VaultCategory, VaultClearance } from "@/types/vault";

/* ------------------------------------------------------------------ */
/*  One finished transcript, and the two things you can do with it     */
/*                                                                     */
/*  Shared by the card that appears after a call and by /transcripts.  */
/*  DOWNLOAD is a file on this person's machine and nothing else.      */
/*  FILING puts it on a Vault shelf under a clearance, which is a      */
/*  decision about who else may read the meeting, so it goes through   */
/*  the same dialog every other filing does.                           */
/* ------------------------------------------------------------------ */

export function useTranscript(roomId: string) {
  const [transcript, setTranscript] = useState<TranscriptPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTranscript(null);
    setError(null);

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

      /* Recorded on the transcript so a second visit knows it already
         has a home. A failure here leaves a filed document the
         transcript does not know about, which is untidy rather than
         wrong — so it does not undo the filing. */
      await attachTranscriptVaultDocumentAction({ roomId, documentId });
      setFiled(true);
    },
    [roomId]
  );

  /* Memoized, and it has to be. The Vault dialog reseeds its form
     whenever the file it was handed changes, so a fresh File on every
     render would wipe the label the operator is halfway through typing. */
  const presetFile = useMemo(
    () =>
      transcript
        ? new File([transcript.text], transcript.fileName, {
            type: "text/plain;charset=utf-8",
          })
        : null,
    [transcript]
  );

  return { transcript, error, filed, download, file, presetFile };
}
