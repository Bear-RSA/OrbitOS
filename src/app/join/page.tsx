"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getInviteByToken, acceptInvite } from "@/lib/queries/members";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
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
  const [inviteOrgId, setInviteOrgId] = useState<string | null>(null);
  const [inviteId, setInviteId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Invalid integration token.");
      return;
    }

    getInviteByToken(token).then((invite) => {
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
      setInviteOrgId(invite.orgId);
      setInviteId(invite.id);
      setStatus("ready");
    });
  }, [token]);

  const handleJoin = async () => {
    if (!firebaseUser || !inviteOrgId || !inviteId) return;
    setStatus("joining");
    try {
      await updateDoc(doc(db, "users", firebaseUser.uid), {
        orgId: inviteOrgId,
        role: "member",
      });
      await acceptInvite(inviteId);
      setStatus("done");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      setStatus("error");
      setErrorMsg("Network connection failed. Please attempt again.");
    }
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
          <div className="w-10 h-10 rounded-xl bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center justify-center">
            <span className="text-lg font-bold text-[#ededed]">O</span>
          </div>
          <span className="font-semibold text-[#ededed] text-lg tracking-tight">OrbitOS</span>
        </div>

        {status === "error" && (
          <div className="w-full rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] p-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#1A0A0A] flex items-center justify-center mb-6">
               <AlertCircle className="w-5 h-5 text-[#E57A7A]" />
            </div>
            <h1 className="text-[17px] font-light tracking-tight text-[#ededed] mb-2">Integration Failed</h1>
            <p className="text-[13px] text-[#888888] font-light leading-relaxed mb-6">{errorMsg}</p>
            <Link href="/" className="text-[12px] font-medium text-[#ededed] bg-[#111111] px-4 py-2 rounded-lg hover:bg-white/[0.04] transition-colors inline-block tracking-wide">Return to Core</Link>
          </div>
        )}

        {status === "done" && (
          <div className="w-full rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] p-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#0F1A13] flex items-center justify-center mb-6">
               <CheckCircle2 className="w-5 h-5 text-[#85C89B]" />
            </div>
            <h1 className="text-[17px] font-light tracking-tight text-[#ededed] mb-2">Integration Complete</h1>
            <p className="text-[13px] text-[#888888] font-light leading-relaxed">Initializing dashboard sequence...</p>
          </div>
        )}

        {(status === "ready" || status === "joining") && (
          <div className="w-full rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] p-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#111111] border border-white/[0.04] flex items-center justify-center mb-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
               <UserPlus className="w-5 h-5 text-[#ededed]" />
            </div>
            <h1 className="text-[17px] font-light tracking-tight text-[#ededed] mb-2">Workspace Request</h1>
            <p className="text-[13px] text-[#888888] font-light leading-relaxed mb-8">
              {firebaseUser
                ? "You have been cleared to join this network. Proceed below."
                : "Initialize your profile before joining this workspace."}
            </p>
            {firebaseUser ? (
              <Button
                onClick={handleJoin}
                className="w-full"
                disabled={status === "joining"}
                id="accept-invite-btn"
              >
                {status === "joining" ? "Integrating..." : "Acknowledge & Join Workspace"}
              </Button>
            ) : (
              <Link
                href={`/signup?redirect=/join?token=${token}`}
                className="block w-full"
              >
                <Button className="w-full" id="signup-to-join">
                  Establish clearance
                </Button>
              </Link>
            )}
          </div>
        )}
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
