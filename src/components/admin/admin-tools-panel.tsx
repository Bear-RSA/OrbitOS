"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Lock, MailPlus, Network, ShieldCheck, Ticket, Users, UserPlus, X } from "lucide-react";

import {
  addToInternalManagementAction,
  adminSetRankAction,
  getAdminOverviewAction,
  lockAdminToolsAction,
  removeFromInternalManagementAction,
  setAdminPasscodeAction,
  type AdminOverview,
  type AdminPerson,
} from "@/app/actions/admin-tools";
import { getOrgChartAction, type OrgChart } from "@/app/actions/org-chart";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import { OrgChartCanvas } from "@/components/org-chart/org-chart-canvas";
import { BillingPanel } from "@/components/dashboard/billing-panel";
import { Button } from "@/components/ui/button";
import { DialogNotice } from "@/components/ui/dialog-parts";
import { RANK_TEXT } from "@/components/ui/rank-styles";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ADMIN_LOCKED_ERROR } from "@/lib/internal-management/rules";
import { RANK_LABEL, rankOf, STORED_ROLES, type StoredRole } from "@/lib/members/rank";
import { cn } from "@/lib/utils/classnames";
import { refreshInternalManagementBadges } from "@/hooks/use-internal-management-badges";

import { NewPasscodeScreen } from "./admin-passcode-gate";
import { InvitesSection } from "./invites-section";
import { TicketsSection } from "./tickets-section";

/* ------------------------------------------------------------------ */
/*  Admin Tools, once unlocked                                         */
/*                                                                     */
/*  Six blocks, in the order an IT lead reaches for them: the ticket   */
/*  queue, who holds the key, who is coming in, the structure,         */
/*  everyone's rank, and the account itself.                           */
/*  Every button goes through `requireAdminTools` on the server; when  */
/*  the 15-minute unlock runs out, the first refused action locks the  */
/*  page again.                                                        */
/* ------------------------------------------------------------------ */

type ActionResult = { success: true } | { success: false; error: string };

const SECTION = "rounded-[28px] bg-surface-raised/40 p-5 ring-1 ring-inset ring-line/[0.05] sm:p-7";

