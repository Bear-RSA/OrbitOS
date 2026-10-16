"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { redeemInviteAction, getInviteInfoAction } from "@/app/actions/invites";
import { Logo } from "@/components/brand/logo";

import { signOut as firebaseSignOut } from "@/lib/firebase/auth";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/classnames";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import Link from "next/link";
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { GlassSurface } from "@/components/ui/glass-surface";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  // Set on the links to signup and login below. Someone who just made an
  // account or signed in from this screen already chose to accept, so we
  // don't make them press the button a second time.
  const autoAccept = searchParams.get("accept") === "1";
  const autoAcceptTried = useRef(false);
  const returnHere = encodeURIComponent(`/join?token=${token}&accept=1`);
  const { user, firebaseUser, loading } = useAuth();
  const [status, setStatus] = useState<"loading" | "ready" | "joining" | "error" | "done">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [inviteData, setInviteData] = useState<Awaited<ReturnType<typeof getInviteInfoAction>> | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("This link is missing its invite code. Open the link from your invite email again.");
      return;
    }

    getInviteInfoAction(token).then((invite) => {
      if (!invite) {
        setStatus("error");
        setErrorMsg("We couldn't find this invite. Check that you opened the whole link from the email, or ask for a new invite.");
        return;
      }
      if (invite.status === "revoked") {
        setStatus("error");
        setErrorMsg("This invite was withdrawn. Ask whoever invited you for a new one.");
        return;
      }
      if (invite.status === "accepted") {
        setStatus("error");
        setErrorMsg("This invite has already been used. If you accepted it, sign in to open your workspace.");
        return;
      }
      
      if (invite.status === "expired" || invite.isExpired) {
        setStatus("error");
        setErrorMsg("This invite has expired. Ask whoever invited you to send a new one.");
        return;
      }

      setInviteData(invite);
      setStatus("ready");
    });
  }, [token]);

  const handleJoin = async () => {
        if (!firebaseUser || !inviteData) {
      setStatus("error");
      setErrorMsg(
        firebaseUser
          ? "We couldn't load this invite. Reload the page and try again."
          : "Sign in before you accept this invite."
      );
      return;
    }

    // Client-side email match check (also enforced server-side)
    if (inviteData.email.toLowerCase() !== (firebaseUser.email || "").toLowerCase().trim()) {
      setStatus("error");
      setErrorMsg("This invite was sent to a different email. Sign in with that email to accept it.");
      return;
    }

    setStatus("joining");
    try {
      const result = await redeemInviteAction({
        token: inviteData.token,
        uid: firebaseUser.uid,
        email: firebaseUser.email || ""
      });
      
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      setStatus("done");
      setTimeout(() => router.push("/onboarding/member"), 1500);
    } catch (err: unknown) {
      console.error("Redeem error:", err);
      setStatus("error");
      setErrorMsg((err instanceof Error && err.message) || "Couldn't reach OrbitOS. Check your connection and try again.");
    }
  };

  const isAuthenticated = !!firebaseUser;
  const hasProfile = !!user;
  const isInviteReady = status === "ready" || status === "joining";

  // Priority-based state calculation
  const isAlreadyInOrg = hasProfile && user && user.orgId === inviteData?.orgId;
  const isInOtherOrg = hasProfile && user && user.orgId && user.orgId !== inviteData?.orgId;
  const isWrongEmail = isAuthenticated && firebaseUser?.email && inviteData && 
                      inviteData.email.toLowerCase() !== firebaseUser.email.toLowerCase().trim();
  
  // Relaxed canJoin: Authenticated + Name verified + (No Org assigned OR profile not loaded yet)
  const canJoin = isAuthenticated && !isWrongEmail && (!hasProfile || !user.orgId);
  const needsAuth = !isAuthenticated;

  const [syncTimedOut, setSyncTimedOut] = useState(false);

  useEffect(() => {
    if (!autoAccept || !canJoin || status !== "ready" || autoAcceptTried.current) return;
    autoAcceptTried.current = true;
    handleJoin();
    // handleJoin is recreated every render; the ref makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAccept, canJoin, status]);

  useEffect(() => {
    if (!isAuthenticated || hasProfile || status !== "ready") return;
    
    const timer = setTimeout(() => {
      setSyncTimedOut(true);
    }, 4000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, hasProfile, status]);


  // Render priority logic
  const renderContent = () => {
    if (status === "error") {
      return (
        <GlassSurface fallback="bg-surface-container/95 backdrop-blur-2xl" tint="surface-control" className="w-full rounded-[40px] border border-outline-variant/10 shadow-overlay p-8 sm:p-12">
          <div className="mx-auto w-12 h-12 rounded-full bg-orbit-red/[0.1] flex items-center justify-center mb-6">
             <AlertCircle className="w-5 h-5 text-orbit-red" aria-hidden />
          </div>
          <h1 className="text-[17px] font-light tracking-tight text-ink mb-2">Couldn&apos;t open this invite</h1>
          <p role="alert" className="text-[13px] text-ink-muted font-light leading-relaxed mb-8">{errorMsg}</p>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>Go to the OrbitOS homepage</Link>
        </GlassSurface>
      );
    }

    if (status === "done") {
      return (
        <GlassSurface fallback="bg-surface-container/95 backdrop-blur-2xl" tint="surface-control" className="w-full rounded-[40px] border border-outline-variant/10 shadow-overlay p-8 sm:p-12">
          <div className="mx-auto w-12 h-12 rounded-full bg-orbit-green/[0.1] flex items-center justify-center mb-6">
             <CheckCircle2 className="w-5 h-5 text-orbit-green" aria-hidden />
          </div>
          <h1 className="text-[17px] font-light tracking-tight text-ink mb-2">You&apos;re in</h1>
          <p role="status" className="text-[13px] text-ink-muted font-light leading-relaxed">Next, tell your team a little about yourself…</p>
        </GlassSurface>
      );
    }

    if (!isInviteReady) return null;

    return (
      <GlassSurface fallback="bg-surface-container/95 backdrop-blur-2xl" tint="surface-control" className="w-full rounded-[40px] border border-outline-variant/10 shadow-overlay p-8 sm:p-12">
        <div className="mx-auto w-12 h-12 rounded-full bg-surface-control border border-line/[0.04] flex items-center justify-center mb-6 shadow-card">
          <UserPlus className="w-5 h-5 text-ink" aria-hidden />
        </div>
        <h1 className="text-[17px] font-light tracking-tight text-ink mb-1 break-words">
          Join {inviteData?.workspaceName} on OrbitOS
        </h1>
        <p className="text-[12px] text-ink-dim mb-8 break-words">
          {inviteData?.inviterName} invited <span className="break-all">{inviteData?.email}</span>
        </p>

        {/* Priority 1: Authentication Required */}
        {needsAuth ? (
          <>
            <p className="text-[13px] text-ink-muted font-light leading-relaxed mb-8">
              Create an account with this email to accept, or sign in if you already have one.
            </p>
            <Link href={`/signup?redirect=${returnHere}`} id="signup-to-join" className={cn(buttonVariants(), "w-full")}>
              Create account
            </Link>
            <p className="text-[12px] text-ink-dim font-light leading-relaxed mt-6">
              Already have an account? <Link href={`/login?redirect=${returnHere}`} className="text-ink-muted hover:text-ink underline-offset-4 hover:underline transition-all rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base">Sign in</Link>
            </p>
          </>
        ) : 
        /* Priority 2: Identity Mismatch */
        isWrongEmail ? (
          <>
            <p className="text-[13px] text-ink-muted font-light leading-relaxed mb-6">
              This invite is for <span className="text-ink font-medium break-all">{inviteData?.email}</span>, but you&apos;re signed in as <span className="text-ink break-all">{firebaseUser?.email}</span>.
            </p>
            <Button 
              variant="outline" 
              className="w-full mb-4" 
              onClick={async () => {
                await firebaseSignOut();
                window.location.reload();
              }}
            >
              Sign out and use another account
            </Button>
          </>
        ) :
        /* Priority 3: Collision - Correct Org */
        isAlreadyInOrg ? (
          <>
            <p className="text-[13px] text-ink-muted font-light leading-relaxed mb-8">
              You&apos;re already in this workspace.
            </p>
            <Link href="/dashboard" className={cn(buttonVariants(), "w-full")}>
              Go to my dashboard
            </Link>
          </>
        ) :
        /* Priority 4: Collision - Wrong Org */
        isInOtherOrg ? (
          <>
            {/* Signing out used to be offered here, but signing back in with
                the same account lands on this same screen. An account
                belongs to one workspace; say so and say what to do. */}
            <p className="text-[13px] text-ink-muted font-light leading-relaxed mb-8">
              {user?.role === "OWNER"
                ? "You own another workspace, so this account can't join a second one."
                : "You're already in another workspace. Ask its owner to remove you, then open this link again."}
            </p>
            <Link
              href="/dashboard"
              className="flex h-10 w-full items-center justify-center rounded-lg bg-surface-control text-[13px] font-medium text-ink ring-1 ring-inset ring-line/[0.06] transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Go to my dashboard
            </Link>
          </>
        ) :
        /* Priority 5: Ready to Redeem */
        canJoin ? (
          <>
            <p className="text-[13px] text-ink-muted font-light leading-relaxed mb-8">
              You&apos;ll join as <span className="text-ink break-all">{firebaseUser?.email}</span>.
            </p>
            <Button
              onClick={handleJoin}
              className="w-full"
              disabled={status === "joining"}
              id="accept-invite-btn"
            >
              {status === "joining" ? "Joining…" : "Accept invite"}
            </Button>
          </>
        ) : (
          /* Fallback: Catch All for loading profiles or edge cases */
          <div className="flex flex-col items-center gap-6">
             <OrbitLoader />
             <div className="flex flex-col items-center gap-2">
               <p role="status" className="text-[14px] text-ink-muted">
                 {syncTimedOut ? "This is taking longer than usual" : "Setting up your account…"}
               </p>
               {syncTimedOut && (
                 <button 
                   onClick={() => window.location.reload()}
                   className="text-[12px] text-ink-muted underline underline-offset-4 hover:text-ink transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
                 >
                   Reload page
                 </button>
               )}
             </div>
          </div>
        )}
      </GlassSurface>
    );
  };

  if (loading || status === "loading") {
    return (
      <div className="min-h-[100dvh] w-full bg-ground flex flex-col items-center justify-center gap-6 animate-in fade-in duration-1000">
        <OrbitLoader />
        <div className="flex flex-col items-center gap-2">
          <span className="text-[12px] text-ink-dim">
            Checking your invite…
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-line/[0.04] to-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ground flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in text-center flex flex-col items-center">
        <div className="flex flex-col items-center gap-3 mb-10 justify-center">
          <Logo size={40} />
          <span className="font-semibold text-ink text-lg tracking-tight">OrbitOS</span>
        </div>

        {renderContent()}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] w-full bg-ground flex flex-col items-center justify-center gap-6 animate-in fade-in duration-1000">
        <OrbitLoader />
        <div className="flex flex-col items-center gap-2">
          <span className="text-[12px] text-ink-dim">
            Loading…
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-line/[0.04] to-transparent"></div>
        </div>
      </div>
    }>
      <JoinForm />
    </Suspense>
  );
}
