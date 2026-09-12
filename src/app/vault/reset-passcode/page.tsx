"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { resetVaultPasscodeAction } from "@/app/actions/vault-passcode";
import { Loader } from "@/components/ui/loader";

/* ------------------------------------------------------------------ */
/*  /vault/reset-passcode                                              */
/*                                                                     */
/*  Reached only from the link `requestVaultPasscodeResetAction` mails  */
/*  to the OWNER's own account address — there is no other way to        */
/*  arrive here, and no in-app button skips the email. The owner must     */
/*  still be signed into the workspace the link names: this closes the    */
/*  reset, it does not replace signing in. */
/* ------------------------------------------------------------------ */

function ResetPasscodeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const orgId = searchParams.get("orgId");
  const token = searchParams.get("token");

  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const ready = useMemo(() => /^\d{4}$/.test(code) && code === confirm, [code, confirm]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!orgId || !token) {
    return (
      <Shell title="Link Invalid">
        <Notice tone="error">
          This link is missing its reset code. Request a new one from Vault
          settings.
        </Notice>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell title="Sign In Required">
        <Notice tone="error">
          Sign in as this workspace&apos;s owner to finish resetting the Vault
          passcode.
        </Notice>
        <Link
          href={`/login?redirect=${encodeURIComponent(`/vault/reset-passcode?orgId=${orgId}&token=${token}`)}`}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-ink text-on-ink font-mono text-[11px] uppercase tracking-[0.18em] transition-colors hover:bg-ink-strong"
        >
          Sign In
        </Link>
      </Shell>
    );
  }

  if (user.role !== "OWNER" || user.orgId !== orgId) {
    return (
      <Shell title="Not Authorized">
        <Notice tone="error">
          Only the owner of this workspace can reset its Vault passcode.
        </Notice>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Passcode Reset">
        <Notice tone="success">
          The Vault passcode has been updated. Enter it the next time you
          open the Vault, and share the new code with your team by word of
          mouth.
        </Notice>
        <button
          type="button"
          onClick={() => router.push("/vault")}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-ink text-on-ink font-mono text-[11px] uppercase tracking-[0.18em] transition-colors hover:bg-ink-strong"
        >
          Go To The Vault
        </button>
      </Shell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await resetVaultPasscodeAction(orgId, token, code);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell title="Set A New Passcode">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <p className="text-[13px] leading-relaxed text-ink-dim">
          Choose a new 4-digit Vault passcode for{" "}
          <span className="font-mono text-ink">this workspace</span>.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <CodeField label="New passcode" value={code} onChange={setCode} />
          <CodeField label="Confirm passcode" value={confirm} onChange={setConfirm} />
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <button
          type="submit"
          disabled={!ready || submitting}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-ink text-on-ink font-mono text-[11px] uppercase tracking-[0.18em] transition-colors hover:bg-ink-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? <Loader size={14} stroke={2.5} /> : "Set New Passcode"}
        </button>
      </form>
    </Shell>
  );
}

function CodeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        className="h-12 w-full rounded-xl bg-surface-raised px-4 text-center text-lg tracking-[0.4em] text-ink ring-1 ring-inset ring-line/[0.08] transition-colors focus:outline-none focus:ring-focus"
      />
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === "error"
          ? "rounded-xl bg-destructive/5 p-5 ring-1 ring-destructive/20"
          : "rounded-xl bg-orbit-green/5 p-5 ring-1 ring-orbit-green/20"
      }
    >
      <p
        className={
          tone === "error"
            ? "flex items-start gap-2 font-mono text-[12px] font-medium leading-relaxed text-destructive"
            : "flex items-start gap-2 font-mono text-[12px] font-medium leading-relaxed text-orbit-green"
        }
      >
        <span
          className={
            tone === "error"
              ? "mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-destructive"
              : "mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-orbit-green"
          }
        />
        <span>{children}</span>
      </p>
    </div>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-base p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-line/[0.06] bg-surface-sunken">
            <ShieldAlert className="h-5 w-5 text-ink-dim" />
          </div>
          <h1 className="text-2xl font-light tracking-tight text-ink">{title}</h1>
        </div>
        <div className="rounded-[32px] bg-surface-sunken/80 p-10 ring-1 ring-inset ring-line/[0.05] shadow-overlay backdrop-blur-3xl">
          {children}
        </div>
        <div className="mt-10 flex justify-center">
          <Link
            href="/vault"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim transition-colors hover:text-ink-muted"
          >
            Back to the Vault
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetVaultPasscodePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-base">
          <Loader />
        </div>
      }
    >
      <ResetPasscodeForm />
    </Suspense>
  );
}
