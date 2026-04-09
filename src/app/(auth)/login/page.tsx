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
      <div className="mb-12 text-center space-y-3">
        <h1 className="text-3xl font-light text-on-surface tracking-tight">Welcome back</h1>
        <p className="text-[13px] text-on-surface-variant/60 font-medium tracking-wide">Access your operational workspace</p>
      </div>

      <div className="rounded-2xl bg-surface-lowest/80 backdrop-blur-3xl ring-1 ring-white/[0.03] shadow-[0_40px_100px_rgba(0,0,0,0.6)] p-12">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <div className="space-y-3">
            <Label htmlFor="login-email">Email Node</Label>
            <Input
              id="login-email"
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
            <Label htmlFor="login-password">System Password</Label>
            <Input
              id="login-password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
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
            id="login-submit"
          >
            {isSubmitting ? "Authenticating..." : "Establish Session"}
          </Button>
        </form>
      </div>

      <p className="text-center text-[13px] text-on-surface-variant/40 font-medium mt-12 tracking-wide">
        No operating system yet?{" "}
        <Link 
          href={searchParams.get("redirect") ? `/signup?redirect=${encodeURIComponent(searchParams.get("redirect") as string)}` : "/signup"} 
          className="text-on-surface hover:text-primary transition-colors underline-offset-8 hover:underline" 
          id="go-to-signup"
        >
          Initialize workspace
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 min-h-[100dvh] w-full bg-background flex flex-col items-center justify-center gap-6 z-[100]">
        <Loader />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
