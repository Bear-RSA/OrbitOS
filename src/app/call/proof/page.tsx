"use client";

import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { CallRoom } from "@/components/calls/call-room";
import { getProofCallGrantAction } from "@/app/actions/calls";
import { vetDisplayName } from "@/lib/calls/display-name";
import type { CallGrant } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Proof room — TEMPORARY                                             */
/*                                                                     */
/*  Step one: get two people into one room and confirm media flows,    */
/*  before any scheduling or ringing UI exists to muddy a failure.     */
/*                                                                     */
/*  Open it in two windows — a normal one and a private one — and      */
/*  enter a different name in each. Both land in the same room, which  */
/*  is derived from the workspace, so nobody outside it can reach the  */
/*  room even by URL.                                                  */
/*                                                                     */
/*  DELETE THIS PAGE and `getProofCallGrantAction` once scheduled      */
/*  calls land.                                                        */
/* ------------------------------------------------------------------ */

export default function ProofCallPage() {
  const [name, setName] = useState("");
  const [grant, setGrant] = useState<CallGrant | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter(event: React.FormEvent) {
    event.preventDefault();

    const checked = vetDisplayName(name);
    if (checked.error) {
      setError(checked.error);
      return;
    }

    setJoining(true);
    setError(null);

    const result = await getProofCallGrantAction(checked.name!);
    if (result.success) setGrant(result.grant);
    else setError(result.error);

    setJoining(false);
  }

  if (grant) {
    return (
      <div className="flex min-h-screen flex-col bg-base p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            Proof room · {grant.displayName}
          </p>
          <button
            type="button"
            onClick={() => setGrant(null)}
            className="rounded-lg border border-line/[0.06] bg-surface-control px-3 py-1.5 text-[11px] tracking-wide text-ink transition-colors hover:bg-surface-raised"
          >
            Leave
          </button>
        </div>
        <CallRoom
          grant={grant}
          onLeave={() => setGrant(null)}
          className="min-h-0 flex-1"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <form
          onSubmit={enter}
          className="w-full rounded-[40px] border border-outline-variant/10 bg-surface-container/95 p-10 shadow-overlay backdrop-blur-2xl sm:p-12"
        >
          <Logo className="mb-10" />

          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim">
            Proof room
          </p>
          <h1 className="mb-8 text-[22px] font-light tracking-tight text-ink">
            Join the test call
          </h1>

          <label
            htmlFor="proof-name"
            className="mb-2 block text-[12px] font-light text-ink-muted"
          >
            Your name in the room
          </label>
          <input
            id="proof-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Window one"
            autoComplete="off"
            className="mb-6 w-full rounded-xl border border-line/[0.06] bg-surface-control px-4 py-3 text-[13px] font-light text-ink outline-none transition-colors focus:border-line/20"
          />

          <button
            type="submit"
            disabled={joining}
            className="w-full rounded-xl bg-ink px-4 py-3 text-[13px] font-medium tracking-wide text-on-ink transition-opacity disabled:opacity-40"
          >
            {joining ? "Connecting…" : "Enter room"}
          </button>

          {error && (
            <p className="mt-6 text-[12px] font-light text-orbit-red">{error}</p>
          )}

          <p className="mt-8 text-[11px] font-light leading-relaxed text-ink-dim">
            Open this page in a second window and enter a different name to
            test with two participants.
          </p>
        </form>
      </div>
    </div>
  );
}
