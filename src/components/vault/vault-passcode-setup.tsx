"use client";

import { useEffect, useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import {
  DashboardCard,
  CardHeader,
  StatusChip,
} from "@/components/dashboard/dashboard-card";
import {
  FormNotice,
  SettingsButton,
} from "@/components/settings/settings-primitives";
import {
  getVaultPasscodeStatusAction,
  requestVaultPasscodeResetAction,
  setVaultPasscodeAction,
} from "@/app/actions/vault-passcode";

/* ------------------------------------------------------------------ */
/*  Vault Passcode — OWNER-only settings card                          */
/*                                                                     */
/*  A MEMBER never sees this: the passcode is handed to them by word    */
/*  of mouth, and the app has no screen anywhere that shows it back or   */
/*  lets a member change it. Mirrors the "Password" card in             */
/*  `security-section.tsx` — set/change form, plus the same "email me    */
/*  a reset link" affordance for an owner locked out on the device they   */
/*  are using right now. */
/* ------------------------------------------------------------------ */

const CODE_FIELD_CLASS =
  "h-12 w-full rounded-xl bg-surface-raised px-4 text-center text-lg tracking-[0.4em] text-ink " +
  "ring-1 ring-inset ring-line/[0.06] placeholder:tracking-normal placeholder:text-[13px] placeholder:text-ink-dim " +
  "transition-[background-color,box-shadow] duration-300 hover:bg-surface-control focus:bg-surface-control " +
  "focus:outline-none focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50";

export function VaultPasscodeCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  const [code, setCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [resetSending, setResetSending] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resetTone, setResetTone] = useState<"error" | "success">("success");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getVaultPasscodeStatusAction();
      if (!cancelled && result.success) setConfigured(result.configured);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = /^\d{4}$/.test(code) && code === confirmCode;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const result = await setVaultPasscodeAction(code);
      if (!result.success) {
        setSaveError(result.error);
        return;
      }
      setCode("");
      setConfirmCode("");
      setConfigured(true);
      setSaveSuccess("Vault passcode saved. Share it with your team by word of mouth.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetEmail = async () => {
    if (resetSending) return;
    setResetSending(true);
    setResetNotice(null);
    setResetTone("success");
    try {
      const result = await requestVaultPasscodeResetAction();
      if (!result.success) {
        setResetTone("error");
        setResetNotice(result.error);
        return;
      }
      setResetNotice("Reset link sent to your account email.");
    } finally {
      setResetSending(false);
    }
  };

  return (
    <DashboardCard interactive={false}>
      <CardHeader
        title="Vault Passcode"
        icon={KeyRound}
        meta={
          configured !== null && (
            <StatusChip
              label={configured ? "Set" : "Not Set"}
              tone={configured ? "positive" : "neutral"}
            />
          )
        }
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <p className="max-w-lg text-[13px] font-light leading-relaxed text-ink-muted">
          A 4-digit code guarding the Vault, on top of ordinary workspace
          membership. Give it to your team by word of mouth only — it is
          never emailed or shown anywhere in the app once saved.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-2.5 block font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-ink-dim">
              {configured ? "New passcode" : "Passcode"}
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="••••"
              className={cn(CODE_FIELD_CLASS)}
            />
          </div>
          <div>
            <label className="mb-2.5 block font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-ink-dim">
              Confirm passcode
            </label>
            <input
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="••••"
              className={cn(CODE_FIELD_CLASS)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SettingsButton type="submit" icon={KeyRound} disabled={!ready} busy={saving}>
            {configured ? "Update Passcode" : "Set Passcode"}
          </SettingsButton>
          {configured && (
            <SettingsButton
              variant="quiet"
              icon={Mail}
              onClick={handleResetEmail}
              busy={resetSending}
            >
              Email me a reset link
            </SettingsButton>
          )}
        </div>

        <FormNotice tone="error">{saveError}</FormNotice>
        <FormNotice tone="success">{saveSuccess}</FormNotice>
        <FormNotice tone={resetTone}>{resetNotice}</FormNotice>
      </form>
    </DashboardCard>
  );
}
