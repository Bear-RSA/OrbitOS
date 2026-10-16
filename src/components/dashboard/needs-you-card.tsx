"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Ban, CalendarClock, Inbox, Megaphone, TriangleAlert, Users } from "lucide-react";
import { useUnreadMessages } from "@/hooks/use-unread-messages";
import { conversationTitle } from "@/lib/messages/summary";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Member } from "@/types/member";
import { Project } from "@/types/project";
import { Task } from "@/types/task";
import { UrgencyBuckets } from "@/types/dashboard";
import { cn } from "@/lib/utils/classnames";
import { DashboardCard, CardHeader, CardEyebrow, CardEmpty } from "./dashboard-card";

/* ------------------------------------------------------------------ */
/*  Needs you                                                          */
/*                                                                     */
/*  Everything else on the dashboard is the workspace. This is the one */
/*  panel that answers "what is waiting on me": threads with unread    */
/*  messages (a forwarded task arrives as one), then your own work     */
/*  that is late, due today, or blocked. Messages lead because someone */
/*  is waiting on a reply; your own deadlines follow, worst first.     */
/*                                                                     */
/*  `useUnreadMessages` runs the same two queries the nav already      */
/*  holds open, and the Firestore SDK shares identical listeners, so   */
/*  this adds no reads.                                                */
/* ------------------------------------------------------------------ */

interface NeedsYouCardProps {
  uid: string;
  orgId: string;
  members: Member[];
  /** The viewer's own urgency buckets. */
  buckets: UrgencyBuckets;
  projects: Project[];
  max?: number;
}

type Row =
  | { kind: "message"; key: string; conversationId: string }
  | { kind: "task"; key: string; task: Task; reason: "overdue" | "today" | "blocked" };

const TASK_REASON: Record<"overdue" | "today" | "blocked", { label: string; tone: string; icon: typeof Ban }> = {
  overdue: { label: "Overdue", tone: "text-orbit-red", icon: TriangleAlert },
  today: { label: "Due today", tone: "text-orbit-amber", icon: CalendarClock },
  blocked: { label: "Blocked", tone: "text-orbit-red", icon: Ban },
};

export function NeedsYouCard({ uid, orgId, members, buckets, projects, max = 6 }: NeedsYouCardProps) {
  const router = useRouter();
  const unread = useUnreadMessages(uid, orgId);

  const liveNames = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name])),
    [members]
  );
  const directory = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const conversations = useMemo(() => new Map(unread.map((c) => [c.id, c])), [unread]);

  const rows = useMemo<Row[]>(() => {
    const seen = new Set<string>();
    const taskRows: Row[] = [];
    const push = (task: Task, reason: "overdue" | "today" | "blocked") => {
      if (seen.has(task.id)) return;
      seen.add(task.id);
      taskRows.push({ kind: "task", key: `t:${task.id}`, task, reason });
    };

    buckets.overdue.forEach((t) => push(t, "overdue"));
    buckets.dueToday.forEach((t) => push(t, "today"));
    // Blocked work from every bucket, after anything with a deadline on it.
    [
      ...buckets.dueTomorrow,
      ...buckets.dueThisWeek,
      ...buckets.upcoming,
      ...buckets.noDueDate,
    ]
      .filter((t) => t.isBlocked)
      .forEach((t) => push(t, "blocked"));

    const messageRows: Row[] = unread.map((c) => ({
      kind: "message",
      key: `m:${c.id}`,
      conversationId: c.id,
    }));

    return [...messageRows, ...taskRows];
  }, [buckets, unread]);

  const visible = rows.slice(0, max);

  return (
    <DashboardCard className="h-full" tone="quiet" interactive={false}>
      <CardHeader
        title="Needs you"
        icon={Inbox}
        meta={
          rows.length > 0 ? (
            <CardEyebrow className="text-orbit-amber">{rows.length} waiting</CardEyebrow>
          ) : undefined
        }
      />

      {visible.length === 0 ? (
        <CardEmpty
          icon={Inbox}
          title="You're clear"
          hint="Unread messages and your late, due-today or blocked tasks show here."
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map((row) => {
            if (row.kind === "message") {
              const conversation = conversations.get(row.conversationId);
              if (!conversation) return null;
              const title = conversationTitle(conversation, uid, liveNames);
              const partnerUid =
                conversation.type === "dm"
                  ? conversation.participantIds?.find((id) => id !== uid)
                  : undefined;
              const partner = partnerUid ? directory.get(partnerUid) : undefined;
              const sentAt = conversation.lastMessageAt?.toDate?.() ?? null;

              return (
                <li key={row.key}>
                  <RowButton
                    onClick={() =>
                      router.push(`/messages?c=${encodeURIComponent(conversation.id)}`)
                    }
                  >
                    {conversation.type === "dm" ? (
                      <UserAvatar size="sm" name={title} photoURL={partner?.photoURL} />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-control ring-1 ring-inset ring-line/[0.06]">
                        {conversation.type === "group" ? (
                          <Users className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
                        ) : (
                          <Megaphone className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
                        )}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium leading-tight text-ink">
                        {title}
                      </p>
                      <p className="mt-1 truncate text-[12px] text-ink-dim">
                        {conversation.lastMessagePreview || "New message"}
                      </p>
                    </div>
                    <span className="mt-0.5 shrink-0 text-[12px] text-orbit-amber">
                      {sentAt ? formatDistanceToNowStrict(sentAt) : "Unread"}
                    </span>
                  </RowButton>
                </li>
              );
            }

            const { task, reason } = row;
            const meta = TASK_REASON[reason];
            const Icon = meta.icon;
            return (
              <li key={row.key}>
                <RowButton onClick={() => router.push(`/projects/${task.projectId}`)}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-control ring-1 ring-inset ring-line/[0.06]">
                    <Icon className={cn("h-3.5 w-3.5", meta.tone)} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium leading-tight text-ink-muted">
                      {task.title}
                    </p>
                    <p className="mt-1 truncate text-[12px] text-ink-dim">
                      {projectName.get(task.projectId) ?? "Unknown project"}
                    </p>
                  </div>
                  <span className={cn("mt-0.5 shrink-0 text-[12px]", meta.tone)}>{meta.label}</span>
                </RowButton>
              </li>
            );
          })}

          {rows.length > visible.length && (
            <li className="pt-2 text-[12px] text-ink-dim">
              +{rows.length - visible.length} more
            </li>
          )}
        </ul>
      )}
    </DashboardCard>
  );
}

function RowButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-300 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {children}
    </button>
  );
}
