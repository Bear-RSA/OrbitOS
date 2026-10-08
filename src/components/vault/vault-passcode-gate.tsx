"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ClipboardEvent } from "react";
import { Lock, Mail, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { Loader } from "@/components/ui/loader";
import {
  getVaultPasscodeStatusAction,
  requestVaultPasscodeResetAction,
  setVaultPasscodeAction,
  verifyVaultPasscodeAction,
} from "@/app/actions/vault-passcode";

/* ------------------------------------------------------------------ */
/*  The passcode gate                                                  */
/*                                                                     */
/*  Stands in for `VaultExplorer` until the caller has entered the      */
/*  workspace's 4-digit code. Enforcement lives server-side — this is    */
/*  the UI half of it, and it is only as good as `verifyVaultPasscodeAction`  */
/*  and the Firestore rule checking the same unlock record it writes.     */
/*                                                                        */
/*  Three audiences, three screens: an OWNER on a workspace with no        */
/*  passcode yet sets one; a MEMBER on the same workspace is told to ask;   */
/*  everyone else enters the code that is already set. */
/* ------------------------------------------------------------------ */

type Phase =
  | "checking"
  | "setup"
  | "no-passcode-member"
  | "enter"
  | "reset-sent";

const DIGIT_COUNT = 4;

interface VaultPasscodeGateProps {
  isOwner: boolean;
  onUnlocked: () => void;
}

export function VaultPasscodeGate({ isOwner, onUnlocked }: VaultPasscodeGateProps) {
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getVaultPasscodeStatusAction();
      if (cancelled) return;
      if (!result.success) {
        setPhase("enter");
        return;
      }
      setPhase(result.configured ? "enter" : isOwner ? "setup" : "no-passcode-member");
    })();
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  if (phase === "checking") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (phase === "no-passcode-member") {
    return (
      <GateShell icon={Lock} title="The vault is locked">
        <p className="text-[13px] leading-relaxed text-ink-dim">
          This workspace hasn&apos;t set a vault passcode yet. Ask your
          workspace owner to set one and share it with you.
        </p>
      </GateShell>
    );
  }

  if (phase === "reset-sent") {
    return (
      <GateShell icon={Mail} title="Check your email">
        <p role="status" className="text-[14px] leading-relaxed text-ink-muted">
          If a reset is available, a link to set a new vault passcode has
          been sent to your account email. It expires in 15 minutes.
        </p>
      </GateShell>
    );
  }

  if (phase === "setup") {
    return <SetupScreen onDone={onUnlocked} onFallback={() => setPhase("enter")} />;
  }

  return (
    <EntryScreen
      isOwner={isOwner}
      onUnlocked={onUnlocked}
      onResetSent={() => setPhase("reset-sent")}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Entry — the 4-box code                                             */
/* ------------------------------------------------------------------ */

function EntryScreen({
  isOwner,
  onUnlocked,
  onResetSent,
}: {
  isOwner: boolean;
  onUnlocked: () => void;
  onResetSent: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(DIGIT_COUNT).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const submit = async (candidate: string) => {
    setVerifying(true);
    setError(null);
    try {
      const result = await verifyVaultPasscodeAction(candidate);
      if (!result.success) {
        setError(result.error || "That passcode isn't right.");
        setDigits(Array(DIGIT_COUNT).fill(""));
        inputsRef.current[0]?.focus();
        return;
      }
      onUnlocked();
    } finally {
      setVerifying(false);
    }
  };

  /* Deliberately not a functional `setDigits(prev => ...)` update: React
     dev-mode double-invokes a state updater to surface impurities, and
     `focus()` / `submit()` as a side effect inside one fires twice — which
     read here as keystrokes landing in the wrong box or a submit skipped
     entirely. `digits` from the closure is safe because each keystroke is
     handled one at a time; nothing here batches multiple changes at once. */
  const handleChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = value;
    setDigits(next);

    if (value && index < DIGIT_COUNT - 1) {
      inputsRef.current[index + 1]?.focus();
    }
    if (value && index === DIGIT_COUNT - 1 && next.join("").length === DIGIT_COUNT) {
      void submit(next.join(""));
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, DIGIT_COUNT);
    if (!text) return;
    e.preventDefault();
    const next = Array(DIGIT_COUNT).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    if (text.length === DIGIT_COUNT) void submit(text);
    else inputsRef.current[text.length]?.focus();
  };

  const handleForgot = async () => {
    if (resetSending) return;
    setResetSending(true);
    setError(null);
    try {
      const result = await requestVaultPasscodeResetAction();
      if (!result.success) {
        setError(result.error);
        return;
      }
      onResetSent();
    } finally {
      setResetSending(false);
    }
  };

  return (
    <GateShell icon={Lock} title="Enter the vault passcode">
      <div role="group" aria-label="Vault passcode" aria-describedby={error ? "vault-passcode-error" : undefined} className="flex items-center justify-center gap-3">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={1}
            disabled={verifying}
            aria-invalid={error ? true : undefined}
            aria-label={`Passcode digit ${index + 1} of ${DIGIT_COUNT}`}
            className={cn(
              "h-14 w-12 rounded-xl bg-surface-raised text-center text-xl text-ink",
              "ring-1 ring-inset ring-line/[0.08] transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-focus disabled:opacity-50",
              error && "ring-orbit-red/40"
            )}
          />
        ))}
      </div>

      {/* One live region for both outcomes, so a screen reader hears the
          check start and then the verdict rather than nothing at all. */}
      <div aria-live="polite" className="mt-5 min-h-[20px] text-center text-[13px]">
        {verifying ? (
          <span className="inline-flex items-center gap-2 text-ink-muted">
            <Loader size={12} stroke={2.5} /> Unlocking…
          </span>
        ) : error ? (
          <p id="vault-passcode-error" role="alert" className="text-orbit-red">{error}</p>
        ) : null}
      </div>

      {isOwner ? (
        <button
          type="button"
          onClick={handleForgot}
          disabled={resetSending}
          className="mt-4 w-full rounded-lg py-1 text-center text-[13px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
        >
          {resetSending ? "Sending reset link…" : "Forgot the passcode?"}
        </button>
      ) : (
        <p className="mt-4 text-center text-[13px] text-ink-muted">
          Forgot it? Ask your workspace owner.
        </p>
      )}
    </GateShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Setup — first time an owner opens a workspace with none configured  */
