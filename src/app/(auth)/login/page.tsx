"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function LoginPage() {
  const router = useRouter();
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

  const onSubmit = async (data: SignInInput) => {
    setError(null);
    try {
      await signIn(data.email, data.password);
      router.push("/dashboard");
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
    <div className="animate-fade-in">
      <div className="mb-10 text-center">
        <h1 className="text-2xl font-light text-[#ededed] tracking-tight">Welcome back</h1>
        <p className="text-[13px] text-[#888888] font-medium mt-2">Access your workspace</p>
      </div>

      <div className="rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
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
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
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
            id="login-submit"
          >
            {isSubmitting ? "Authenticating..." : "Sign in"}
          </Button>
        </form>
      </div>

      <p className="text-center text-[13px] text-[#666666] font-medium mt-8">
        No operating system yet?{" "}
        <Link href="/signup" className="text-[#ededed] hover:text-[#ffffff] transition-colors" id="go-to-signup">
          Initialize workspace
        </Link>
      </p>
    </div>
  );
}
