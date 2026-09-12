"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AppHeader } from "@/components/nav/app-header";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { VaultExplorer } from "@/components/vault/vault-explorer";
import { VaultPasscodeGate } from "@/components/vault/vault-passcode-gate";

/** Purely a UX cache — real enforcement is the server-side unlock record
 *  `verifyVaultPasscodeAction` writes and Firestore rules + every vault
 *  server action check. Sessionstorage means it never survives a closed
 *  tab, and a stale "unlocked" flag here does nothing once that record
 *  expires: the explorer's subscription starts failing with
 *  permission-denied and `onPermissionDenied` below clears it. */
function unlockCacheKey(orgId: string): string {
  return `orbitos:vault-unlocked:${orgId}`;
}

/* ------------------------------------------------------------------ */
/*  /vault                                                             */
/*                                                                     */
/*  Its own destination rather than a tab under Settings, because the  */
/*  documents here are used, not configured — somebody looks up the    */
/*  tax clearance certificate the way they look up a project, and      */
/*  burying that two levels into a settings tree is how the roster     */
/*  ended up hidden before the nav existed.                            */
/* ------------------------------------------------------------------ */

export default function VaultPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [unlocked, setUnlocked] = useState(false);
  const [cacheChecked, setCacheChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user?.orgId) return;
    try {
      setUnlocked(sessionStorage.getItem(unlockCacheKey(user.orgId)) === "1");
    } catch {
      // Storage unavailable — fall back to the gate rather than assume unlocked.
    } finally {
      setCacheChecked(true);
    }
  }, [user?.orgId]);

  const handleUnlocked = useCallback(() => {
    setUnlocked(true);
    if (user?.orgId) {
      try {
        sessionStorage.setItem(unlockCacheKey(user.orgId), "1");
      } catch {
        // Non-fatal — the server-side unlock still holds either way.
      }
    }
  }, [user?.orgId]);

  const handleRelock = useCallback(() => {
    setUnlocked(false);
    if (user?.orgId) {
      try {
        sessionStorage.removeItem(unlockCacheKey(user.orgId));
      } catch {
        // Non-fatal.
      }
    }
  }, [user?.orgId]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-base">
        <Loader />
      </div>
    );
  }

  if (!user) return null;

  /* A user with no organization has no vault to open. This is the same
     state onboarding leaves someone in mid-flow, so it explains itself
     rather than rendering an empty shelf that looks broken. */
  if (!user.orgId) {
    return (
      <DashboardShell className="min-h-screen bg-base text-ink">
        <AppHeader user={user} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-24 text-center">
          <p className="text-[13px] text-ink">No workspace yet</p>
          <p className="max-w-sm text-[12px] leading-relaxed text-ink-dim">
            The Vault belongs to a company. Finish setting up your workspace and
            it will be waiting here.
          </p>
        </div>
      </DashboardShell>
    );
  }

  const isOwner = user.role === "OWNER";

  return (
    <DashboardShell className="min-h-screen bg-base text-ink selection:bg-surface-hover selection:text-ink-strong">
      <AppHeader user={user} />

      <ScrollReveal>
        <div className="mb-16">
          <h2 className="mb-6 text-5xl font-light tracking-tighter text-ink">
            The Vault
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 rounded-full bg-surface-control px-3 py-1 ring-1 ring-line/[0.04]">
              <ShieldCheck className="h-3 w-3 text-ink-muted" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                {isOwner ? "Full Clearance" : "Standard Clearance"}
              </span>
            </div>
            <span className="max-w-lg text-[13px] leading-relaxed text-ink-dim">
              {isOwner
                ? "Everything the company holds. Restricted documents are visible to you because you own this workspace."
                : "Company records shared with the team, plus anything you filed yourself."}
            </span>
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal>
        {!cacheChecked ? (
          <div className="flex items-center justify-center py-24">
            <Loader size={22} />
          </div>
        ) : unlocked ? (
          <VaultExplorer
            orgId={user.orgId}
            uid={user.id}
            isOwner={isOwner}
            onPermissionDenied={handleRelock}
          />
        ) : (
          <VaultPasscodeGate isOwner={isOwner} onUnlocked={handleUnlocked} />
        )}
      </ScrollReveal>
    </DashboardShell>
  );
}
