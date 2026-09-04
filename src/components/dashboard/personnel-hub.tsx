"use client";

import { useEffect, useState, useCallback } from "react";
import { getWorkloadTelemetryAction } from "@/app/actions/personnel";
import { cn } from "@/lib/utils/classnames";
import { Member } from "@/types/member";
import { Task } from "@/types/task";
import { OrbitEvent } from "@/types/event";
import { engagementPresenceByMember } from "@/lib/calendar/presence";
import { resolvePresence } from "@/lib/members/presence";
import { Loader2, Phone } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/contexts/auth-context";
import { OutgoingCall } from "@/components/calls/outgoing-call";
import { MemberProfile } from "@/components/members/member-profile";

interface PersonnelHubProps {
  projectId: string;
  orgId: string;
  members: Member[];
  tasks: Task[];
  /**
   * Engagements this project already subscribes to. Passed in rather than
   * fetched here so the hub stays a pure render of props and does not open
   * a second listener onto data the page is already holding.
   */
  events?: OrbitEvent[];
  selectedAssignee: string | null;
  onAssigneeSelect: (uid: string | null) => void;
}

export function PersonnelHub({ projectId, orgId, members, tasks, events = [], selectedAssignee, onAssigneeSelect }: PersonnelHubProps) {
  const [now, setNow] = useState(Date.now());
  const { user } = useAuth();

  /* Who this operative is currently ringing. One at a time on purpose:
     placing a second call while the first is still connecting has no
     meaning, and the ring UI is a single fixed panel. */
  const [calling, setCalling] = useState<{
    uid: string;
    name: string;
    photoURL?: string | null;
  } | null>(null);

  /* Whose card is open. The row itself still filters by assignee — that
     is what a row in this grid has always done — so the profile hangs
     off the avatar instead of stealing the row's job. */
  const [profileUid, setProfileUid] = useState<string | null>(null);

  // Heartbeat local timer for offline detection
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000); // Check every 30s
    return () => clearInterval(timer);
  }, []);

  const MAX_SYSTEM_LOAD = 5;

  /* Who is in a room right now, and with whom. Recomputed on the same
     30s heartbeat that drives offline detection, so a meeting starting
     or ending shows up without its own timer. */
  const memberNames = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const presenceByMember = engagementPresenceByMember(
    events,
    members.map((m) => m.id),
    memberNames,
    new Date(now)
  );

  // Process mapping purely from props for zero-latency reactivity
  const telemetry = members.map(member => {
    const memberId = member.id || (member as any).uid;
    const assignedTasks = tasks.filter(t => t.assignedTo.includes(memberId) && t.status !== "done");
    const count = assignedTasks.length;
    let loadPercent = Math.round((count / MAX_SYSTEM_LOAD) * 100);
    if (loadPercent > 100) loadPercent = 100;

    /* Was inline here, and had a hole: a member with NO heartbeat at all
       fell through to `operationalStatus || "available"` and showed
       green forever — somebody invited but never seen, or an account
       predating heartbeats, read as if they were at their desk. The
       shared rule in `lib/members/presence` treats no pulse as offline,
       and every other surface now asks it the same question. */
    const status = resolvePresence(
      {
        operationalStatus: member.operationalStatus,
        lastActivityMs: member.lastActivity?.toMillis?.() ?? null,
      },
      now
    );

    return {
      id: member.id,
      name: member.name,
      photoURL: member.photoURL,
      role: member.role,
      roleDescriptor: member.roleDescriptor,
      operationalStatus: status,
      /* A live engagement outranks a self-set status: someone who clicked
         "available" an hour ago and is in a client call right now is not
         available, and the calendar is the better authority. */
      presence: presenceByMember[memberId] ?? null,
      directiveCount: count,
      loadPercentage: loadPercent,
      descriptor: member.roleDescriptor,
      bio: (member as any).bio
    };
  }).sort((a, b) => {
    if (a.role !== b.role) return a.role === "OWNER" ? -1 : 1;
    return b.loadPercentage - a.loadPercentage;
  });

  return (
    <div className="bg-surface-card/40 backdrop-blur-sm border border-line/[0.06] rounded-xl overflow-hidden shadow-raised ring-1 ring-line/5">
       <div className="p-4 border-b border-line/[0.04] bg-transparent flex justify-between items-center">
          <h2 className="text-[10px] font-mono text-ink-dim uppercase tracking-[0.2em]">Personnel Network</h2>
          {selectedAssignee && (
            <button 
              onClick={() => onAssigneeSelect(null)} 
              className="text-[9px] font-mono text-orbit-red border border-orbit-red/30 bg-orbit-red/10 px-2 py-0.5 rounded tracking-widest hover:bg-orbit-red/20 transition-colors"
            >
              Clear Filter
            </button>
          )}
       </div>
       <div className="flex flex-col divide-y divide-line/[0.06]">
         {telemetry.map((t) => {
           const isSelected = selectedAssignee === t.id;
           
           // Status mapping
           let statusColor = "bg-ink-faint";
           if (t.operationalStatus === "available") statusColor = "bg-orbit-green";
           if (t.operationalStatus === "focused") statusColor = "bg-ink";
           if (t.operationalStatus === "offline") statusColor = "bg-orbit-red";
           if (t.presence) statusColor = "bg-orbit-amber";

           const statusWord = t.presence ? "in meeting" : t.operationalStatus;

           // Role formatting
           const displayDescriptor = t.roleDescriptor || (t.role === "OWNER" ? "[OWNER]" : "[MEMBER]");
           const roleColor = t.role === "OWNER" ? "text-orbit-red" : "text-ink-muted";

           // Load bar
           const barLength = 10;
           const filledCount = Math.round((t.loadPercentage / 100) * barLength);
           const bar = `[${"|".repeat(filledCount)}${"-".repeat(barLength - filledCount)}]`;

           return (
             <div 
               key={t.id}
               onClick={() => onAssigneeSelect(isSelected ? null : t.id)}
               className={cn(
                 "p-4 flex flex-col cursor-pointer group transition-all duration-300",
                 isSelected ? "bg-surface-raised ring-inset ring-1 ring-line/10" : "hover:bg-surface-card"
               )}
             >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-4">
                    {/* The face opens the person; the row keeps filtering
                        the board by them. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProfileUid(t.id);
                      }}
                      title={`View ${t.name}`}
                      aria-label={`View ${t.name}`}
                      className="relative rounded-lg transition-transform duration-300 hover:-translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      <UserAvatar name={t.name} photoURL={t.photoURL} size="sm" />
                      <span className={cn("absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-scrim/60", statusColor)} />
                    </button>
                    <div className="flex flex-col">
                       <span className="text-[13px] font-medium text-ink tracking-tight group-hover:text-ink-strong transition-colors">
                         {t.name}
                       </span>
                       {t.presence ? (
                         <span
                           className="text-[9px] font-mono tracking-widest uppercase mt-0.5 text-orbit-amber truncate max-w-[220px]"
                           title={`${t.name} is ${t.presence.label} — ${t.presence.title}`}
                         >
                           {t.presence.label}
                           {t.presence.hasGuests && " ·  guest"}
                         </span>
                       ) : (
                         <span className={cn("text-[9px] font-mono tracking-widest uppercase mt-0.5", roleColor)}>
                           {displayDescriptor}
                         </span>
                       )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                     {/* Calling yourself is not a thing, and someone
                         already in a meeting or a call is reachable but
                         probably should not be rung — so the button
                         stays, disabled, and says why. Hiding it would
                         make the row's capabilities depend on state the
                         reader cannot see. */}
                     {user?.id && t.id !== user.id && (
                       <button
                         type="button"
                         onClick={(e) => {
                           // The row itself filters by assignee.
                           e.stopPropagation();
                           if (t.presence || t.operationalStatus === "offline") return;
                           setCalling({ uid: t.id, name: t.name, photoURL: t.photoURL });
                         }}
                         disabled={Boolean(t.presence) || t.operationalStatus === "offline"}
                         title={
                           t.presence
                             ? `${t.name} is ${t.presence.label}`
                             : t.operationalStatus === "offline"
                               ? `${t.name} is offline`
                               : `Call ${t.name}`
                         }
                         aria-label={`Call ${t.name}`}
                         className="mb-1 flex items-center gap-1.5 rounded-lg border border-line/[0.06] bg-surface-control px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                       >
                         <Phone className="h-2.5 w-2.5" aria-hidden />
                         Call
                       </button>
                     )}
                     <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.1em]">
                        <span className={cn(t.presence ? "text-orbit-amber" : "text-ink-dim")}>
                          {statusWord}
                        </span>
                        <span className="text-ink-muted">{bar}</span>
                        <span className={cn("tabular-nums", t.loadPercentage >= 80 ? "text-orbit-red" : "text-ink-muted")}>
                          {t.directiveCount} NODES
                        </span>
                     </div>
                  </div>
                </div>

                {/* Grid-row collapse: 0fr→1fr is the only pure-CSS way to animate intrinsic height */}
                <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-300 opacity-0 group-hover:opacity-100">
                  <div className="overflow-hidden">
                    <div className="mt-4 bg-surface-card border border-line/[0.06] rounded-lg p-3 flex flex-col gap-1.5">
                      {t.descriptor && (
                        <span className="text-[10px] text-ink-muted font-mono uppercase tracking-widest">
                          {t.descriptor}
                        </span>
                      )}
                      {t.bio && (
                        <span className="text-[11px] text-ink-muted font-mono leading-relaxed">
                          {t.bio}
                        </span>
                      )}
                      {!t.descriptor && !t.bio && (
                        <span className="text-[11px] text-ink-dim font-mono italic">
                          No additional data available.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
             </div>
           );
         })}
       </div>

       {calling && (
         <OutgoingCall target={calling} onClose={() => setCalling(null)} />
       )}

       {/* Tasks and engagements are already in hand here, so the card
           costs no extra reads on this screen. */}
       {user?.orgId && (
         <MemberProfile
           member={profileUid ? (members.find((m) => m.id === profileUid) ?? null) : null}
           onClose={() => setProfileUid(null)}
           viewer={{ id: user.id, orgId: user.orgId }}
           tasks={tasks}
           events={events}
         />
       )}
    </div>
  );
}
