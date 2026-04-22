"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signInSchema, SignInInput } from "@/lib/validations/auth";
import { signIn } from "@/lib/firebase/auth";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";

import { ScrambleText } from "@/components/ui/scramble-text";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  const redirectPath = rawRedirect ? decodeURIComponent(rawRedirect) : "/dashboard";
  
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
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

  const onSubmit = async (data: SignInInput) => {
    setError(null);
    try {
      await signIn(data.email, data.password);
      router.push(redirectPath);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Invalid email or password.";
      if (msg.includes("user-not-found") || msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setError("Invalid email or password. Please try again.");
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="animate-in fade-in duration-1000 slide-in-from-bottom-4">
      <div className="mb-8 text-center flex flex-col items-center">
        <h1 className="text-[10px] font-mono uppercase tracking-[0.5em] text-[#555555] mb-3">
          <ScrambleText text="Session Terminal" />
        </h1>
        <div className="text-3xl font-light text-[#ededed] tracking-tight">
          Authenticate Node
        </div>
      </div>

      <div className="rounded-[32px] bg-[#0A0A0A]/80 backdrop-blur-3xl ring-1 ring-white/[0.05] shadow-[0_40px_100px_rgba(0,0,0,0.8)] p-12 flex flex-col gap-8 relative overflow-hidden">
        {/* Decorative scanline or top bar */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-white/5 blur-[100px]" />
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 relative z-10">
          <div className="space-y-3">
            <Label htmlFor="login-email" className="text-[#888888]">Email Node</Label>
            <Input
              id="login-email"
              type="email"
              placeholder="operator@orbit.sys"
              autoComplete="email"
              className="bg-black/40 border-white/[0.03] focus:border-white/20 transition-all duration-500 h-14"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-[11px] font-mono text-destructive mt-2 ml-1">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="login-password" title="System Password" className="text-[#888888]">System Password</Label>
            <Input
              id="login-password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
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
            id="login-submit"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-3">
                <Loader size={14} color="currentColor" />
                <ScrambleText text="AUTHENTICATING..." />
              </div>
            ) : "Establish Session"}
          </Button>
        </form>
      </div>

      <div className="mt-12 flex flex-col items-center gap-4">
        <div className="h-px w-8 bg-white/[0.05]" />
        <p className="text-center text-[12px] text-[#555555] font-mono uppercase tracking-widest">
          No operating system yet?{" "}
          <Link 
            href={searchParams.get("redirect") ? `/signup?redirect=${encodeURIComponent(searchParams.get("redirect") as string)}` : "/signup"} 
            className="text-[#ededed] hover:text-white transition-all duration-300 ml-2" 
            id="go-to-signup"
          >
            Initialize workspace
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6 z-[100]">
        <Loader />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
