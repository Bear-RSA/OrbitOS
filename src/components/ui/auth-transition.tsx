"use client";

import { useEffect, useState } from "react";
import { Loader } from "@/components/ui/loader";
import { themeColor } from "@/lib/theme/colors";

/**
 * Full-screen hold shown while auth resolves and the session cookie is minted.
 *
 * That exchange is fast once warm (~40ms) but the first call of a session pays
 * for firebase-admin cold start and can run well over ten seconds. An
 * unqualified spinner for that long reads as a broken page, so after a few
 * seconds we say so explicitly rather than leaving the user guessing.
 */
export function AuthTransition({ label = "Signing you in" }: { label?: string }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-base"
      role="status"
      aria-live="polite"
    >
      <Loader color={themeColor.pink} />
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <span className="text-[14px] text-ink">{label}…</span>
        <div className="h-px w-24 bg-gradient-to-r from-transparent via-line/10 to-transparent" />
        <p
          className={`max-w-xs text-[13px] leading-relaxed text-ink-muted transition-opacity duration-700 ${
            slow ? "opacity-100" : "opacity-0"
          }`}
        >
          Still connecting. The first connection can take a few seconds.
        </p>
      </div>
    </div>
  );
}
