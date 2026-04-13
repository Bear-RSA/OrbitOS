"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase/client";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Loader } from "@/components/ui/loader";
import { Users, ArrowRight, ChevronRight, AlertCircle } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import type { User } from "@/types/auth";


export default function MemberOnboardingPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [memberProfile, setMemberProfile] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [roleDescriptor, setRoleDescriptor] = useState("");
  const [bio, setBio] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Independently fetch the user profile from Firestore with retry.
  // After invite redemption the server action creates the doc via admin SDK,
  // but the client auth context may still have user = null. This polling
  // ensures the member onboarding page picks up the newly-created profile.
  const fetchProfile = useCallback(async (uid: string, attempt = 1): Promise<void> => {
    const MAX_ATTEMPTS = 6;
    const RETRY_DELAY_MS = 1500;

    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as User;

        // Guard: owners should not see member onboarding
        if (data.role === "owner") {
          router.push("/dashboard");
          return;
        }

        // Guard: user hasn't accepted an invite yet (no org)
        if (!data.orgId) {
          router.push("/login");
          return;
        }

        setMemberProfile(data);
        setName(data.name || "");
        setProfileLoading(false);
        return;
      }

      // Doc doesn't exist yet — retry if we haven't exhausted attempts
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return fetchProfile(uid, attempt + 1);
      }

      // Exhausted retries
      setProfileError("Unable to locate your profile. The invite may still be processing — please refresh.");
      setProfileLoading(false);
    } catch (err) {
      console.error("[MemberOnboarding] Profile fetch error:", err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return fetchProfile(uid, attempt + 1);
      }
      setProfileError("Failed to load your profile. Please check your connection and try again.");
      setProfileLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (authLoading) return;

    if (!firebaseUser) {
      router.push("/login");
      return;
    }

    fetchProfile(firebaseUser.uid);
  }, [authLoading, firebaseUser, router, fetchProfile]);

  // --- Loading state ---
  if (authLoading || profileLoading) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6 animate-in fade-in duration-1000">
        <Loader />
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#555555]">
            Preparing Workspace
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"></div>
        </div>
      </div>
    );
  }

  // --- Profile fetch error state ---
  if (profileError || !memberProfile) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6 animate-in fade-in duration-1000 p-4">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-[40px] bg-surface-container/95 border border-outline-variant/10 backdrop-blur-2xl shadow-[0_40px_100px_rgba(0,0,0,0.6)] p-12">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#1A0A0A] flex items-center justify-center mb-6">
              <AlertCircle className="w-5 h-5 text-[#E57A7A]" />
            </div>
            <h1 className="text-[17px] font-light tracking-tight text-[#ededed] mb-2">Profile Sync Failed</h1>
            <p className="text-[13px] text-[#888888] font-light leading-relaxed mb-6">
              {profileError || "Could not resolve your profile."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-[12px] font-medium text-[#ededed] bg-[#111111] px-5 py-2.5 rounded-lg border border-white/[0.04] hover:bg-white/[0.04] transition-all inline-block tracking-wide"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Form handlers ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await updateDoc(doc(db, "users", memberProfile.id), {
        name: name.trim(),
        ...(roleDescriptor.trim() && { roleDescriptor: roleDescriptor.trim() }),
        ...(bio.trim() && { bio: bio.trim() }),
      });
      router.push("/dashboard");
    } catch (err) {
      setError("Failed to save your profile. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    router.push("/dashboard");
  };

  return (
    <div className="min-h-[100dvh] bg-[#050505] flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md animate-in fade-in duration-1000 slide-in-from-bottom-4">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-12 justify-center">
          <Logo size={40} />
          <span className="font-semibold text-[#ededed] text-lg tracking-tight">OrbitOS</span>
        </div>

        {/* Welcome Header */}
        <div className="mb-10 text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/[0.04] bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] text-[12px] font-medium text-[#ededed] mb-4">
            <Users className="w-3.5 h-3.5 text-[#888888]" />
            <span>Member</span>
          </div>
          <h1 className="text-2xl font-light text-[#ededed] tracking-tight">
            Welcome to the workspace
          </h1>
          <p className="text-[13px] text-[#888888] font-light leading-relaxed max-w-sm mx-auto">
            Complete your profile so your team knows who you are. You can update these details anytime.
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-[40px] bg-surface-container/95 border border-outline-variant/10 backdrop-blur-2xl shadow-[0_40px_100px_rgba(0,0,0,0.6)] p-12">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Full Name — required */}
            <div className="space-y-3">
              <label className="text-[10px] font-mono text-[#555555] uppercase tracking-[0.3em] block">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                className="w-full bg-[#111111] border border-white/[0.04] rounded-xl h-12 px-5 text-[14px] font-light text-[#ededed] placeholder:text-[#333333] transition-all focus:outline-none focus:border-[#555555] shadow-inner"
              />
            </div>

            {/* Role / Title — optional */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono text-[#555555] uppercase tracking-[0.3em] block">
                  Role / Title
                </label>
                <span className="text-[8px] font-mono text-[#555555] uppercase tracking-widest">Optional</span>
              </div>
              <input
                type="text"
                value={roleDescriptor}
                onChange={(e) => setRoleDescriptor(e.target.value)}
                placeholder="e.g. Frontend Engineer, Designer..."
                className="w-full bg-[#111111] border border-white/[0.04] rounded-xl h-12 px-5 text-[14px] font-light text-[#ededed] placeholder:text-[#333333] transition-all focus:outline-none focus:border-[#555555] shadow-inner"
              />
            </div>

            {/* Bio — optional */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono text-[#555555] uppercase tracking-[0.3em] block">
                  Short Bio
                </label>
                <span className="text-[8px] font-mono text-[#555555] uppercase tracking-widest">Optional</span>
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="What do you focus on?"
                className="w-full bg-[#111111] border border-white/[0.04] rounded-xl p-5 text-[14px] font-light text-[#ededed] min-h-[100px] resize-none placeholder:text-[#333333] transition-all focus:outline-none focus:border-[#555555] shadow-inner"
              />
            </div>

            {error && (
              <div className="rounded-xl bg-[#1A0A0A] ring-1 ring-[#E57A7A]/20 px-4 py-3">
                <p className="text-[13px] text-[#E57A7A] font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="w-full h-12 rounded-xl bg-[#ededed] text-[#050505] font-bold text-[13px] tracking-tight transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white hover:-translate-y-[2px] disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-[#ededed] disabled:cursor-not-allowed shadow-[0_2px_12px_rgba(255,255,255,0.06)] outline-none flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader size={14} stroke={2.5} color="#050505" />
                  <span>Setting up...</span>
                </>
              ) : (
                <>
                  <span>Enter Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Skip */}
        <button
          onClick={handleSkip}
          className="w-full text-center text-[13px] text-[#555555] font-light mt-8 hover:text-[#888888] transition-colors flex items-center justify-center gap-2 outline-none"
        >
          Skip for now
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
