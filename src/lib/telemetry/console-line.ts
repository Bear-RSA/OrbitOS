import type { ActivityEventType } from "@/types/activity";

/* ------------------------------------------------------------------ */
/*  Telemetry — Console line                                           */
/*                                                                     */
/*  One line per activity event, readable without opening Firestore:   */
/*                                                                     */
/*    [Telemetry] 14:03:22 DIRECTIVE_TRANSITION by Bear — "Ship the    */
/*      thing" (in_progress → done) · project a1b2c3d4 · doc 9f8e7d6c  */
/*                                                                     */
/*  Call sites disagree on metadata key names (taskTitle vs title,     */
/*  oldName/newName vs from/to), so the subject and detail pickers     */
/*  below try every spelling in use rather than forcing a migration.   */
/*  Pure so it can be tested without firebase-admin.                   */
/* ------------------------------------------------------------------ */

/** Keys that name the thing the event happened to, in preference order. */
const SUBJECT_KEYS = [
  "fileName",
  "taskTitle",
  "title",
  "eventTitle",
  "projectName",
  "newName",
  "toName",
  "targetName",
  "memberName",
  "assigneeName",
  "groupName",
  "email",
] as const;

function pickSubject(m: Record<string, any>): string | null {
  for (const key of SUBJECT_KEYS) {
    const v = m[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/** Secondary facts worth a glance: transitions, categories, counts, reasons. */
function pickDetails(m: Record<string, any>): string[] {
  const out: string[] = [];

  const from = m.from ?? m.oldName ?? m.previousTier;
  const to = m.to ?? m.newName ?? m.newTier ?? m.status;
  // `to` on CALL_STARTED is a uid; toName already covers it as the subject.
  const toIsUid = "toName" in m;
  if (from && to && !toIsUid) out.push(`${from} → ${to}`);
  else if (to && !from && !toIsUid) out.push(`→ ${to}`);

  if (m.field) out.push(`field: ${m.field}`);
  if (m.category) out.push(`category: ${m.category}`);
  if (m.clearance) out.push(`clearance: ${m.clearance}`);
  if (m.role) out.push(`role: ${m.role}`);
  if (m.rsvp) out.push(`rsvp: ${m.rsvp}`);
  if (m.reason) out.push(`reason: ${m.reason}`);
  if (m.load) out.push(`load: ${m.load}`);
  if (m.action) out.push(`action: ${m.action}`);
  if (typeof m.lines === "number") out.push(`${m.lines} lines`);
  if (typeof m.attendeeCount === "number") out.push(`${m.attendeeCount} attending`);
  if (typeof m.participants === "number") out.push(`${m.participants} participants`);
  if (typeof m.delta === "number") out.push(`delta ${m.delta > 0 ? "+" : ""}${m.delta}`);
  if (m.rescheduled === true) out.push("rescheduled");
  if (m.viaGuestLink === true) out.push("via guest link");
  if (m.emailSent === false) out.push("email NOT sent");
  if (m.reused === true) out.push("invite reused");
  if (m.regenerated === true) out.push("invite regenerated");
  if (m.contentPreview) out.push(`“${String(m.contentPreview).trim()}”`);

  return out;
}

function shortId(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.length > 8 ? id.slice(0, 8) : id;
}

export interface ConsoleLineInput {
  eventType: ActivityEventType;
  actor: { uid: string; name: string };
  projectId: string | null;
  metadata: Record<string, any>;
  /** Firestore id of the written event; absent when the write failed. */
  docId?: string;
  /** Injectable for tests. */
  now?: Date;
}

export function formatTelemetryLine({
  eventType,
  actor,
  projectId,
  metadata,
  docId,
  now = new Date(),
}: ConsoleLineInput): string {
  const time = now.toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const who = actor.name?.trim() || shortId(actor.uid) || "unknown";
  const subject = pickSubject(metadata);
  const details = pickDetails(metadata);

  let line = `${time} ${eventType} by ${who}`;
  if (subject) line += ` — "${subject}"`;
  if (details.length) line += `${subject ? " " : " — "}(${details.join(", ")})`;

  const tail: string[] = [projectId ? `project ${shortId(projectId)}` : "org-wide"];
  if (docId) tail.push(`doc ${shortId(docId)}`);
  line += ` · ${tail.join(" · ")}`;

  return line;
}
