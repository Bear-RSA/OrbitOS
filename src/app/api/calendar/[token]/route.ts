import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { verifyFeedToken } from "@/lib/calendar/feed-token";
import { buildCalendar, IcsEntry } from "@/lib/calendar/ics";

/* ------------------------------------------------------------------ */
/*  Personal calendar feed (read-only ICS)                             */
/*                                                                     */
/*  One-way and unauthenticated by design: the signed URL is the       */
/*  credential, because a calendar client cannot sign in. Subscribing  */
/*  puts OrbitOS inside Google, Outlook, and Apple Calendar with no    */
/*  OAuth, no refresh tokens, and no sync loop to keep alive.          */
/*                                                                     */
/*  The feed is personal, not organizational — directives assigned to  */
/*  this operative and engagements they are on. A feed of the whole    */
/*  workspace would be noise in someone's day view.                    */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How far either side of today the feed reaches. */
const PAST_DAYS = 90;
const FUTURE_DAYS = 365;

const DAY_MS = 86_400_000;

/** Adds days to a "YYYY-MM-DD" key without going through a timezone. */
function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/** Nothing here should leak whether a uid exists. */
function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await params;

  // Clients are happier when the URL ends in .ics; it is not part of the token.
  const token = rawToken.replace(/\.ics$/i, "");

  let identity;
  try {
    identity = verifyFeedToken(token);
  } catch (err) {
    // A missing secret is a deployment fault, not a bad request.
    console.error("[CalendarFeed] Token verification unavailable:", err);
    return new Response("Calendar feed is not configured", { status: 503 });
  }
  if (!identity) return notFound();

  try {
    const userSnap = await adminDb.collection("users").doc(identity.uid).get();
    if (!userSnap.exists) return notFound();

    const user = userSnap.data()!;
    const currentVersion = Number(user.calendarFeedVersion ?? 0);

    // A revoked URL is indistinguishable from one that never existed.
    if (currentVersion !== identity.version) return notFound();
    if (!user.orgId) return notFound();

    const now = Date.now();
    const todayKey = new Date().toISOString().slice(0, 10);
    const fromKey = shiftDateKey(todayKey, -PAST_DAYS);
    const toKey = shiftDateKey(todayKey, FUTURE_DAYS);
    const windowStart = Timestamp.fromMillis(now - PAST_DAYS * DAY_MS);
    const windowEnd = Timestamp.fromMillis(now + FUTURE_DAYS * DAY_MS);

    /* Both reads filter on a single array field so they ride the automatic
       index. Org is re-checked in memory — cheap, and it keeps this route
       off the composite-index list. */
    const [taskSnap, eventSnap] = await Promise.all([
      adminDb.collection("tasks").where("assignedTo", "array-contains", identity.uid).get(),
      adminDb.collection("events").where("attendees", "array-contains", identity.uid).get(),
    ]);

    const entries: IcsEntry[] = [];

    /* ---- Directives → all-day entries ---- */
    for (const doc of taskSnap.docs) {
      const task = doc.data();
      if (task.orgId !== user.orgId) continue;
      if (task.status === "done") continue; // completed work is not a commitment

      const dueDateKey: string | null =
        task.dueDateKey ??
        (task.dueDate?.toDate ? task.dueDate.toDate().toISOString().slice(0, 10) : null);

      if (!dueDateKey) continue; // undated directives never enter a calendar
      if (dueDateKey < fromKey || dueDateKey > toKey) continue;

      entries.push({
        uid: `task-${doc.id}@orbitos`,
        summary: task.isBlocked ? `[Blocked] ${task.title}` : task.title,
        description: task.description || null,
        timing: {
          allDay: true,
          startDate: dueDateKey,
          // DTEND is exclusive, so a one-day entry ends the next morning.
          endDate: shiftDateKey(dueDateKey, 1),
        },
        status: "CONFIRMED",
        categories: ["Directive"],
        lastModified: task.updatedAt?.toDate?.() ?? undefined,
      });
    }

    /* ---- Engagements → timed entries ---- */
    for (const doc of eventSnap.docs) {
      const event = doc.data();
      if (event.orgId !== user.orgId) continue;
      // A cancelled engagement simply leaves the feed; clients re-sync whole.
      if (event.status === "cancelled") continue;
      if (!event.startAt || !event.endAt) continue;

      const startAt: Timestamp = event.startAt;
      if (startAt.toMillis() < windowStart.toMillis()) continue;
      if (startAt.toMillis() > windowEnd.toMillis()) continue;

      const startDateKey: string =
        event.startDateKey ?? startAt.toDate().toISOString().slice(0, 10);

      entries.push({
        /* Same UID the emailed invitation carries, so a client that has
           both this feed and the invite recognises them as one meeting
           rather than two. The stored sequence travels with it for the
           same reason — a feed pinned at 0 would look older than every
           invite and lose to it on any client that reconciles the two. */
        uid: `event-${doc.id}@orbitos`,
        sequence: Number(event.sequence ?? 0),
        summary: event.title,
        description: event.description || null,
        location: event.location || null,
        url: event.meetingUrl || null,
        timing: event.allDay
          ? {
              allDay: true,
              startDate: startDateKey,
              endDate: shiftDateKey(startDateKey, 1),
            }
          : {
              allDay: false,
              start: startAt.toDate(),
              end: (event.endAt as Timestamp).toDate(),
            },
        status: "CONFIRMED",
        categories: ["Engagement"],
        lastModified: event.updatedAt?.toDate?.() ?? undefined,
      });
    }

    const body = buildCalendar({
      name: "OrbitOS",
      description: `Directives and engagements for ${user.name || "your account"}.`,
      entries,
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        // inline, not attachment — a subscription should not download a file.
        "Content-Disposition": 'inline; filename="orbitos.ics"',
        "Cache-Control": "private, max-age=300",
        // The URL is a bearer credential; keep it out of crawlers and logs.
        "X-Robots-Tag": "noindex, nofollow",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (err) {
    console.error("[CalendarFeed] Failed to build feed:", err);
    return new Response("Failed to build calendar", { status: 500 });
  }
}
