"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function SignupPage() {
  const router = useRouter();
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
      router.push("/dashboard");
    }
    return (
      <div className="fixed inset-0 min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6 z-[100]">
        <Loader />
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#555555]">
            System Rendering
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-[#111111] to-transparent"></div>
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
        role: "owner",
        createdAt: Timestamp.now(),
      });

      router.push("/onboarding");
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
    <div className="animate-fade-in">
      <div className="mb-10 text-center">
        <h1 className="text-2xl font-light text-[#ededed] tracking-tight">Initialize Workspace</h1>
        <p className="text-[13px] text-[#888888] font-medium mt-2">Get operational in under 5 minutes</p>
      </div>

      <div className="rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2.5">
            <Label htmlFor="signup-name">Operator Name</Label>
            <Input
              id="signup-name"
              placeholder="Your name"
              autoComplete="name"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-[#E57A7A] mt-1">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="signup-email">Work Email</Label>
            <Input
              id="signup-email"
              type="email"
              placeholder="you@studio.co.za"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-[#E57A7A] mt-1">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="signup-password">System Password</Label>
            <Input
              id="signup-password"
              type="password"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-[#E57A7A] mt-1">{errors.password.message}</p>
            )}
          </div>

          {error && (
            <div className="rounded-xl bg-[#1A0A0A] ring-1 ring-[#FF6B6B]/20 px-4 py-3">
              <p className="text-[13px] text-[#E57A7A] font-medium">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full mt-2"
            disabled={isSubmitting}
            id="signup-submit"
          >
            {isSubmitting ? "Generating network..." : "Deploy Workspace"}
          </Button>
        </form>
      </div>

      <p className="text-center text-[13px] text-[#666666] font-medium mt-8">
        Already have clearance?{" "}
        <Link href="/login" className="text-[#ededed] hover:text-[#ffffff] transition-colors" id="go-to-login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
