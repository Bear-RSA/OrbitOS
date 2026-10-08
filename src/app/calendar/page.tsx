"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AppHeader } from "@/components/nav/app-header";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { ProjectCalendar } from "@/components/projects/project-calendar";
import { subscribeToEventsForAttendee } from "@/lib/queries/events";
import { subscribeToTasksForAssignee } from "@/lib/queries/tasks";
import { subscribeToMembersByOrg } from "@/lib/queries/members";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { OrbitEvent } from "@/types/event";
import { Task } from "@/types/task";
import { Member } from "@/types/member";

/* ------------------------------------------------------------------ */
/*  /calendar                                                          */
/*                                                                     */
/*  One calendar per person. A project's calendar shows that project;  */
/*  this one shows what the signed-in operative is on, wherever it was */
/*  booked: every engagement listing them as an attendee and every     */
/*  directive assigned to them. Booking a meeting with someone adds    */
/*  them to `attendees`, so it lands here for them without a sync.     */
/*                                                                     */
/*  Meetings created from this page belong to no project.              */
/* ------------------------------------------------------------------ */

export default function CalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  useHeartbeat(user?.id);

  const [events, setEvents] = useState<OrbitEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [ready, setReady] = useState(false);

  const uid = user?.id;
  const orgId = user?.orgId;

  useEffect(() => {
    if (authLoading) return;
    if (!uid) {
      router.push("/login");
      return;
    }
    if (!orgId) {
      router.push("/onboarding");
      return;
    }

    const unsubEvents = subscribeToEventsForAttendee(uid, orgId, (data) => {
      setEvents(data);
      setReady(true);
    });
    const unsubTasks = subscribeToTasksForAssignee(uid, orgId, setTasks);
    const unsubMembers = subscribeToMembersByOrg(orgId, setMembers);

    return () => {
      unsubEvents();
      unsubTasks();
      unsubMembers();
    };
  }, [authLoading, uid, orgId, router]);

  if (authLoading || !user || !user.orgId || !ready) {
    return (
      <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-ground">
        <Loader />
      </div>
    );
  }

  return (
    <DashboardShell className="min-h-screen bg-ground text-ink selection:bg-surface-hover selection:text-ink-strong pb-32">
      <AppHeader user={user} />

      <ScrollReveal>
        <div className="mb-12">
          <h1 className="mb-6 text-5xl font-light tracking-tighter text-ink">
            My calendar
          </h1>
          <p className="max-w-lg text-[13px] leading-relaxed text-ink-dim">
            Meetings you&apos;re invited to and tasks assigned to you, across every
            project. To see these in Google, Outlook or Apple Calendar,{" "}
            <Link
              href="/settings"
              className="rounded text-ink underline underline-offset-4 hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              subscribe from Settings
            </Link>
            .
          </p>
        </div>
      </ScrollReveal>

      <ScrollReveal>
        <ProjectCalendar
          tasks={tasks}
          events={events}
          members={members}
          uid={user.id}
          projectId={null}
        />
      </ScrollReveal>
    </DashboardShell>
  );
}
