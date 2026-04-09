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
      <div className="fixed inset-0 min-h-[100dvh] w-full bg-background flex flex-col items-center justify-center gap-6 z-[100]">
        <Loader />
        <div className="flex flex-col items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-on-surface-variant/40">
            Node Initialization
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-outline-variant/20 to-transparent"></div>
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
      <div className="mb-12 text-center space-y-3">
        <h1 className="text-3xl font-light text-on-surface tracking-tight">Initialize Workspace</h1>
        <p className="text-[13px] text-on-surface-variant/60 font-medium tracking-wide">Get operational in under 5 minutes</p>
      </div>

      <div className="rounded-2xl bg-surface-lowest/80 backdrop-blur-3xl ring-1 ring-white/[0.03] shadow-[0_40px_100px_rgba(0,0,0,0.6)] p-12">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <div className="space-y-3">
            <Label htmlFor="signup-name">Operator Identity</Label>
            <Input
              id="signup-name"
              placeholder="Your name"
              autoComplete="name"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-[11px] font-mono text-destructive mt-2 ml-1">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="signup-email">Operational Endpoint</Label>
            <Input
              id="signup-email"
              type="email"
              placeholder="you@studio.co.za"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-[11px] font-mono text-destructive mt-2 ml-1">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="signup-password">Security Protocol</Label>
            <Input
              id="signup-password"
              type="password"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-[11px] font-mono text-destructive mt-2 ml-1">{errors.password.message}</p>
            )}
          </div>

          {error && (
            <div className="rounded-2xl bg-destructive/10 ring-1 ring-destructive/20 p-5 mt-4">
              <p className="text-[12px] text-destructive font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full text-[13px] tracking-wide font-medium"
            disabled={isSubmitting}
            id="signup-submit"
          >
            {isSubmitting ? "Generating network..." : "Deploy Workspace"}
          </Button>
        </form>
      </div>

      <p className="text-center text-[13px] text-on-surface-variant/40 font-medium mt-12 tracking-wide">
        Already have clearance?{" "}
        <Link 
          href={searchParams.get("redirect") ? `/login?redirect=${encodeURIComponent(searchParams.get("redirect") as string)}` : "/login"} 
          className="text-on-surface hover:text-primary transition-colors underline-offset-8 hover:underline" 
          id="go-to-login"
        >
          Authenticate Session
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 min-h-[100dvh] w-full bg-background flex flex-col items-center justify-center gap-6 z-[100]">
        <Loader />
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
