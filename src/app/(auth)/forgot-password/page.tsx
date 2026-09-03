"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  passwordResetRequestSchema,
  PasswordResetRequestInput,
} from "@/lib/validations/auth";
import { requestPasswordResetAction } from "@/app/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { ScrambleText } from "@/components/ui/scramble-text";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestSchema),
    // Prefill from ?email= so a bounce off the login form does not make the
    // user retype the address they just entered.
    defaultValues: { email: searchParams.get("email") ?? "" },
  });

  // Dispatch runs server-side: the link is minted with the Admin SDK and
  // carried by Resend, so nothing here touches Firebase's built-in mailer.
  const send = async (email: string) => {
    setError(null);
    try {
      const result = await requestPasswordResetAction(email);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setSentTo(email);
      return true;
    } catch (err) {
      console.error("[ForgotPassword] Reset request failed", err);
      setError("Could not reach the server. Check your connection and try again.");
      return false;
    }
  };

  const onSubmit = (data: PasswordResetRequestInput) => send(data.email);

  // Resends against the address already confirmed, rather than re-reading a
  // field that is unmounted while the confirmation is on screen.
  const onResend = async () => {
    if (!sentTo || resending) return;
    setResending(true);
    try {
      await send(sentTo);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-1000 slide-in-from-bottom-4">
      <div className="mb-8 text-center flex flex-col items-center">
        <h1 className="text-[10px] font-mono uppercase tracking-[0.5em] text-ink-dim mb-3">
          <ScrambleText text="Credential Recovery" />
        </h1>
        <div className="text-3xl font-light text-ink tracking-tight">
          Reset Access Key
        </div>
      </div>

      <div className="rounded-[32px] bg-surface-sunken/80 backdrop-blur-3xl ring-1 ring-line/[0.05] shadow-overlay p-12 flex flex-col gap-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-line/10 to-transparent" />
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-surface-control blur-[100px]" />

        {sentTo ? (
          <div className="relative z-10 space-y-6">
            <div className="rounded-xl bg-orbit-green/5 ring-1 ring-orbit-green/20 p-5">
              <p className="text-[12px] text-orbit-green font-medium leading-relaxed font-mono flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orbit-green animate-pulse mt-1.5 shrink-0" />
                <span>
                  If an account exists for {sentTo}, a reset link is on its way.
                  It expires in one hour.
                </span>
              </p>
            </div>
            <p className="text-[12px] font-light leading-relaxed text-ink-dim">
              Nothing in your inbox after a minute? Check the spam folder, then
              request another link.
            </p>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-[12px] font-mono uppercase tracking-[0.2em] h-14 rounded-2xl"
              onClick={onResend}
              disabled={resending}
            >
              {resending ? (
                <div className="flex items-center gap-3">
                  <Loader size={14} color="currentColor" />
                  <ScrambleText text="RESENDING..." />
                </div>
              ) : "Send another link"}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 relative z-10">
            <p className="text-[13px] font-light leading-relaxed text-ink-muted">
              Enter the email tied to your workspace. We will send a link that
              lets you set a new password.
            </p>

            <div className="space-y-3">
              <Label htmlFor="forgot-email" className="text-ink-muted">Email Node</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="bear@orbit.sys"
                autoComplete="email"
                autoFocus
                className="bg-surface-sunken border-line/[0.03] focus:border-line/20 transition-all duration-500 h-14"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-[11px] font-mono text-destructive mt-2 ml-1">{errors.email.message}</p>
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
              id="forgot-submit"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-3">
                  <Loader size={14} color="currentColor" />
                  <ScrambleText text="TRANSMITTING..." />
                </div>
              ) : "Send Reset Link"}
            </Button>
          </form>
        )}
      </div>

      <div className="mt-12 flex flex-col items-center gap-4">
        <div className="h-px w-8 bg-surface-control" />
        <p className="text-center text-[12px] text-ink-dim font-mono uppercase tracking-widest">
          Remembered it?{" "}
          <Link
            href="/login"
            className="text-ink hover:text-ink-strong transition-all duration-300 ml-2"
            id="back-to-login"
          >
            Authenticate Session
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 min-h-[100dvh] w-full bg-base flex flex-col items-center justify-center gap-6 z-[100]">
        <Loader />
      </div>
    }>
      <ForgotPasswordForm />
    </Suspense>
  );
}
