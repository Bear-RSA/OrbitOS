"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signUpSchema, SignUpInput } from "@/lib/validations/auth";
import { signUp } from "@/lib/firebase/auth";
import { friendlyAuthError } from "@/lib/firebase/auth-errors";
import { safeRedirect } from "@/lib/utils/safe-redirect";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { AuthTransition } from "@/components/ui/auth-transition";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  const isInvite = !!rawRedirect;
  const redirectPath = safeRedirect(rawRedirect, "/onboarding");

  const { user, loading, sessionStatus } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
  });

  // See the matching comment in the login page: redirecting an authenticated
  // visitor onward before the session cookie exists bounces them straight
  // back here, forever. Only move once the session is real.
  const canRedirect = Boolean(user) && sessionStatus === "ready";

  useEffect(() => {
    if (canRedirect) router.push(redirectPath);
  }, [canRedirect, redirectPath, router]);

  const sessionBroken = Boolean(user) && sessionStatus === "error";

  if (loading || (user && !sessionBroken)) {
    return <AuthTransition />;
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
        role: isInvite ? "MEMBER" : "OWNER",
        createdAt: Timestamp.now(),
      });

      router.push(redirectPath);
    } catch (err: unknown) {
      setError(friendlyAuthError(err, "Couldn't create your account. Try again in a moment."));
    }
  };

  return (
    <div className="animate-in fade-in duration-1000 slide-in-from-bottom-4">
      <div className="mb-8 text-center flex flex-col items-center">
        <h1 className="text-3xl font-light text-ink tracking-tight">
          {isInvite ? "Create your account" : "Create your workspace"}
        </h1>
        <p className="mt-3 text-[14px] text-ink-muted">
          {isInvite ? "You'll join your team's workspace next." : "Free for teams of three. No card needed."}
        </p>
      </div>

      <div className="rounded-[32px] bg-surface-sunken/80 backdrop-blur-3xl ring-1 ring-line/[0.05] shadow-overlay p-12 flex flex-col gap-8 relative overflow-hidden">
        {/* Decorative scanline or top bar */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-line/10 to-transparent" />
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-surface-control blur-[100px]" />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 relative z-10">
          <div className="space-y-3">
            <Label htmlFor="signup-name" className="text-ink-muted">Your name</Label>
            <Input
              id="signup-name"
              placeholder="Lerato Mokoena"
              autoComplete="name"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "signup-name-error" : undefined}
              className="bg-surface-sunken border-line/[0.03] focus:border-line/20 transition-all duration-500 h-14"
              {...register("name")}
            />
            {errors.name && (
              <p id="signup-name-error" role="alert" className="text-[13px] text-destructive mt-2 ml-1">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="signup-email" className="text-ink-muted">Work email</Label>
            <Input
              id="signup-email"
              type="email"
              placeholder="you@studio.co.za"
              autoComplete="email"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "signup-email-error" : undefined}
              className="bg-surface-sunken border-line/[0.03] focus:border-line/20 transition-all duration-500 h-14"
              {...register("email")}
            />
            {errors.email && (
              <p id="signup-email-error" role="alert" className="text-[13px] text-destructive mt-2 ml-1">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="signup-password" className="text-ink-muted">Password</Label>
            <Input
              id="signup-password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "signup-password-error" : undefined}
              className="bg-surface-sunken border-line/[0.03] focus:border-line/20 transition-all duration-500 h-14"
              {...register("password")}
            />
            {errors.password && (
              <p id="signup-password-error" role="alert" className="text-[13px] text-destructive mt-2 ml-1">{errors.password.message}</p>
            )}
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-destructive/5 ring-1 ring-destructive/20 p-5 mt-4">
              <p className="text-[13px] text-destructive font-medium leading-relaxed flex items-center gap-2">
                <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-destructive" />
                {error}
              </p>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full text-[14px] font-medium bg-ink-strong text-on-ink hover:bg-ink hover:text-on-ink transition-all duration-500 shadow-[0_0_20px_rgb(var(--ink-strong)_/_0.05)] hover:shadow-[0_0_30px_rgb(var(--ink-strong)_/_0.1)] border-0 h-14 rounded-2xl"
            disabled={isSubmitting}
            id="signup-submit"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-3">
                <Loader size={14} color="currentColor" />
                Creating your account…
              </div>
            ) : isInvite ? "Create account" : "Create workspace"}
          </Button>
        </form>
      </div>

      <div className="mt-12 flex flex-col items-center gap-4">
        <div className="h-px w-8 bg-surface-control" />
        <p className="text-center text-[14px] text-ink-muted">
          Already have an account?{" "}
          <Link
            href={searchParams.get("redirect") ? `/login?redirect=${encodeURIComponent(searchParams.get("redirect") as string)}` : "/login"}
            className="text-ink underline-offset-4 hover:text-ink-strong hover:underline transition-all duration-300 ml-1"
            id="go-to-login"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 min-h-[100dvh] w-full bg-base flex flex-col items-center justify-center gap-6 z-[100]">
        <Loader />
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
