"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signUpSchema, SignUpInput } from "@/lib/validations/auth";
import { signUp } from "@/lib/firebase/auth";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";

import { ScrambleText } from "@/components/ui/scramble-text";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  const isInvite = !!rawRedirect;
  const redirectPath = rawRedirect ? decodeURIComponent(rawRedirect) : "/onboarding";

  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
  });

  if (loading || user) {
    if (user) {
      router.push(redirectPath);
    }
    return (
      <div className="fixed inset-0 min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6 z-[100]">
        <Loader color="#FF78E0" />
        <div className="flex flex-col items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-[#ededed]">
            <ScrambleText text="Node Initialization" />
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        </div>
      </div>
    );
  }

  const onSubmit = async (data: SignUpInput) => {
    setError(null);
    try {
      const credential = await signUp(data.email, data.password);
      const uid = credential.user.uid;

      await setDoc(doc(db, "users", uid), {
        id: uid,
        email: data.email,
        name: data.name,
        orgId: "",
        role: isInvite ? "member" : "owner",
        createdAt: Timestamp.now(),
      });

      router.push(redirectPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create account.";
      if (msg.includes("email-already-in-use")) {
        setError("An account with this email already exists.");
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="animate-in fade-in duration-1000 slide-in-from-bottom-4">
      <div className="mb-8 text-center flex flex-col items-center">
        <h1 className="text-[10px] font-mono uppercase tracking-[0.5em] text-[#555555] mb-3">
          <ScrambleText text="Network Genesis" />
        </h1>
        <div className="text-3xl font-light text-[#ededed] tracking-tight">
          Initialize Workspace
        </div>
      </div>

      <div className="rounded-[32px] bg-[#0A0A0A]/80 backdrop-blur-3xl ring-1 ring-white/[0.05] shadow-[0_40px_100px_rgba(0,0,0,0.8)] p-12 flex flex-col gap-8 relative overflow-hidden">
        {/* Decorative scanline or top bar */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-white/5 blur-[100px]" />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 relative z-10">
          <div className="space-y-3">
            <Label htmlFor="signup-name" className="text-[#888888]">Operator Identity</Label>
            <Input
              id="signup-name"
              placeholder="Designate identifier"
              autoComplete="name"
              className="bg-black/40 border-white/[0.03] focus:border-white/20 transition-all duration-500 h-14"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-[11px] font-mono text-destructive mt-2 ml-1">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="signup-email" className="text-[#888888]">Operational Endpoint</Label>
            <Input
              id="signup-email"
              type="email"
              placeholder="bear@orbit.sys"
              autoComplete="email"
              className="bg-black/40 border-white/[0.03] focus:border-white/20 transition-all duration-500 h-14"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-[11px] font-mono text-destructive mt-2 ml-1">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="signup-password" className="text-[#888888]">Security Protocol</Label>
            <Input
              id="signup-password"
              type="password"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              className="bg-black/40 border-white/[0.03] focus:border-white/20 transition-all duration-500 h-14"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-[11px] font-mono text-destructive mt-2 ml-1">{errors.password.message}</p>
            )}
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/5 ring-1 ring-destructive/20 p-5 mt-4">
              <p className="text-[12px] text-destructive font-medium leading-relaxed font-mono flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                {error}
              </p>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full text-[12px] font-mono uppercase tracking-[0.2em] bg-white text-black hover:bg-[#ededed] hover:text-black transition-all duration-500 shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] border-0 h-14 rounded-2xl"
            disabled={isSubmitting}
            id="signup-submit"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-3">
                <Loader size={14} color="currentColor" />
                <ScrambleText text="GENERATING NETWORK..." />
              </div>
            ) : "Deploy Workspace"}
          </Button>
        </form>
      </div>

      <div className="mt-12 flex flex-col items-center gap-4">
        <div className="h-px w-8 bg-white/[0.05]" />
        <p className="text-center text-[12px] text-[#555555] font-mono uppercase tracking-widest">
          Already have clearance?{" "}
          <Link
            href={searchParams.get("redirect") ? `/login?redirect=${encodeURIComponent(searchParams.get("redirect") as string)}` : "/login"}
            className="text-[#ededed] hover:text-white transition-all duration-300 ml-2"
            id="go-to-login"
          >
            Authenticate Session
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6 z-[100]">
        <Loader />
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
