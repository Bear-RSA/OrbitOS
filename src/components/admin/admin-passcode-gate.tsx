"use client";

import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Eye, EyeOff, KeyRound, Lock, Mail, ShieldAlert } from "lucide-react";

import {
  requestAdminPasscodeResetAction,
  resetAdminPasscodeAction,
  setAdminPasscodeAction,
  verifyAdminPasscodeAction,
} from "@/app/actions/admin-tools";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Loader } from "@/components/ui/loader";
import { ADMIN_PASSCODE_LENGTH } from "@/lib/internal-management/rules";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  The Admin Tools passcode gate                                      */
/*                                                                     */
/*  The Vault gate's shape with six digits. Three screens: set the     */
/*  first passcode, enter it, or set a new one from an emailed reset   */
/*  link. Enforcement is on the server (`requireAdminTools`); this is  */
/*  the half that asks.                                                */
/* ------------------------------------------------------------------ */

const DIGITS = ADMIN_PASSCODE_LENGTH;

export function AdminPasscodeGate({
  passcodeSet,
  resetToken,
  onUnlocked,
}: {
  passcodeSet: boolean;
  /** From an emailed reset link, when the page was opened by one. */
  resetToken: string | null;
  onUnlocked: () => void;
}) {
  const [resetSent, setResetSent] = useState(false);

  if (resetToken) {
    return (
      <NewPasscodeScreen
        icon={KeyRound}
        title="Set a new Admin Tools passcode"
        intro="Choose a new 6-digit passcode. It replaces the old one for everyone in Internal Management."
        submit={(code) => resetAdminPasscodeAction(resetToken, code)}
        onDone={onUnlocked}
      />
    );
  }

  if (!passcodeSet) {
    return (
      <NewPasscodeScreen
        title="Set the Admin Tools passcode"
        intro="Admin Tools controls every rank, billing and Internal Management itself, so it has its own 6-digit passcode. Share it only with the others in Internal Management."
        submit={setAdminPasscodeAction}
        onDone={onUnlocked}
      />
    );
  }

  if (resetSent) {
    return (
      <GateShell icon={Mail} title="Check your email">
        <p role="status" className="text-[14px] leading-relaxed text-ink-muted">
          A link to set a new passcode is on its way to your account email. It expires in 15 minutes.
        </p>
      </GateShell>
    );
  }

  return <EntryScreen onUnlocked={onUnlocked} onResetSent={() => setResetSent(true)} />;
}

function EntryScreen({ onUnlocked, onResetSent }: { onUnlocked: () => void; onResetSent: () => void }) {
  const [digits, setDigits] = useState<string[]>(() => Array(DIGITS).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [visible, setVisible] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const submit = async (candidate: string) => {
    setVerifying(true);
    setError(null);
    try {
      const result = await verifyAdminPasscodeAction(candidate);
      if (!result.success) {
        setError(result.error);
        setDigits(Array(DIGITS).fill(""));
        inputsRef.current[0]?.focus();
        return;
      }
      onUnlocked();
    } finally {
      setVerifying(false);
    }
  };

  /* Not a functional update, for the reason the Vault gate gives: a
     side effect inside an updater runs twice in dev. */
  const handleChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, "").slice(-1);
    if (raw && !value) {
      setError("Numbers only: the passcode is 6 digits.");
      return;
    }
    const next = [...digits];
    next[index] = value;
    setDigits(next);

    if (value && index < DIGITS - 1) inputsRef.current[index + 1]?.focus();
    if (value && index === DIGITS - 1 && next.join("").length === DIGITS) void submit(next.join(""));
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputsRef.current[index - 1]?.focus();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, DIGITS);
    if (!text) return;
    e.preventDefault();
    const next = Array(DIGITS).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    if (text.length === DIGITS) void submit(text);
    else inputsRef.current[text.length]?.focus();
  };

  const handleForgot = async () => {
    if (resetSending) return;
    setResetSending(true);
    setError(null);
    try {
      const result = await requestAdminPasscodeResetAction();
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
    <GateShell icon={Lock} title="Enter the Admin Tools passcode">
      <div
        role="group"
        aria-label="Admin Tools passcode"
        aria-describedby={error ? "admin-passcode-error" : undefined}
        className="flex items-center justify-center gap-2 sm:gap-3"
      >
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
            type={visible ? "text" : "password"}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={1}
            disabled={verifying}
            aria-invalid={error ? true : undefined}
            aria-label={`Passcode digit ${index + 1} of ${DIGITS}`}
            className={cn(
              "h-14 w-10 rounded-xl bg-surface-control text-center text-xl text-ink-strong caret-ink-strong sm:w-12",
              "ring-1 ring-inset ring-line/[0.08] transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-focus disabled:opacity-50",
              error && "ring-orbit-red/40"
            )}
          />
        ))}
      </div>

      <div className="mt-4 flex justify-center">
        <VisibilityToggle visible={visible} onToggle={() => setVisible((v) => !v)} />
      </div>

      <div aria-live="polite" className="mt-3 min-h-[20px] text-center text-[13px]">
        {verifying ? (
          <span className="inline-flex items-center gap-2 text-ink-muted">
            <Loader size={12} stroke={2.5} /> Unlocking…
          </span>
        ) : error ? (
          <p id="admin-passcode-error" role="alert" className="text-orbit-red">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={handleForgot}
        disabled={resetSending}
        className="mt-4 w-full rounded-lg py-1 text-center text-[13px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
      >
        {resetSending ? "Sending reset link…" : "Forgot the passcode?"}
      </button>
    </GateShell>
  );
}

