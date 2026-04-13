"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { redeemInviteAction, getInviteInfoAction } from "@/app/actions/invites";
import { Logo } from "@/components/brand/logo";

import type { MemberInvite } from "@/types/member";
import { signOut as firebaseSignOut } from "@/lib/firebase/auth";

import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import Link from "next/link";
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { user, firebaseUser, loading } = useAuth();
  const [status, setStatus] = useState<"loading" | "ready" | "joining" | "error" | "done">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [inviteData, setInviteData] = useState<Awaited<ReturnType<typeof getInviteInfoAction>> | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Invalid integration token.");
      return;
    }

    getInviteInfoAction(token).then((invite) => {
      if (!invite) {
        setStatus("error");
        setErrorMsg("This link is invalid or authorization has expired.");
        return;
      }
      if (invite.status === "accepted") {
        setStatus("error");
        setErrorMsg("This integration link has already been verified.");
        return;
      }
      
      if (invite.status === "expired" || invite.isExpired) {
        setStatus("error");
        setErrorMsg("This integration link has expired. Request a new invite.");
        return;
      }

      setInviteData(invite);
      setStatus("ready");
    });
  }, [token]);

  const handleJoin = async () => {
    console.log("handleJoin started");
    if (!firebaseUser || !inviteData) {
      console.log("Guard clause failed. Missing dependencies:", { firebaseUser: !!firebaseUser, inviteData: !!inviteData });
      const missing = [];
      if (!firebaseUser) missing.push("authentication");
      if (!inviteData) missing.push("invite data");
      
      setStatus("error");
      setErrorMsg(`Cannot join: Missing ${missing.join(", ")}.`);
      return;
    }

    // Client-side email match check (also enforced server-side)
    if (inviteData.email.toLowerCase() !== (firebaseUser.email || "").toLowerCase().trim()) {
      setStatus("error");
      setErrorMsg("Identity mismatch. Your authenticated email does not match this invite.");
      return;
    }

    console.log("Guard clauses passed, setting joining status");
    setStatus("joining");
    try {
      console.log("Sending redeem request...");
      const result = await redeemInviteAction({
        token: inviteData.token,
        uid: firebaseUser.uid,
        email: firebaseUser.email || ""
      });
      
      console.log("Received response:", result);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      setStatus("done");
      setTimeout(() => router.push("/onboarding/member"), 1500);
    } catch (err: any) {
      console.error("Redeem error:", err);
      setStatus("error");
      setErrorMsg(err?.message || "Network connection failed. Please attempt again.");
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
        <div className="w-full rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] p-8">
          <div className="mx-auto w-12 h-12 rounded-full bg-[#1A0A0A] flex items-center justify-center mb-6">
             <AlertCircle className="w-5 h-5 text-[#E57A7A]" />
          </div>
          <h1 className="text-[17px] font-light tracking-tight text-[#ededed] mb-2">Integration Failed</h1>
          <p className="text-[13px] text-[#888888] font-light leading-relaxed mb-6">{errorMsg}</p>
          <Link href="/" className="text-[12px] font-medium text-[#ededed] bg-[#111111] px-4 py-2 rounded-lg hover:bg-white/[0.04] transition-colors inline-block tracking-wide">Return to Core</Link>
        </div>
      );
    }

    if (status === "done") {
      return (
        <div className="w-full rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] p-8">
          <div className="mx-auto w-12 h-12 rounded-full bg-[#0F1A13] flex items-center justify-center mb-6">
             <CheckCircle2 className="w-5 h-5 text-[#85C89B]" />
          </div>
          <h1 className="text-[17px] font-light tracking-tight text-[#ededed] mb-2">Integration Complete</h1>
          <p className="text-[13px] text-[#888888] font-light leading-relaxed">Initializing dashboard sequence...</p>
        </div>
      );
    }

    if (!isInviteReady) return null;

    return (
      <div className="w-full rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] p-8">
        <div className="mx-auto w-12 h-12 rounded-full bg-[#111111] border border-white/[0.04] flex items-center justify-center mb-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <UserPlus className="w-5 h-5 text-[#ededed]" />
        </div>
        <h1 className="text-[17px] font-light tracking-tight text-[#ededed] mb-1">Workspace Request</h1>
        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#444] mb-8">Access Token Verified</p>

        {/* Priority 1: Authentication Required */}
        {needsAuth ? (
          <>
            <p className="text-[13px] text-[#888888] font-light leading-relaxed mb-8">
              You must authenticate with your own operational identity to accept this invite.
            </p>
            <Link
              href={`/signup?redirect=${encodeURIComponent(`/join?token=${token}`)}`}
              className="block w-full"
            >
              <Button className="w-full" id="signup-to-join">
                Establish clearance
              </Button>
            </Link>
            <p className="text-[12px] text-[#555555] font-light leading-relaxed mt-6">
              Already have clearance? <Link href={`/login?redirect=${encodeURIComponent(`/join?token=${token}`)}`} className="text-[#888888] hover:text-[#ededed] underline-offset-4 hover:underline transition-all">Sign in</Link>
            </p>
          </>
        ) : 
        /* Priority 2: Identity Mismatch */
        isWrongEmail ? (
          <>
            <p className="text-[13px] text-[#888888] font-light leading-relaxed mb-6">
              Identity mismatch. This invite is bound to <span className="text-[#ededed] font-medium">{inviteData?.email}</span>, but you are logged in as <span className="text-[#E57A7A]">{firebaseUser?.email}</span>.
            </p>
            <Button 
              variant="outline" 
              className="w-full mb-4" 
              onClick={async () => {
                await firebaseSignOut();
                window.location.reload();
              }}
            >
              Sign Out and Switch Account
            </Button>
          </>
        ) :
        /* Priority 3: Collision - Correct Org */
        isAlreadyInOrg ? (
          <>
            <p className="text-[13px] text-[#888888] font-light leading-relaxed mb-8">
              You are already a member of this workspace. Your identity is active.
            </p>
            <Link href="/dashboard" className="block w-full">
              <Button className="w-full">Return to Dashboard</Button>
            </Link>
          </>
        ) :
        /* Priority 4: Collision - Wrong Org */
        isInOtherOrg ? (
          <>
            <p className="text-[13px] text-[#888888] font-light leading-relaxed mb-6">
              Identity conflict. You are currently assigned to another workspace (<span className="text-[#ededed]">{user?.email}</span>).
            </p>
            <Button 
              variant="outline" 
              className="w-full mb-4" 
              onClick={async () => {
                await firebaseSignOut();
                window.location.reload();
              }}
            >
              Sign Out to Accept
            </Button>
            <Link href="/dashboard" className="text-[12px] text-[#555555] hover:text-[#888888] transition-colors inline-block tracking-wide">
              Return to my dashboard
            </Link>
          </>
        ) :
        /* Priority 5: Ready to Redeem */
        canJoin ? (
          <>
            <p className="text-[13px] text-[#888888] font-light leading-relaxed mb-8">
              Your account (<span className="text-[#ededed]">{firebaseUser?.email}</span>) has been cleared to join this network. Proceed below.
            </p>
            <Button
              onClick={handleJoin}
              className="w-full"
              disabled={status === "joining"}
              id="accept-invite-btn"
            >
              {status === "joining" ? "Integrating..." : "Acknowledge & Join Workspace"}
            </Button>
          </>
        ) : (
          /* Fallback: Catch All for loading profiles or edge cases */
          <div className="flex flex-col items-center gap-6">
             <Loader />
             <div className="flex flex-col items-center gap-2">
               <p className="text-[12px] text-[#555] font-mono uppercase tracking-widest">
                 {syncTimedOut ? "Sync Interrupted" : "Synchronizing Identity"}
               </p>
               {syncTimedOut && (
                 <button 
                   onClick={() => window.location.reload()}
                   className="text-[11px] text-[#888] underline underline-offset-4 hover:text-[#ededed] transition-colors"
                 >
                   Retry Connection
                 </button>
               )}
             </div>
          </div>
        )}
      </div>
    );
  };

  if (loading || status === "loading") {
    return (
      <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6 animate-in fade-in duration-1000">
        <Loader />
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#555555]">
            Verifying Link
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-[#111111] to-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in text-center flex flex-col items-center">
        <div className="flex flex-col items-center gap-3 mb-10 justify-center">
          <Logo size={40} />
          <span className="font-semibold text-[#ededed] text-lg tracking-tight">OrbitOS</span>
        </div>

        {renderContent()}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6 animate-in fade-in duration-1000">
        <Loader />
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#555555]">
            System Rendering
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-[#111111] to-transparent"></div>
        </div>
      </div>
    }>
      <JoinForm />
    </Suspense>
  );
}
