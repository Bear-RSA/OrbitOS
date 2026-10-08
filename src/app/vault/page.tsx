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

  /* No cache across loads — by design. Every fresh visit to /vault (a
     hard reload, a new tab, navigating away and back) starts locked and
     asks for the passcode again, even though the server-side unlock
     record `verifyVaultPasscodeAction` writes is still good for a while
     longer. That record is what keeps a single page instance's Firestore
     subscription alive without re-checking on every read — it is not a
     "stay logged in" mechanism, and nothing here tries to remember the
     unlock past this component's own lifetime. */
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/login");
  }, [loading, user, router]);

  const handleUnlocked = useCallback(() => setUnlocked(true), []);
  const handleRelock = useCallback(() => setUnlocked(false), []);

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
          <h1 className="mb-6 text-5xl font-light tracking-tighter text-ink">
            The Vault
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 rounded-full bg-surface-control px-3 py-1 ring-1 ring-line/[0.04]">
              <ShieldCheck className="h-3 w-3 text-ink-muted" />
              <span className="text-[12px] text-ink-muted">
                {isOwner ? "Full access" : "Standard access"}
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
        {unlocked ? (
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
