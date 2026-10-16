"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getAdminToolsStatusAction, type AdminToolsStatus } from "@/app/actions/admin-tools";
import { AdminPasscodeGate } from "@/components/admin/admin-passcode-gate";
import { AdminToolsPanel } from "@/components/admin/admin-tools-panel";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AppHeader } from "@/components/nav/app-header";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { useAuth } from "@/contexts/auth-context";

/* ------------------------------------------------------------------ */
/*  /admin                                                             */
/*                                                                     */
/*  Admin Tools, for Internal Management only. Not in the nav: the few */
/*  people who hold the key reach it from Settings, and everyone else  */
/*  who lands here by URL is told it isn't theirs, nothing more.       */
/*                                                                     */
/*  Like the Vault, every fresh visit asks for the passcode again,     */
/*  even while the last unlock is still good on the server.            */
/* ------------------------------------------------------------------ */

function Loading() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-ground">
      <OrbitLoader />
    </div>
  );
}

function AdminView() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetToken = searchParams.get("reset");

  const [status, setStatus] = useState<AdminToolsStatus | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user?.orgId) return;
    let live = true;
    getAdminToolsStatusAction().then((result) => {
      if (!live) return;
      setStatus(result.success ? result.status : { member: false, passcodeSet: false, unlockedUntil: null });
    });
    return () => {
      live = false;
    };
  }, [user?.orgId]);

  const handleUnlocked = useCallback(() => {
    setUnlocked(true);
    setStatus((s) => (s ? { ...s, passcodeSet: true } : s));
    // A reset link is single-use; drop it so a reload doesn't show the form again.
    if (resetToken) router.replace("/admin");
  }, [resetToken, router]);
  const handleLocked = useCallback(() => setUnlocked(false), []);

  if (loading || (user?.orgId && !status)) return <Loading />;
  if (!user) return null;

  return (
    <DashboardShell className="min-h-screen bg-ground text-ink selection:bg-surface-hover selection:text-ink-strong">
      <AppHeader user={user} />

      <ScrollReveal>
        <div className="mb-12">
          <h1 className="mb-4 text-5xl font-light tracking-tighter text-ink">Admin Tools</h1>
          <p className="max-w-xl text-[13px] leading-relaxed text-ink-dim">
            Ranks, Internal Management and the account, for the people who run OrbitOS for this workspace.
          </p>
        </div>
      </ScrollReveal>

      {!status?.member ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
          <p className="text-[14px] text-ink">Admin Tools is for Internal Management</p>
          <p className="text-[13px] leading-relaxed text-ink-dim">
            If you need a rank or billing changed, ask someone who runs OrbitOS for your workspace.
          </p>
        </div>
      ) : unlocked ? (
        <AdminToolsPanel onLocked={handleLocked} viewerId={user.id} />
      ) : (
        <AdminPasscodeGate passcodeSet={status.passcodeSet} resetToken={resetToken} onUnlocked={handleUnlocked} />
      )}
    </DashboardShell>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminView />
    </Suspense>
  );
}
