"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { applyActionCode } from "firebase/auth";

import { newPasswordSchema, NewPasswordInput } from "@/lib/validations/auth";
import { auth } from "@/lib/firebase/client";
import {
  checkResetCode,
  completePasswordReset,
  describeResetError,
  errorCode,
} from "@/lib/firebase/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { ScrambleText } from "@/components/ui/scramble-text";

/**
 * The Firebase email action handler.
 *
 * Reached from the link in a password-reset email once the action URL is
 * pointed here (Firebase console -> Authentication -> Templates -> "Customise
 * action URL"). Until that is set, the Firebase-hosted page handles the link
 * instead and this page is simply never reached — /forgot-password works
 * either way.
 *
 * That single action URL serves every email template, so `mode` is honoured
 * rather than assumed: an email-verification link landing here must not be
 * met with a "set a new password" form.
 */
type Phase = "verifying" | "form" | "done" | "verified-email" | "invalid";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") ?? "resetPassword";
  const oobCode = searchParams.get("oobCode");

  const [phase, setPhase] = useState<Phase>("verifying");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
  });

  // Check the code before rendering the form. Discovering it is expired only
  // after the user has typed a new password twice is the worst possible
  // moment to tell them.
  useEffect(() => {
    let cancelled = false;

    if (!oobCode) {
      setError("This link is missing its reset code. Request a new one below.");
      setPhase("invalid");
      return;
    }

    void (async () => {
      try {
        if (mode === "verifyEmail" || mode === "recoverEmail") {
          await applyActionCode(auth, oobCode);
          if (cancelled) return;
          setPhase("verified-email");
          return;
        }

        const email = await checkResetCode(oobCode);
        if (cancelled) return;
        setAccountEmail(email);
        setPhase("form");
      } catch (err) {
        if (cancelled) return;
        console.error("[ResetPassword] Code verification failed", err);
        setError(describeResetError(errorCode(err)));
        setPhase("invalid");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  const onSubmit = async (data: NewPasswordInput) => {
    if (!oobCode) return;
    setError(null);
    try {
      await completePasswordReset(oobCode, data.password);
      setPhase("done");
    } catch (err) {
      console.error("[ResetPassword] Reset failed", err);
      const code = errorCode(err);
      setError(describeResetError(code));
      // A spent or expired code cannot be retried from this form — send them
      // back for a fresh link rather than leaving a dead form on screen.
      if (
        code === "auth/expired-action-code" ||
        code === "auth/invalid-action-code"
      ) {
        setPhase("invalid");
      }
    }
  };

  const heading =
    phase === "done"
      ? "Access Key Rotated"
      : phase === "verified-email"
        ? "Email Confirmed"
        : phase === "invalid"
          ? "Link Expired"
          : "Set New Access Key";

  return (
    <div className="animate-in fade-in duration-1000 slide-in-from-bottom-4">
      <div className="mb-8 text-center flex flex-col items-center">
        <h1 className="text-[10px] font-mono uppercase tracking-[0.5em] text-ink-dim mb-3">
          <ScrambleText text="Credential Recovery" />
        </h1>
        <div className="text-3xl font-light text-ink tracking-tight">{heading}</div>
      </div>

      <div className="rounded-[32px] bg-surface-sunken/80 backdrop-blur-3xl ring-1 ring-line/[0.05] shadow-overlay p-12 flex flex-col gap-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-line/10 to-transparent" />
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-surface-control blur-[100px]" />

        {phase === "verifying" && (
          <div className="relative z-10 flex flex-col items-center gap-4 py-8">
            <Loader />
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-ink-dim">
              <ScrambleText text="VERIFYING LINK..." />
            </p>
          </div>
        )}

        {phase === "invalid" && (
          <div className="relative z-10 space-y-6">
            <div className="rounded-xl bg-destructive/5 ring-1 ring-destructive/20 p-5">
              <p className="text-[12px] text-destructive font-medium leading-relaxed font-mono flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse mt-1.5 shrink-0" />
                <span>{error}</span>
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              className="w-full text-[12px] font-mono uppercase tracking-[0.2em] bg-ink-strong text-black hover:bg-ink hover:text-black transition-all duration-500 border-0 h-14 rounded-2xl"
              onClick={() => router.push("/forgot-password")}
              id="reset-request-new"
            >
              Request A New Link
            </Button>
          </div>
        )}

        {phase === "verified-email" && (
          <div className="relative z-10 space-y-6">
            <div className="rounded-xl bg-orbit-green/5 ring-1 ring-orbit-green/20 p-5">
              <p className="text-[12px] text-orbit-green font-medium leading-relaxed font-mono flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orbit-green animate-pulse mt-1.5 shrink-0" />
                <span>Your email address is confirmed.</span>
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              className="w-full text-[12px] font-mono uppercase tracking-[0.2em] bg-ink-strong text-black hover:bg-ink hover:text-black transition-all duration-500 border-0 h-14 rounded-2xl"
              onClick={() => router.push("/login")}
            >
              Continue To Sign In
            </Button>
          </div>
        )}

        {phase === "done" && (
          <div className="relative z-10 space-y-6">
            <div className="rounded-xl bg-orbit-green/5 ring-1 ring-orbit-green/20 p-5">
              <p className="text-[12px] text-orbit-green font-medium leading-relaxed font-mono flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orbit-green animate-pulse mt-1.5 shrink-0" />
                <span>
                  Password updated{accountEmail ? ` for ${accountEmail}` : ""}.
                  Sign in with it now.
                </span>
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              className="w-full text-[12px] font-mono uppercase tracking-[0.2em] bg-ink-strong text-black hover:bg-ink hover:text-black transition-all duration-500 border-0 h-14 rounded-2xl"
              onClick={() => router.push("/login")}
              id="reset-go-to-login"
            >
              Establish Session
            </Button>
          </div>
        )}

        {phase === "form" && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 relative z-10">
            <p className="text-[13px] font-light leading-relaxed text-ink-muted">
              Choose a new password for{" "}
              <span className="font-mono text-ink">{accountEmail}</span>.
            </p>

            <div className="space-y-3">
              <Label htmlFor="reset-password" className="text-ink-muted">New Password</Label>
              <Input
                id="reset-password"
                type="password"
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                autoFocus
                className="bg-surface-sunken border-line/[0.03] focus:border-line/20 transition-all duration-500 h-14"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-[11px] font-mono text-destructive mt-2 ml-1">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-3">
              <Label htmlFor="reset-confirm" className="text-ink-muted">Confirm Password</Label>
              <Input
                id="reset-confirm"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                className="bg-surface-sunken border-line/[0.03] focus:border-line/20 transition-all duration-500 h-14"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-[11px] font-mono text-destructive mt-2 ml-1">{errors.confirmPassword.message}</p>
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
              className="w-full text-[12px] font-mono uppercase tracking-[0.2em] bg-ink-strong text-black hover:bg-ink hover:text-black transition-all duration-500 shadow-[0_0_20px_rgb(var(--ink-strong)_/_0.05)] hover:shadow-[0_0_30px_rgb(var(--ink-strong)_/_0.1)] border-0 h-14 rounded-2xl"
              disabled={isSubmitting}
              id="reset-submit"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-3">
                  <Loader size={14} color="currentColor" />
                  <ScrambleText text="ROTATING KEY..." />
                </div>
              ) : "Set New Password"}
            </Button>
          </form>
        )}
      </div>

      <div className="mt-12 flex flex-col items-center gap-4">
        <div className="h-px w-8 bg-surface-control" />
        <p className="text-center text-[12px] text-ink-dim font-mono uppercase tracking-widest">
          <Link
            href="/login"
            className="text-ink hover:text-ink-strong transition-all duration-300"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 min-h-[100dvh] w-full bg-base flex flex-col items-center justify-center gap-6 z-[100]">
        <Loader />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