export function AdminToolsPanel({ onLocked, viewerId }: { onLocked: () => void; viewerId: string }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  // Bumped after every change, so the chart picks up new ranks too.
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  // "Save passcode" used to clear the boxes and say nothing, which read as broken.
  const [passcodeSaved, setPasscodeSaved] = useState(false);

  const load = useCallback(async () => {
    const result = await getAdminOverviewAction();
    if (!result.success) {
      if (result.error === ADMIN_LOCKED_ERROR) onLocked();
      else setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setOverview(result.overview);
  }, [onLocked]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs an action, relocks if the unlock ran out, and reloads on success. */
  const run = useCallback(
    async (action: () => Promise<ActionResult>): Promise<string | null> => {
      const result = await action();
      if (!result.success) {
        if (result.error === ADMIN_LOCKED_ERROR) onLocked();
        return result.error;
      }
      await load();
      setVersion((v) => v + 1);
      return null;
    },
    [load, onLocked]
  );

  const lock = async () => {
    await lockAdminToolsAction();
    onLocked();
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-md py-16">
        <DialogNotice tone="red">{loadError}</DialogNotice>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <OrbitLoader />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-surface-control px-3 py-1 text-[12px] text-ink-muted ring-1 ring-line/[0.04]">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          Open · locks 15 minutes after you unlocked it · {overview.planName} plan
        </span>
        <Button variant="outline" onClick={lock}>
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Lock now
        </Button>
      </div>

      <TicketsSection className={SECTION} heading={<SectionHeading icon={Ticket} title="Tickets" />} onLocked={onLocked} />
      <InternalManagementSection overview={overview} run={run} />
      <InvitesSection className={SECTION} heading={<SectionHeading icon={MailPlus} title="Invites" />} onLocked={onLocked} />
      <StructureSection version={version} viewerId={viewerId} onLocked={onLocked} />
      <RanksSection overview={overview} run={run} />

      <section className={cn(SECTION, "flex flex-col gap-6")}>
        <SectionHeading icon={KeyRound} title="Account" />
        <BillingPanel />
        <div className="border-t border-line/[0.06] pt-6">
          <h3 className="mb-4 text-[14px] text-ink">Change the Admin Tools passcode</h3>
          <div className="max-w-lg">
            <NewPasscodeScreen
              bare
              title="Change the Admin Tools passcode"
              intro="Everyone in Internal Management uses the new passcode from the next time they open Admin Tools."
              submit={async (code) => {
                setPasscodeSaved(false);
                const result = await setAdminPasscodeAction(code);
                if (!result.success && result.error === ADMIN_LOCKED_ERROR) onLocked();
                return result;
              }}
              onDone={() => setPasscodeSaved(true)}
            />
            {passcodeSaved && (
              <DialogNotice tone="green" className="mt-4">
                <span role="status">
                  Passcode changed. Everyone in Internal Management uses the new one from the next time they open Admin
                  Tools.
                </span>
              </DialogNotice>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SectionHeading({
  icon: Icon,
  title,
  aside,
}: {
  icon: typeof Lock;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[15px] font-light tracking-tight text-ink">
        <Icon className="h-4 w-4 text-ink-dim" aria-hidden />
        {title}
      </h2>
      {aside}
    </div>
  );
}

function PersonLine({ person, children }: { person: AdminPerson; children?: React.ReactNode }) {
  const rank = rankOf(person.role, person.leadsDepartment);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <UserAvatar photoURL={person.photoURL} name={person.name} size="md" rank={rank} uid={person.id} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-ink">{person.name}</p>
        <p className="truncate text-[12px] text-ink-dim">
          <span className={rank === "MEMBER" ? undefined : RANK_TEXT[rank]}>{RANK_LABEL[rank]}</span>
          {person.email && ` · ${person.email}`}
        </p>
      </div>
      {children}
    </li>
  );
}

type Run = (action: () => Promise<ActionResult>) => Promise<string | null>;

function InternalManagementSection({ overview, run }: { overview: AdminOverview; run: Run }) {
  const [adding, setAdding] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const members = overview.people.filter((p) => overview.internalManagementIds.includes(p.id));
  const others = overview.people.filter((p) => !overview.internalManagementIds.includes(p.id));
  const full = members.length >= overview.seatLimit;

  const act = async (key: string, action: () => Promise<ActionResult>) => {
    setBusy(key);
    setError(null);
    const failed = await run(action);
    setBusy(null);
    if (failed) setError(failed);
    else {
      setAdding("");
      void refreshInternalManagementBadges();
    }
  };

  return (
    <section className={cn(SECTION, "flex flex-col gap-4")}>
      <SectionHeading
        icon={ShieldCheck}
        title="Internal Management"
        aside={
          <span className="font-mono text-[11px] tabular-nums text-ink-muted">
            {members.length} / {overview.seatLimit} seats
          </span>
        }
      />
      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-dim">
        These people hold the key to Admin Tools. Anyone in the workspace can be added, at any rank. Only the people
        listed here can see this list, and every change is emailed to all of them.
      </p>

      {error && <DialogNotice tone="red">{error}</DialogNotice>}

      <ul className="divide-y divide-line/[0.06]">
        {members.map((person) => (
          <PersonLine key={person.id} person={person}>
            <Button
              variant="ghost"
              className="text-orbit-red hover:bg-orbit-red/10 hover:text-orbit-red"
              disabled={busy !== null || members.length <= 1}
              isLoading={busy === `remove-${person.id}`}
              title={members.length <= 1 ? "The last person in Internal Management can't be removed." : undefined}
              onClick={() =>
                act(`remove-${person.id}`, () => removeFromInternalManagementAction({ targetUid: person.id }))
              }
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Remove
            </Button>
          </PersonLine>
        ))}
      </ul>

      {full ? (
        <p className="text-[12px] leading-relaxed text-ink-dim">
          Every seat on your plan is taken. Remove someone to add someone else.
        </p>
      ) : (
        others.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={adding} onValueChange={setAdding} disabled={busy !== null}>
              <SelectTrigger aria-label="Person to add to Internal Management" className="sm:max-w-xs">
                <SelectValue placeholder="Choose someone" />
              </SelectTrigger>
              <SelectContent>
                {others.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!adding || busy !== null}
              isLoading={busy === "add"}
              onClick={() => act("add", () => addToInternalManagementAction({ targetUid: adding }))}
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              Add to Internal Management
            </Button>
          </div>
        )
      )}
    </section>
  );
}

function RanksSection({ overview, run }: { overview: AdminOverview; run: Run }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ownerCount = useMemo(() => overview.people.filter((p) => p.role === "OWNER").length, [overview]);

  /** Why a rank can't be chosen on this plan, or null when it can. */
  const lockedReason = (rank: StoredRole): string | null => {
    if (rank === "MANAGER" && overview.rankLimits.maxManagers === 0) return "Standard plan and up";
    if (rank === "EXECUTIVE" && overview.rankLimits.maxExecutives === 0) return "Pro and Custom plans";
    if (rank === "TEAM_LEAD" && overview.rankLimits.maxTeamLeads === 0) return "Pro and Custom plans";
    return null;
  };

  const change = async (person: AdminPerson, rank: StoredRole) => {
    setBusy(person.id);
    setError(null);
    const failed = await run(() => adminSetRankAction({ targetUid: person.id, rank }));
    setBusy(null);
    if (failed) setError(failed);
  };

  return (
    <section className={cn(SECTION, "flex flex-col gap-4")}>
      <SectionHeading
        icon={Users}
        title="Ranks"
        aside={
          <span className="font-mono text-[11px] tabular-nums text-ink-muted">
            {ownerCount} / {overview.ownerLimit === -1 ? "∞" : overview.ownerLimit} owners
          </span>
        }
      />
      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-dim">
        Any rank for anyone, Owner included. Give someone Team Lead here, then pick them in a department&apos;s Team
        Lead slot under Structure.
      </p>

      {error && <DialogNotice tone="red">{error}</DialogNotice>}

      <ul className="divide-y divide-line/[0.06]">
        {overview.people.map((person) => (
          <PersonLine key={person.id} person={person}>
            <Select
              value={person.role}
              disabled={busy !== null}
              onValueChange={(value) => change(person, value as StoredRole)}
            >
              <SelectTrigger aria-label={`${person.name}'s rank`} className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STORED_ROLES.map((rank) => {
                  const reason = rank === person.role ? null : lockedReason(rank);
                  return (
                    <SelectItem key={rank} value={rank} disabled={reason !== null}>
                      {RANK_LABEL[rank]}
                      {reason && <span className="text-ink-dim"> · {reason}</span>}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </PersonLine>
        ))}
      </ul>
    </section>
  );
}

/* Profiles aren't opened from here: this screen is for wiring. */
const NO_PROFILE = () => undefined;

function StructureSection({
  version,
  viewerId,
  onLocked,
}: {
  version: number;
  viewerId: string;
  onLocked: () => void;
}) {
  const [chart, setChart] = useState<OrgChart | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await getOrgChartAction();
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError(null);
    setChart(result.chart);
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  return (
    <section className={cn(SECTION, "flex flex-col gap-4")}>
      <SectionHeading icon={Network} title="Structure" />
      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-dim">
        Wire each department under its Owner, then fill its slots: Executive, Manager, Team Lead and members. Teams
        draws the same chart for the whole workspace.
      </p>

      {error && <DialogNotice tone="red">{error}</DialogNotice>}
      {!chart ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <OrbitLoader />
        </div>
      ) : (
        <OrgChartCanvas
          chart={chart}
          editable
          viewerId={viewerId}
          onChanged={load}
          onOpenProfile={NO_PROFILE}
          onLocked={onLocked}
        />
      )}
    </section>
  );
}
