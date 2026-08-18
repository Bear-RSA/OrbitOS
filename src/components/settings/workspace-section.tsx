"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Building2,
  Check,
  Copy,
  FolderKanban,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";

import { db } from "@/lib/firebase/client";
import { User } from "@/types/auth";
import { cn } from "@/lib/utils/classnames";
import {
  DashboardCard,
  CardHeader,
  StatBlock,
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
/*  Workspace — organization identity and composition (OWNER only)      */
/*                                                                     */
/*  Firestore rules already restrict `organizations/{orgId}` writes to  */
/*  the owner and reject any attempt to touch `subscription` or         */
/*  `ownerId`, so the rename below is safe to run from the client.      */
/* ------------------------------------------------------------------ */

interface OrgDoc {
  name?: string;
  createdAt?: { toDate: () => Date };
}

export function WorkspaceSection({ user }: { user: User }) {
  const router = useRouter();
  const [org, setOrg] = useState<OrgDoc | null>(null);
  const [name, setName] = useState("");
  const [counts, setCounts] = useState<{ members: number; projects: number } | null>(
    null
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const orgId = user.orgId;

  useEffect(() => {
    if (!orgId) return;
    const unsub = onSnapshot(
      doc(db, "organizations", orgId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as OrgDoc;
        setOrg(data);
        // Only adopt the stored name while no edit is in flight, so a
        // snapshot echo cannot overwrite what is being typed.
        setName((current) => (current === "" ? data.name ?? "" : current));
      },
      (err) => console.error("[Settings] Org snapshot failed", err)
    );
    return unsub;
  }, [orgId]);

  const loadCounts = useCallback(async () => {
    if (!orgId) return;
    try {
      const [members, projects] = await Promise.all([
        getCountFromServer(query(collection(db, "users"), where("orgId", "==", orgId))),
        getCountFromServer(
          query(collection(db, "projects"), where("orgId", "==", orgId))
        ),
      ]);
      setCounts({
        members: members.data().count,
        projects: projects.data().count,
      });
    } catch (err) {
      console.error("[Settings] Workspace counts failed", err);
    }
  }, [orgId]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const trimmed = name.trim();
  const dirty = trimmed !== (org?.name ?? "") && trimmed.length > 0;

  const handleSave = async () => {
    if (!dirty || saving || !orgId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateDoc(doc(db, "organizations", orgId), { name: trimmed });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("[Settings] Workspace rename failed", err);
      setError("Could not rename the workspace. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(orgId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard access was blocked by your browser.");
    }
  };

  const created = org?.createdAt?.toDate
    ? format(org.createdAt.toDate(), "d MMM yyyy")
    : "—";

  return (
    <div className="flex flex-col gap-6">
      {/* ── Identity ──────────────────────────────────────────────── */}
      <DashboardCard interactive={false}>
        <CardHeader
          title="Workspace"
          icon={Building2}
          meta={
            dirty ? (
              <StatusChip label="Unsaved" tone="warning" />
            ) : (
              <StatusChip label="Synced" icon={Check} tone="neutral" />
            )
          }
        />

        <div className="flex flex-col gap-5">
          <div>
            <label
              htmlFor="workspace-name"
              className="mb-2.5 block font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-ink-dim"
            >
              Workspace name
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="Studio name"
                className={cn(SETTINGS_FIELD_CLASS, "h-12")}
              />
              <SettingsButton
                icon={Check}
                onClick={handleSave}
                disabled={!dirty}
                busy={saving}
                className="h-12 sm:w-auto"
              >
                {saved ? "Saved" : "Save"}
              </SettingsButton>
            </div>
            <p className="mt-2.5 text-[12px] font-light text-ink-dim">
              Shown on invites and in the daily digest.
            </p>
          </div>

          <SettingsList className="border-t border-white/[0.05] pt-5">
            <ReadonlyRow
              title="Workspace ID"
              description="Quote this when reporting an issue."
              value={<span className="max-w-[14rem] truncate">{orgId || "—"}</span>}
              action={
                <SettingsButton
                  variant="quiet"
                  icon={copied ? Check : Copy}
                  onClick={handleCopyId}
                  disabled={!orgId}
                >
                  {copied ? "Copied" : "Copy"}
                </SettingsButton>
              }
            />
            <ReadonlyRow
              title="Created"
              description="When this workspace was provisioned."
              value={created}
            />
          </SettingsList>

          <FormNotice tone="error">{error}</FormNotice>
        </div>
      </DashboardCard>

      {/* ── Composition ───────────────────────────────────────────── */}
      <DashboardCard interactive={false}>
        <CardHeader
          title="Composition"
          icon={Users}
          action={
            <SettingsButton
              variant="quiet"
              icon={UserPlus}
              onClick={() => router.push("/teams")}
            >
              Manage Team
            </SettingsButton>
          }
        />

        <div className="grid grid-cols-2 gap-x-6 gap-y-8">
          <StatBlock
            size="md"
            label="Members"
            value={counts ? String(counts.members).padStart(2, "0") : "—"}
            tone={counts?.members ? "default" : "idle"}
          />
          <StatBlock
            size="md"
            label="Projects"
            value={counts ? String(counts.projects).padStart(2, "0") : "—"}
            tone={counts?.projects ? "default" : "idle"}
          />
        </div>

        <p className="mt-8 inline-flex items-center gap-2.5 text-[12px] font-light text-ink-dim">
          <FolderKanban className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />
          Seat and project limits are enforced by your plan under Billing.
        </p>
      </DashboardCard>

      {/* ── Danger zone ───────────────────────────────────────────── */}
      <DashboardCard interactive={false} tone="quiet" className="ring-orbit-red/[0.14]">
        <CardHeader
          title="Danger Zone"
          icon={ShieldAlert}
          meta={<StatusChip label="Assisted" tone="critical" />}
        />

        <p className="max-w-lg text-[13px] font-light leading-relaxed text-ink-muted">
          Deleting a workspace removes every project, task, file, and member
          record permanently. It is not self-service yet — email{" "}
          <a
            href="mailto:feedback@miraistack.co.za?subject=Workspace%20deletion%20request"
            className="text-ink underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-white/60"
          >
            feedback@miraistack.co.za
          </a>{" "}
          from your owner address and we will confirm before anything is
          removed.
        </p>
      </DashboardCard>
    </div>
  );
}
