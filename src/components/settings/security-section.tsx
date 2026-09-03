"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { KeyRound, LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";

import { auth } from "@/lib/firebase/client";
import { signOut as appSignOut } from "@/lib/firebase/auth";
import { requestPasswordResetAction } from "@/app/actions/password-reset";
import { revokeAllSessionsAction } from "@/app/actions/security";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils/classnames";
import {
  DashboardCard,
  CardHeader,
  StatusChip,
} from "@/components/dashboard/dashboard-card";
import {
  FormNotice,
  ReadonlyRow,
  SETTINGS_FIELD_CLASS,
  SettingsButton,
  SettingsList,
} from "./settings-primitives";

/* ------------------------------------------------------------------ */
/*  Security — password, sessions, sign-out                            */
/* ------------------------------------------------------------------ */

const MIN_PASSWORD_LENGTH = 8;

/** Firebase error codes surface raw otherwise; these are the ones users hit. */
function describeAuthError(code: string): string {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "That current password is not correct.";
    case "auth/weak-password":
      return "Choose a stronger password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/requires-recent-login":
      return "For security, sign out and back in before changing your password.";
    default:
      return "Could not update your password. Try again.";
  }
}

export function SecuritySection() {
  const router = useRouter();
  const { user, firebaseUser } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [resetSending, setResetSending] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  // A throttled or failed request lands in the same slot as a sent one, so
  // the slot carries its own tone — otherwise a refusal reads as a success.
  const [resetTone, setResetTone] = useState<"error" | "success">("success");

  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const email = user?.email ?? firebaseUser?.email ?? "";
  const lastSignIn = firebaseUser?.metadata?.lastSignInTime
    ? format(new Date(firebaseUser.metadata.lastSignInTime), "d MMM yyyy, HH:mm")
    : "—";

  // A Google/GitHub account has no password to rotate here.
  const hasPasswordProvider =
    firebaseUser?.providerData?.some((p) => p.providerId === "password") ?? true;

  const passwordReady =
    currentPassword.length > 0 &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    newPassword === confirmPassword &&
    newPassword !== currentPassword;

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordReady || changing) return;

    const current = auth.currentUser;
    if (!current?.email) {
      setPasswordError("Your session expired. Sign in again.");
      return;
    }

    setChanging(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      // Firebase requires a recent login before a password change; doing the
      // reauth inline keeps the user from being bounced out to /login.
      await reauthenticateWithCredential(
        current,
        EmailAuthProvider.credential(current.email, currentPassword)
      );
      await updatePassword(current, newPassword);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password updated. Other devices stay signed in until you revoke them below.");
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      console.error("[Security] Password change failed", err);
      setPasswordError(describeAuthError(code));
    } finally {
      setChanging(false);
    }
  };

  const handleResetEmail = async () => {
    if (!email || resetSending) return;
    setResetSending(true);
    setResetNotice(null);
    setResetTone("success");
    try {
      // Shared with the signed-out /forgot-password flow so both send the
      // same Resend-delivered link at our own handler.
      const result = await requestPasswordResetAction(email);
      if (!result.ok) {
        setResetTone("error");
        setResetNotice(result.error);
        return;
      }
      setResetNotice(`Reset link sent to ${email}.`);
    } catch (err) {
      console.error("[Security] Reset email failed", err);
      setResetTone("error");
      setResetNotice("Could not send the reset email. Try again.");
    } finally {
      setResetSending(false);
    }
  };

  /**
   * Revokes refresh tokens server-side, then tears down this client's own
   * Firebase session so the browser does not sit on a token that no longer
   * refreshes.
   */
  const handleRevokeAll = async () => {
    if (revoking) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      const result = await revokeAllSessionsAction();
      if (!result.success) {
        setRevokeError(result.error);
        return;
      }
      await appSignOut();
      router.push("/login");
    } catch (err) {
      console.error("[Security] Revoke failed", err);
      setRevokeError("Could not sign out other sessions.");
    } finally {
      setRevoking(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await appSignOut();
      router.push("/login");
    } catch (err) {
      console.error("[Security] Sign out failed", err);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Password ──────────────────────────────────────────────── */}
      <DashboardCard interactive={false}>
        <CardHeader
          title="Password"
          icon={KeyRound}
          meta={
            <StatusChip
              label={hasPasswordProvider ? "Email & Password" : "Federated"}
              tone="neutral"
            />
          }
        />

        {hasPasswordProvider ? (
          <form onSubmit={handleChangePassword} className="flex flex-col gap-5">
            <div>
              <label
                htmlFor="security-current"
                className="mb-2.5 block font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-ink-dim"
              >
                Current password
              </label>
              <input
                id="security-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={cn(SETTINGS_FIELD_CLASS, "h-12")}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="security-new"
                  className="mb-2.5 block font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-ink-dim"
                >
                  New password
                </label>
                <input
                  id="security-new"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={cn(SETTINGS_FIELD_CLASS, "h-12")}
                />
              </div>
              <div>
                <label
                  htmlFor="security-confirm"
                  className="mb-2.5 block font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-ink-dim"
                >
                  Confirm new password
                </label>
                <input
                  id="security-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={cn(SETTINGS_FIELD_CLASS, "h-12")}
                />
              </div>
            </div>

            <p className="text-[12px] font-light text-ink-dim">
              At least {MIN_PASSWORD_LENGTH} characters, and different from your
              current password.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <SettingsButton
                type="submit"
                icon={ShieldCheck}
                disabled={!passwordReady}
                busy={changing}
              >
                Update Password
              </SettingsButton>
              <SettingsButton
                variant="quiet"
                onClick={handleResetEmail}
                busy={resetSending}
                disabled={!email}
              >
                Email me a reset link
              </SettingsButton>
            </div>

            <FormNotice tone="error">{passwordError}</FormNotice>
            <FormNotice tone="success">{passwordSuccess}</FormNotice>
            <FormNotice tone={resetTone}>{resetNotice}</FormNotice>
          </form>
        ) : (
          <p className="max-w-lg text-[13px] font-light leading-relaxed text-ink-muted">
            This account signs in through an external provider, so there is no
            OrbitOS password to change. Manage it with that provider instead.
          </p>
        )}
      </DashboardCard>

      {/* ── Sessions ──────────────────────────────────────────────── */}
      <DashboardCard interactive={false}>
        <CardHeader title="Sessions" icon={MonitorSmartphone} />

        <SettingsList>
          <ReadonlyRow
            title="Signed in as"
            description="The identity every server action is checked against."
            value={email || "—"}
          />
          <ReadonlyRow
            title="Last sign-in"
            description="Recorded by Firebase Authentication."
            value={lastSignIn}
          />
          <ReadonlyRow
            title="Sign out everywhere"
            description="Revokes every session token issued to this account, on every device, and returns you to the sign-in screen."
            action={
              <SettingsButton
                variant="danger"
                icon={ShieldCheck}
                onClick={handleRevokeAll}
                busy={revoking}
              >
                Revoke All
              </SettingsButton>
            }
          />
        </SettingsList>

        <FormNotice tone="error">{revokeError}</FormNotice>
      </DashboardCard>

      {/* ── End session ───────────────────────────────────────────── */}
      <DashboardCard interactive={false} tone="quiet" className="ring-orbit-red/[0.14]">
        <CardHeader title="End Session" icon={LogOut} />

        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <p className="max-w-md text-[13px] font-light leading-relaxed text-ink-muted">
            Clears local workspace context and signs this device out. Other
            devices stay signed in.
          </p>
          <SettingsButton
            variant="danger"
            icon={LogOut}
            onClick={handleSignOut}
            busy={signingOut}
          >
            Sign Out
          </SettingsButton>
        </div>
      </DashboardCard>
    </div>
  );
}
