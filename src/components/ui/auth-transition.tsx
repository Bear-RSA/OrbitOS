"use client";

import { useEffect, useState } from "react";
import { Loader } from "@/components/ui/loader";
import { ScrambleText } from "@/components/ui/scramble-text";

/**
 * Full-screen hold shown while auth resolves and the session cookie is minted.
 *
 * That exchange is fast once warm (~40ms) but the first call of a session pays
 * for firebase-admin cold start and can run well over ten seconds. An
 * unqualified spinner for that long reads as a broken page, so after a few
 * seconds we say so explicitly rather than leaving the user guessing.
 */
export function AuthTransition({ label = "Node Initialization" }: { label?: string }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-[#050505]"
      role="status"
      aria-live="polite"
    >
      <Loader color="#FF78E0" />
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#ededed]">
          <ScrambleText text={label} />
        </span>
        <div className="h-px w-24 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <p
          className={`max-w-xs font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-ink-dim transition-opacity duration-700 ${
            slow ? "opacity-100" : "opacity-0"
          }`}
        >
          Establishing secure session — the first connection can take a moment.
        </p>
      </div>
    </div>
  );
}
