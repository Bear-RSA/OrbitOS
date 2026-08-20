import type { OrbitEvent, UpdateEventInput } from "@/types/event";
import { toDateKey } from "@/lib/utils/dates";

/* ------------------------------------------------------------------ */
/*  Engagement form logic                                              */
/*                                                                     */
/*  The parts of the schedule/revise dialog that are decisions rather  */
/*  than markup: what the form starts as, what counts as a change, and */
/*  which changes the server will turn into email.                     */
/*                                                                     */
/*  Separated from the component so the rule that decides who gets     */
/*  mailed can be tested directly. Getting it wrong is not a visual    */
/*  bug — it is either a silent no-op or an unwanted send to a         */
/*  client's inbox, and neither shows up in a screenshot.              */
/* ------------------------------------------------------------------ */

export const DURATIONS = [15, 30, 45, 60, 90, 120] as const;

/** Mirrors the ceiling in `validations/event`, so the form refuses before
    the server has to. */
export const GUEST_LIMIT = 25;

/* The same pragmatic shape check the guest registry uses. It is not RFC
   5322 and is not trying to be — it catches the missing @ and the typo'd
   domain before either costs a send, and Resend does the real check. */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export interface FormShape {
  title: string;
  description: string;
  date: string;
  startTime: string;
  durationMins: number;
  allDay: boolean;
  location: string;
  meetingUrl: string;
  attendees: string[];
  /** Bare addresses for people with no OrbitOS account. */
  guests: string[];
}

/**
 * Vets one typed address against a list already in hand. Pure on purpose
 * — see `addGuests` — and deliberately permissive: an address belonging
 * to a member is accepted here and promoted server-side rather than
 * refused, because the person typing it is not wrong.
 */
export function vetGuest(
  raw: string,
  existing: string[]
): { email?: string; error?: string } {
  const email = raw.trim().toLowerCase().replace(/^[,;\s]+|[,;\s]+$/g, "");
  if (!email) return {}; // nothing typed is not a failure

  if (!EMAIL_SHAPE.test(email)) {
    return { error: `"${email}" does not look like an email address.` };
  }
  if (existing.includes(email)) {
    return { error: "That address is already on the list." };
  }
  if (existing.length >= GUEST_LIMIT) {
    return { error: `Up to ${GUEST_LIMIT} guests per engagement.` };
  }
  return { email };
}

/** Combines a "YYYY-MM-DD" and "HH:mm" into a local instant. */
export function combine(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "90" reads as "1 hr 30 min", not "1.5 hrs". */
export function durationLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  const head = `${hours} hr${hours === 1 ? "" : "s"}`;
  return rest ? `${head} ${rest} min` : head;
}

/**
 * The form's starting values. An engagement is read back as local wall
 * time, matching how it was entered — see the timezone note in
 * `diffEngagement`.
 */
export function valuesFor(
  event: OrbitEvent | null | undefined,
  defaultDateKey: string | null | undefined
): FormShape {
  if (!event) {
    return {
      title: "",
      description: "",
      date: defaultDateKey || toDateKey(new Date()),
      startTime: "09:00",
      durationMins: 30,
      allDay: false,
      location: "",
      meetingUrl: "",
      attendees: [],
      guests: [],
    };
  }

  const start = event.startAt.toDate();
  const end = event.endAt.toDate();

  return {
    title: event.title,
    description: event.description || "",
    date: toDateKey(start),
    startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    // Rounded because a stored span need not be a whole number of minutes.
    durationMins: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000)),
    allDay: event.allDay,
    location: event.location || "",
    meetingUrl: event.meetingUrl || "",
    /* The organizer is dropped: they are implicit, the server puts them
       back on every write, and showing them as a removable chip offers a
       removal that silently does nothing. */
    attendees: (event.attendees ?? []).filter((id) => id !== event.createdBy),
    guests: [], // filled in once the server resolves them
  };
}

export interface Pending {
  patch: UpdateEventInput;
  /**
   * Mirrors the server's own rule for "everyone holding a copy of this
   * now has a wrong one". Kept in step with `updateEventAction` so the
   * warning shown to the organizer matches what actually gets mailed.
   */
  materially: boolean;
  hasChanges: boolean;
  added: number;
  removed: number;
}

/**
 * What changed, as the sparse patch the server expects.
 *
 * Timezone: the date and time inputs are read as LOCAL wall time, exactly
 * as the create form reads them. So when the clock moves, the editor's
 * own zone is recorded with it — whoever sets the time sets the zone it
 * was meant in. The zone is left alone when the instant did not move,
 * which keeps someone editing a title from another country out of the
 * "material change" branch and off everyone's inbox.
 */
export function diffEngagement(
  event: OrbitEvent,
  values: FormShape,
  originalGuests: string[],
  guestsEditable: boolean
): Pending {
  const patch: UpdateEventInput = {};

  if (values.title !== event.title) patch.title = values.title;
  if (values.description !== (event.description || "")) {
    patch.description = values.description;
  }

  const location = (values.location || "").trim();
  if (location !== (event.location || "")) patch.location = location || null;

  const meetingUrl = (values.meetingUrl || "").trim();
  if (meetingUrl !== (event.meetingUrl || "")) patch.meetingUrl = meetingUrl || null;

  if (values.allDay !== event.allDay) patch.allDay = values.allDay;

  const start = values.allDay
    ? combine(values.date, "00:00")
    : combine(values.date, values.startTime);
  const end = values.allDay
    ? new Date(start.getTime() + 86_400_000)
    : new Date(start.getTime() + Number(values.durationMins) * 60_000);

  if (
    start.getTime() !== event.startAt.toDate().getTime() ||
    end.getTime() !== event.endAt.toDate().getTime()
  ) {
    patch.startAt = start.toISOString();
    patch.endAt = end.toISOString();
    patch.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  const previousUids = event.attendees ?? [];
  const nextUids = Array.from(new Set([...(values.attendees ?? []), event.createdBy]));
  const uidsDiffer =
    nextUids.length !== previousUids.length ||
    nextUids.some((id) => !previousUids.includes(id));
  // Sent without the organizer; the server adds them back regardless.
  if (uidsDiffer) patch.attendees = values.attendees;

  /* Guests are omitted entirely until the existing list has loaded. The
     server REPLACES the guest list with whatever it is sent, so posting
     a half-known list would drop the guests that had not arrived yet —
     and mail each of them a cancellation on the way out. */
  const nextGuests = values.guests ?? [];
  const guestsDiffer =
    guestsEditable &&
    (nextGuests.length !== originalGuests.length ||
      nextGuests.some((email) => !originalGuests.includes(email)));
  if (guestsDiffer) patch.guests = nextGuests.map((email) => ({ email }));

  const removed =
    previousUids.filter((id) => !nextUids.includes(id)).length +
    (guestsEditable
      ? originalGuests.filter((email) => !nextGuests.includes(email)).length
      : 0);
  const added =
    nextUids.filter((id) => !previousUids.includes(id)).length +
    (guestsEditable
      ? nextGuests.filter((email) => !originalGuests.includes(email)).length
      : 0);

  const materially =
    patch.startAt !== undefined ||
    patch.allDay !== undefined ||
    patch.timeZone !== undefined ||
    patch.title !== undefined ||
    patch.location !== undefined ||
    patch.meetingUrl !== undefined;

  return {
    patch,
    materially,
    hasChanges: Object.keys(patch).length > 0,
    added,
    removed,
  };
}
