"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase/client";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/brand/logo";
import type { User } from "@/types/auth";
import { GlassSurface } from "@/components/ui/glass-surface";


export default function MemberOnboardingPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [memberProfile, setMemberProfile] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [roleDescriptor, setRoleDescriptor] = useState("");
  const [bio, setBio] = useState("");
  // Signup already asks for a name. Only ask again when none is on file.
  const [nameOnFile, setNameOnFile] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
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
        if (data.role === "OWNER") {
          router.push("/dashboard");
          return;
        }

        // Guard: user hasn't accepted an invite yet (no org). /onboarding
        // explains what to do; /login would bounce a signed-in user away.
        if (!data.orgId) {
          router.push("/onboarding");
          return;
        }

        setMemberProfile(data);
        setName(data.name || "");
        setNameOnFile(!!data.name?.trim());

        // The greeting only; if this read fails the page still works.
        getDoc(doc(db, "organizations", data.orgId))
          .then((org) => setWorkspaceName(org.data()?.name?.trim() || null))
          .catch(() => {});
        setProfileLoading(false);
        return;
      }

      // Doc doesn't exist yet — retry if we haven't exhausted attempts
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return fetchProfile(uid, attempt + 1);
      }

      // Exhausted retries
      setProfileError("We couldn't find your profile yet. Reload the page in a few seconds.");
      setProfileLoading(false);
    } catch (err) {
      console.error("[MemberOnboarding] Profile fetch error:", err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return fetchProfile(uid, attempt + 1);
      }
      setProfileError("Couldn't load your profile. Check your connection, then try again.");
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
      <div className="min-h-[100dvh] w-full bg-ground flex flex-col items-center justify-center gap-6 animate-in fade-in duration-1000">
        <OrbitLoader />
        <div className="flex flex-col items-center gap-2">
          <span className="text-[12px] text-ink-dim">
            Loading your profile…
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-line/[0.04] to-transparent"></div>
        </div>
      </div>
    );
  }

  // --- Profile fetch error state ---
  if (profileError || !memberProfile) {
    return (
      <div className="min-h-[100dvh] w-full bg-ground flex flex-col items-center justify-center gap-6 animate-in fade-in duration-1000 p-4">
        <div className="w-full max-w-sm text-center">
          <GlassSurface fallback="bg-surface-container/95 backdrop-blur-2xl" tint="surface-control" className="rounded-[40px] border border-outline-variant/10 shadow-overlay p-8 sm:p-12">
            <div className="mx-auto w-12 h-12 rounded-full bg-orbit-red/[0.1] flex items-center justify-center mb-6">
              <AlertCircle className="w-5 h-5 text-orbit-red" aria-hidden />
            </div>
            <h1 className="text-[17px] font-light tracking-tight text-ink mb-2">Couldn&apos;t load your profile</h1>
            <p role="alert" className="text-[13px] text-ink-muted font-light leading-relaxed mb-6">
              {profileError || "Something went wrong loading your profile. Try again."}
            </p>
            <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </GlassSurface>
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
    } catch {
      setError("Couldn't save your profile. Try again.");
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    router.push("/dashboard");
  };

  return (
    <div className="min-h-[100dvh] bg-ground flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md animate-in fade-in duration-1000 slide-in-from-bottom-4">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-12 justify-center">
          <Logo size={40} />
          <span className="font-semibold text-ink text-lg tracking-tight">OrbitOS</span>
        </div>

        <div className="mb-10 text-center space-y-3">
          <h1 className="text-2xl font-light text-ink tracking-tight break-words">
            {workspaceName ? `Welcome to ${workspaceName}` : "Welcome to the workspace"}
          </h1>
          <p className="text-[13px] text-ink-muted font-light leading-relaxed max-w-sm mx-auto">
            Tell your team who you are. You can change this later in your profile.
          </p>
        </div>

        <GlassSurface fallback="bg-surface-container/95 backdrop-blur-2xl" tint="surface-control" className="rounded-[40px] border border-outline-variant/10 shadow-overlay p-8 sm:p-12">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Name — required, and only asked when signup didn't collect it */}
            {!nameOnFile && (
              <div className="space-y-2.5">
                <Label htmlFor="member-name">Your name</Label>
                <Input
                  id="member-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="member-title">Job title</Label>
                <span className="text-[12px] text-ink-dim">Optional</span>
              </div>
              <Input
                id="member-title"
                autoComplete="organization-title"
                value={roleDescriptor}
                onChange={(e) => setRoleDescriptor(e.target.value)}
                placeholder="e.g. Frontend engineer"
              />
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="member-bio">About you</Label>
                <span className="text-[12px] text-ink-dim">Optional</span>
              </div>
              <Textarea
                id="member-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="What do you focus on?"
              />
            </div>

            {error && (
              <div role="alert" className="rounded-xl bg-orbit-red/[0.1] ring-1 ring-orbit-red/20 px-4 py-3">
                <p className="text-[13px] text-orbit-red font-medium">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full mt-2"
              isLoading={isSubmitting}
              disabled={isSubmitting || !name.trim()}
              id="member-onboarding-submit"
            >
              {isSubmitting ? "Saving…" : "Continue to dashboard"}
            </Button>
          </form>
        </GlassSurface>

        <Button
          type="button"
          variant="ghost"
          onClick={handleSkip}
          className="mx-auto mt-6 flex"
        >
          Skip for now
        </Button>
      </div>
    </div>
  );
}