/* ------------------------------------------------------------------ */

function SetupScreen({
  onDone,
  onFallback,
}: {
  onDone: () => void;
  onFallback: () => void;
}) {
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = useMemo(() => /^\d{4}$/.test(code) && code === confirm, [code, confirm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const set = await setVaultPasscodeAction(code);
      if (!set.success) {
        setError(set.error);
        return;
      }
      const verify = await verifyVaultPasscodeAction(code);
      if (!verify.success) {
        // Saved, but the unlock write failed — let them enter it fresh.
        onFallback();
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <GateShell icon={ShieldAlert} title="Set a vault passcode">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <p className="text-[14px] leading-relaxed text-ink-muted">
          Choose a 4-digit passcode for the vault. Share it with your team in
          person. It&apos;s never emailed or shown in the app once set.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <PasscodeField label="New passcode" value={code} onChange={setCode} />
          <PasscodeField label="Confirm passcode" value={confirm} onChange={setConfirm} />
        </div>

        {code.length === 4 && confirm.length === 4 && code !== confirm && (
          <p role="alert" className="text-[13px] text-orbit-red">The two passcodes don&apos;t match.</p>
        )}
        {error && <p role="alert" className="text-[13px] text-orbit-red">{error}</p>}

        <button
          type="submit"
          disabled={!ready || busy}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-ink text-on-ink text-[14px] font-medium transition-colors hover:bg-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <><Loader size={14} stroke={2.5} /> Saving…</> : "Set passcode"}
        </button>
      </form>
    </GateShell>
  );
}

function PasscodeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={4}
        className="h-12 w-full rounded-xl bg-surface-raised px-4 text-center text-lg tracking-[0.4em] text-ink ring-1 ring-inset ring-line/[0.08] transition-colors focus:outline-none focus:ring-2 focus:ring-focus"
      />
    </div>
  );
}

function GateShell({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Lock;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-line/[0.06] bg-surface-sunken">
        <Icon className="h-5 w-5 text-ink-dim" aria-hidden />
      </div>
      <h2 className="mb-8 text-xl font-light tracking-tight text-ink">{title}</h2>
      <div className="material-fog w-full rounded-[32px] border border-line/[0.06] p-10 text-left shadow-raised ring-1 ring-line/5">
        {children}
      </div>
    </div>
  );
}