/** Set a passcode: the first one, or a new one from a reset link. */
export function NewPasscodeScreen({
  title,
  intro,
  submit,
  onDone,
  bare = false,
  icon = ShieldAlert,
}: {
  icon?: typeof Lock;
  title: string;
  intro: string;
  submit: (code: string) => Promise<{ success: true } | { success: false; error: string }>;
  onDone: () => void;
  /** Without the gate's card, for use inside Admin Tools. */
  bare?: boolean;
}) {
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One switch for both fields, so you can check they match by eye.
  const [visible, setVisible] = useState(false);

  const complete = code.length === DIGITS && confirm.length === DIGITS;
  const ready = complete && code === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submit(code);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setCode("");
      setConfirm("");
      // Hidden is always where a passcode field starts.
      setVisible(false);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <p className="text-[14px] leading-relaxed text-ink-muted">{intro}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <PasscodeField
          label="New passcode"
          value={code}
          onChange={setCode}
          visible={visible}
          onToggleVisible={() => setVisible((v) => !v)}
        />
        <PasscodeField
          label="Confirm passcode"
          value={confirm}
          onChange={setConfirm}
          visible={visible}
          onToggleVisible={() => setVisible((v) => !v)}
        />
      </div>

      {complete && code !== confirm && (
        <p role="alert" className="text-[13px] text-orbit-red">
          The two passcodes don&apos;t match.
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-orbit-red">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready || busy}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-ink text-[14px] font-medium text-on-ink transition-colors hover:bg-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <Loader size={14} stroke={2.5} /> Saving…
          </>
        ) : (
          "Save passcode"
        )}
      </button>
    </form>
  );

  if (bare) return form;
  return (
    <GateShell icon={icon} title={title}>
      {form}
    </GateShell>
  );
}

function PasscodeField({
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  const id = useId();
  const hintId = useId();
  // Letters are dropped, so say so rather than leave the field looking dead.
  const [refused, setRefused] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-2 flex items-center justify-between text-[13px] text-ink-muted">
        {label}
        {/* How many of the six are in, readable even while the digits are hidden. */}
        <span className="font-mono text-[11px] tabular-nums text-ink-dim">
          {value.length}/{DIGITS}
        </span>
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            setRefused(digits.length !== e.target.value.length);
            onChange(digits.slice(0, DIGITS));
          }}
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={DIGITS}
          aria-describedby={refused ? hintId : undefined}
          className="h-12 w-full rounded-xl bg-surface-control pl-4 pr-11 text-center font-mono text-lg tracking-[0.3em] text-ink-strong caret-ink-strong ring-1 ring-inset ring-line/[0.12] transition-colors focus:outline-none focus:ring-2 focus:ring-focus"
        />
        <VisibilityToggle visible={visible} onToggle={onToggleVisible} compact className="absolute right-1.5 top-1/2 -translate-y-1/2" />
      </div>
      {refused && (
        <p id={hintId} role="status" className="mt-2 text-[12px] text-orbit-amber">
          Numbers only: the passcode is 6 digits.
        </p>
      )}
    </div>
  );
}

/** The eye: shows or hides the digits. */
function VisibilityToggle({
  visible,
  onToggle,
  compact = false,
  className,
}: {
  visible: boolean;
  onToggle: () => void;
  /** Icon only, for sitting inside a field. */
  compact?: boolean;
  className?: string;
}) {
  const Icon = visible ? EyeOff : Eye;
  const label = visible ? "Hide passcode" : "Show passcode";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={visible}
      title={label}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        compact ? "h-9 w-9" : "h-8 px-3 text-[13px]",
        className
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {!compact && label}
    </button>
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
      <GlassSurface
        fallback="material-fog"
        className="w-full rounded-[32px] border border-line/[0.06] p-6 text-left shadow-raised ring-1 ring-line/5 sm:p-10"
      >
        {children}
      </GlassSurface>
    </div>
  );
}
