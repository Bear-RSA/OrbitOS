"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireCaller } from "@/lib/auth/caller";
import { resolveRankLimits } from "@/lib/auth/permissions";
import { loadInternalManagementIds, requireAdminTools } from "@/lib/internal-management/store";
import { RANK_LABEL } from "@/lib/members/rank";
import { removeFromWorkspace } from "@/lib/members/remove";
import { sendPush } from "@/lib/notifications/push-sender";
import {
  ACCESS_KIND_LABEL,
  escalationChain,
  escalationTarget,
  parseTicketInput,
  permissionsFor,
  startsWithInternalManagement,
  TICKET_RANKS,
  typesRaisableBy,
  type TicketPermissions,
  type TicketRank,
  type TicketStatus,
  type TicketType,
} from "@/lib/tickets/rules";
import {
  loadTicketStructure,
  memberWithEmail,
  ticketDoc,
  ticketFacts,
  TICKETS,
  type LoadedStructure,
  type StoredTicket,
  type TrailEntry,
  type TrailKind,
} from "@/lib/tickets/store";

import { adminSetRankAction } from "./admin-tools";
import { createInviteAction } from "./invites";
import { assignDepartmentAction } from "./team-structure";

/* ------------------------------------------------------------------ */
/*  Tickets                                                            */
/*                                                                     */
/*  Everyone raises and follows tickets from /tickets. Issues climb    */
/*  the org chart one boss at a time; everything else goes straight    */
/*  to Internal Management, who work the whole queue from Admin Tools  */
/*  and can step in on any ticket, wherever it sits.                   */
/*                                                                     */
/*  The routing and who-may-do-what rules are in `lib/tickets/rules`.  */
/*  Nothing here goes to the workspace activity feed: a ticket is      */
/*  between the people on it.                                          */
/* ------------------------------------------------------------------ */

type Result<T = object> = ({ success: true } & T) | { success: false; error: string };

const INTERNAL_MANAGEMENT = "Internal Management";
const PUSH_TTL = { ttlSeconds: 3 * 24 * 60 * 60 };
const NOTE_MAX = 4000;

export interface TicketView {
  id: string;
  type: TicketType;
  status: TicketStatus;
  title: string;
  details: string;
  facts: { label: string; value: string }[];
  raisedBy: { id: string; name: string };
  /** null while Internal Management has it. */
  holder: { id: string; name: string } | null;
  trail: TrailEntry[];
  createdAt: number;
  updatedAt: number;
  /** How the viewer is connected to it, for grouping on /tickets. */
  relation: "holding" | "raised" | "handled" | "none";
  can: TicketPermissions;
  /** Who an escalation from here would reach. */
  escalatesTo: string | null;
  /** Internal Management's one-click step for this ticket, when it has one. */
  apply: string | null;
}

function now() {
  return Date.now();
}

function entry(by: { uid: string; name: string }, kind: TrailKind, text: string): TrailEntry {
  return { at: now(), by: by.uid, byName: by.name, kind, text };
}

function cleanNote(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, NOTE_MAX) : "";
}

function read(id: string, data: FirebaseFirestore.DocumentData): StoredTicket & { id: string } {
  return { id, ...(data as StoredTicket) };
}

/** The one-click step Internal Management has for this ticket, if any. */
function applyLabel(ticket: StoredTicket, s: LoadedStructure): string | null {
  if (ticket.status !== "OPEN") return null;
  const f = ticket.fields;
  switch (f.type) {
    case "ONBOARDING":
      return memberWithEmail(s, f.email) ? "Set their rank and department" : "Send the invite";
    case "INTERNAL_MOVE":
      return s.people.has(f.subjectUid) ? "Apply the move" : null;
    case "OFFBOARDING":
      return s.people.has(f.subjectUid) ? "Remove them from the workspace" : null;
    default:
      return null;
  }
}

function toView(
  ticket: StoredTicket & { id: string },
  viewerId: string,
  s: LoadedStructure,
  mode: "member" | "admin"
): TicketView {
  const relation: TicketView["relation"] =
    ticket.status === "OPEN" && ticket.holderId === viewerId
      ? "holding"
      : ticket.raisedBy === viewerId
        ? "raised"
        : ticket.heldBy.includes(viewerId)
          ? "handled"
          : "none";

  const can = permissionsFor({ viewerId, status: ticket.status, raisedBy: ticket.raisedBy, holderId: ticket.holderId });
  const target =
    can.escalate && ticket.holderId
      ? escalationTarget({ raiserUid: ticket.raisedBy, holderUid: ticket.holderId, heldBy: ticket.heldBy, s })
      : null;

  return {
    id: ticket.id,
    type: ticket.type,
    status: ticket.status,
    title: ticket.title,
    details: ticket.details,
    facts: ticketFacts(ticket, s.departmentNames),
    raisedBy: { id: ticket.raisedBy, name: s.names.get(ticket.raisedBy) ?? ticket.raisedByName },
    holder: ticket.holderId ? { id: ticket.holderId, name: s.names.get(ticket.holderId) ?? ticket.holderName ?? "" } : null,
    trail: ticket.trail ?? [],
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    relation,
    can,
    escalatesTo: can.escalate ? (target ? s.names.get(target) ?? "their boss" : INTERNAL_MANAGEMENT) : null,
    apply: mode === "admin" ? applyLabel(ticket, s) : null,
  };
}

/** Open first, then the most recently touched. */
function byUrgency(a: TicketView, b: TicketView): number {
  if ((a.status === "OPEN") !== (b.status === "OPEN")) return a.status === "OPEN" ? -1 : 1;
  return b.updatedAt - a.updatedAt;
}

/** Push to whoever has the ticket now: one person, or all of Internal Management. */
async function ringHolder(orgId: string, holderId: string | null, except: string, title: string, body: string, id: string) {
  const to = holderId ? [holderId] : await loadInternalManagementIds(orgId);
  await sendPush(
    to.filter((uid) => uid !== except),
    { title, body, tag: `orbit-ticket-${id}`, url: holderId ? "/tickets" : "/admin" },
    PUSH_TTL
  );
}

async function ringRaiser(ticket: StoredTicket, id: string, except: string, title: string, body: string) {
  if (ticket.raisedBy === except) return;
  await sendPush([ticket.raisedBy], { title, body, tag: `orbit-ticket-${id}`, url: "/tickets" }, PUSH_TTL);
}

/* ------------------------------------------------------------------ */
/*  The Tickets page                                                   */
/* ------------------------------------------------------------------ */

export interface TicketForm {
  types: TicketType[];
  /** For moves and offboarding. Empty unless the viewer may raise those. */
  people: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  /** Ranks a new hire or a move may ask for on this plan. */
  ranks: TicketRank[];
}

export async function getTicketsAction(): Promise<Result<{ tickets: TicketView[]; form: TicketForm }>> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const [snap, s, limits] = await Promise.all([
      adminDb.collection(TICKETS).where("viewers", "array-contains", caller.uid).get(),
      loadTicketStructure(caller.orgId),
      resolveRankLimits(caller.orgId),
    ]);

    const tickets = snap.docs
      .map((doc) => read(doc.id, doc.data()))
      .filter((t) => t.orgId === caller.orgId)
      .map((t) => toView(t, caller.uid, s, "member"))
      .sort(byUrgency);

    const types = typesRaisableBy(caller.role);
    const peopleTypes = types.includes("ONBOARDING");
    return {
      success: true,
      tickets,
      form: {
        types,
        people: peopleTypes
          ? [...s.names.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
          : [],
        departments: [...s.departmentNames.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        ranks: TICKET_RANKS.filter(
          (r) =>
            !(r === "MANAGER" && limits.maxManagers === 0) &&
            !(r === "EXECUTIVE" && limits.maxExecutives === 0) &&
            !(r === "TEAM_LEAD" && limits.maxTeamLeads === 0)
        ),
      },
    };
  } catch (err) {
    console.error("[Tickets] Could not load:", err);
    return { success: false, error: "Could not load your tickets." };
  }
}

function titleFor(fields: StoredTicket["fields"], subjectName: string | null): string {
  switch (fields.type) {
    case "ISSUE":
      return fields.subject;
    case "ACCESS":
      return `Access: ${ACCESS_KIND_LABEL[fields.access]}`;
    case "ONBOARDING":
      return `Onboard ${fields.fullName}`;
    case "INTERNAL_MOVE":
      return `Move ${subjectName}`;
    case "OFFBOARDING":
      return `Offboard ${subjectName}`;
  }
}

export async function raiseTicketAction(input: unknown): Promise<Result<{ id: string }>> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };

  const parsed = parseTicketInput(input);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const { fields, details } = parsed;
  if (!typesRaisableBy(caller.role).includes(fields.type)) {
    return { success: false, error: "Only Owners and Executives raise onboarding, moves and offboarding." };
  }

  try {
    const s = await loadTicketStructure(caller.orgId);

    let subjectName: string | null = null;
    if (fields.type === "INTERNAL_MOVE" || fields.type === "OFFBOARDING") {
      if (!s.people.has(fields.subjectUid)) return { success: false, error: "That person isn't in your workspace." };
      subjectName = s.names.get(fields.subjectUid) ?? null;
    }
    const departmentId =
      fields.type === "ONBOARDING" ? fields.departmentId : fields.type === "INTERNAL_MOVE" && fields.departmentId !== "KEEP" ? fields.departmentId : null;
    if (departmentId && !s.departmentNames.has(departmentId)) {
      return { success: false, error: "That department no longer exists." };
    }
    if (fields.type === "ONBOARDING" && memberWithEmail(s, fields.email)) {
      return { success: false, error: "Someone with that email is already in the workspace." };
    }

    const departmentOfRaiser = s.people.get(caller.uid)?.departmentId ?? null;
    const holderId = startsWithInternalManagement(fields.type) ? null : escalationChain(caller.uid, s)[0] ?? null;
    const holderName = holderId ? s.names.get(holderId) ?? null : null;
    const at = now();
    const ticket: StoredTicket = {
      orgId: caller.orgId,
      type: fields.type,
      status: "OPEN",
      title: titleFor(fields, subjectName),
      details,
      fields,
      raisedBy: caller.uid,
      raisedByName: caller.name,
      holderId,
      holderName,
      heldBy: holderId ? [holderId] : [],
      viewers: holderId ? [caller.uid, holderId] : [caller.uid],
      departmentId: departmentOfRaiser,
      subjectName,
      trail: [entry(caller, "RAISED", holderId ? `Sent to ${holderName}` : `Sent to ${INTERNAL_MANAGEMENT}`)],
      createdAt: at,
      updatedAt: at,
    };

    const ref = adminDb.collection(TICKETS).doc();
    await ref.set(ticket);

    await ringHolder(caller.orgId, holderId, caller.uid, `New ticket from ${caller.name}`, ticket.title, ref.id);
    return { success: true, id: ref.id };
  } catch (err) {
    console.error("[Tickets] Could not raise:", err);
    return { success: false, error: "Could not send the ticket. Try again." };
  }
}

export type TicketStep = "note" | "resolve" | "escalate" | "withdraw";

/** A note, a resolution, an escalation or a withdrawal, from the Tickets page. */
export async function ticketStepAction(input: { ticketId: string; step: TicketStep; note?: string }): Promise<Result> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };
  if (typeof input?.ticketId !== "string" || !input.ticketId) return { success: false, error: "That ticket doesn't exist." };

  const note = cleanNote(input.note);
  if (input.step === "note" && !note) return { success: false, error: "Write the note first." };

  try {
    const s = input.step === "escalate" ? await loadTicketStructure(caller.orgId) : null;

    const outcome = await adminDb.runTransaction(async (tx) => {
      const ref = ticketDoc(input.ticketId);
      const snap = await tx.get(ref);
      const ticket = snap.data() as StoredTicket | undefined;
      if (!ticket || ticket.orgId !== caller.orgId || !ticket.viewers.includes(caller.uid)) {
        return { ok: false as const, error: "That ticket doesn't exist." };
      }

      const can = permissionsFor({ viewerId: caller.uid, status: ticket.status, raisedBy: ticket.raisedBy, holderId: ticket.holderId });
      const trail = [...(ticket.trail ?? [])];
      const update: Partial<StoredTicket> = { updatedAt: now() };

      switch (input.step) {
        case "note":
          if (!can.note) return { ok: false as const, error: "Only the person holding it, or who raised it, can add a note." };
          trail.push(entry(caller, "NOTE", note));
          break;
        case "resolve":
          if (!can.resolve) return { ok: false as const, error: "Only the person holding it can resolve it." };
          trail.push(entry(caller, "RESOLVED", note));
          update.status = "RESOLVED";
          break;
        case "withdraw":
          if (!can.withdraw) return { ok: false as const, error: "Only the person who raised it can withdraw it." };
          trail.push(entry(caller, "WITHDRAWN", note));
          update.status = "WITHDRAWN";
          break;
        case "escalate": {
          if (!can.escalate || !ticket.holderId) return { ok: false as const, error: "Only the person holding it can escalate it." };
          const next = escalationTarget({
            raiserUid: ticket.raisedBy,
            holderUid: ticket.holderId,
            heldBy: ticket.heldBy,
            s: s!,
          });
          const nextName = next ? s!.names.get(next) ?? "" : INTERNAL_MANAGEMENT;
          trail.push(entry(caller, "ESCALATED", note ? `To ${nextName}: ${note}` : `To ${nextName}`));
          update.holderId = next;
          update.holderName = next ? nextName : null;
          if (next) {
            update.heldBy = [...ticket.heldBy, next];
            update.viewers = Array.from(new Set([...ticket.viewers, next]));
          }
          break;
        }
        default:
          return { ok: false as const, error: "That isn't something a ticket can do." };
      }

      update.trail = trail;
      tx.update(ref, update);
      return { ok: true as const, ticket: { ...ticket, ...update } };
    });
    if (!outcome.ok) return { success: false, error: outcome.error };

    const t = outcome.ticket;
    if (input.step === "escalate") {
      await ringHolder(caller.orgId, t.holderId, caller.uid, `${caller.name} escalated a ticket to you`, t.title, input.ticketId);
    } else if (input.step === "resolve") {
      await ringRaiser(t, input.ticketId, caller.uid, "Your ticket was resolved", t.title);
    } else if (input.step === "note" && t.holderId && t.holderId !== caller.uid) {
      await ringHolder(caller.orgId, t.holderId, caller.uid, `${caller.name} added a note`, t.title, input.ticketId);
    }
    return { success: true };
  } catch (err) {
    console.error(`[Tickets] ${input.step} failed:`, err);
    return { success: false, error: "Could not update the ticket. Try again." };
  }
}

/* ------------------------------------------------------------------ */
/*  Internal Management, from Admin Tools                              */
/* ------------------------------------------------------------------ */

export async function listAllTicketsAction(): Promise<Result<{ tickets: TicketView[] }>> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const [snap, s] = await Promise.all([
      adminDb.collection(TICKETS).where("orgId", "==", caller.orgId).get(),
      loadTicketStructure(caller.orgId),
    ]);
    const tickets = snap.docs.map((doc) => toView(read(doc.id, doc.data()), caller.uid, s, "admin")).sort(byUrgency);
    return { success: true, tickets };
  } catch (err) {
    console.error("[Tickets] Could not load the queue:", err);
    return { success: false, error: "Could not load tickets." };
  }
}

export type AdminTicketStep = "note" | "resolve" | "decline" | "step_in";

export async function adminTicketStepAction(input: { ticketId: string; step: AdminTicketStep; note?: string }): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };

  const note = cleanNote(input?.note);
  if (input?.step === "note" && !note) return { success: false, error: "Write the note first." };
  if (input?.step === "decline" && !note) return { success: false, error: "Say why it's declined, so they know what to do next." };

  try {
    const outcome = await adminDb.runTransaction(async (tx) => {
      const ref = ticketDoc(input.ticketId);
      const snap = await tx.get(ref);
      const ticket = snap.data() as StoredTicket | undefined;
      if (!ticket || ticket.orgId !== caller.orgId) return { ok: false as const, error: "That ticket doesn't exist." };
      if (ticket.status !== "OPEN") return { ok: false as const, error: "That ticket is already closed." };

      const trail = [...(ticket.trail ?? [])];
      const update: Partial<StoredTicket> = { updatedAt: now() };
      switch (input.step) {
        case "note":
          trail.push(entry(caller, "NOTE", note));
          break;
        case "resolve":
          trail.push(entry(caller, "RESOLVED", note));
          update.status = "RESOLVED";
          break;
        case "decline":
          trail.push(entry(caller, "DECLINED", note));
          update.status = "DECLINED";
          break;
        case "step_in":
          if (!ticket.holderId) return { ok: false as const, error: `${INTERNAL_MANAGEMENT} already has it.` };
          trail.push(entry(caller, "STEPPED_IN", note ? `${INTERNAL_MANAGEMENT} took it over: ${note}` : `${INTERNAL_MANAGEMENT} took it over`));
          update.holderId = null;
          update.holderName = null;
          break;
        default:
          return { ok: false as const, error: "That isn't something a ticket can do." };
      }
      update.trail = trail;
      tx.update(ref, update);
      return { ok: true as const, ticket: { ...ticket, ...update } };
    });
    if (!outcome.ok) return { success: false, error: outcome.error };

    const t = outcome.ticket;
    if (input.step === "resolve") await ringRaiser(t, input.ticketId, caller.uid, "Your ticket was resolved", t.title);
    if (input.step === "decline") await ringRaiser(t, input.ticketId, caller.uid, "Your ticket was declined", t.title);
    return { success: true };
  } catch (err) {
    console.error(`[Tickets] Admin ${input?.step} failed:`, err);
    return { success: false, error: "Could not update the ticket. Try again." };
  }
}

/** Appends to the trail, and closes the ticket when the work is done. */
async function record(id: string, by: { uid: string; name: string }, text: string, done: boolean) {
  await adminDb.runTransaction(async (tx) => {
    const ref = ticketDoc(id);
    const ticket = (await tx.get(ref)).data() as StoredTicket;
    const trail = [...(ticket.trail ?? []), entry(by, "APPLIED", text)];
    if (done) trail.push(entry(by, "RESOLVED", ""));
    tx.update(ref, { trail, updatedAt: now(), ...(done ? { status: "RESOLVED" } : {}) });
  });
}

/**
 * Does what the ticket asks: sends a new hire's invite and, once they've
 * joined, sets their rank and department; applies a move; removes someone
 * leaving. Each step goes through the same action Admin Tools uses for it
 * by hand, so the same checks and plan limits hold.
 */
export async function applyTicketAction(input: { ticketId: string }): Promise<Result<{ message: string }>> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const snap = await ticketDoc(input?.ticketId ?? "-").get();
    const ticket = snap.data() as StoredTicket | undefined;
    if (!ticket || ticket.orgId !== caller.orgId) return { success: false, error: "That ticket doesn't exist." };
    if (ticket.status !== "OPEN") return { success: false, error: "That ticket is already closed." };

    const s = await loadTicketStructure(caller.orgId);
    const f = ticket.fields;

    /** Rank, then department, each only if it changes. */
    const place = async (uid: string, rank: TicketRank | null, departmentId: string | null | "KEEP") => {
      const done: string[] = [];
      const person = s.people.get(uid)!;
      if (rank && rank !== person.role) {
        const r = await adminSetRankAction({ targetUid: uid, rank });
        if (!r.success) return { ok: false as const, error: r.error };
        done.push(`rank set to ${RANK_LABEL[rank]}`);
      }
      if (departmentId !== "KEEP" && departmentId !== person.departmentId) {
        const r = await assignDepartmentAction({ memberUid: uid, departmentId });
        if (!r.success) return { ok: false as const, error: r.error };
        done.push(departmentId ? `filed in ${s.departmentNames.get(departmentId) ?? "their department"}` : "taken out of their department");
      }
      return { ok: true as const, done };
    };

    switch (f.type) {
      case "ONBOARDING": {
        const joined = memberWithEmail(s, f.email);
        if (!joined) {
          const sent = await createInviteAction({ email: f.email });
          if (!sent.success) return { success: false, error: sent.error ?? "Couldn't send the invite." };
          const message = sent.emailSent
            ? `Invite sent to ${f.email}. Once they join, apply this ticket again to set their rank and department.`
            : `The invite for ${f.email} is ready, but the email didn't send. Copy its link from Invites.`;
          await record(input.ticketId, caller, sent.emailSent ? `Invite sent to ${f.email}` : `Invite created for ${f.email}; the email didn't send`, false);
          return { success: true, message };
        }
        const placed = await place(joined, f.rank, f.departmentId);
        if (!placed.ok) return { success: false, error: placed.error };
        const text = placed.done.length ? `${f.fullName} joined: ${placed.done.join(", ")}` : `${f.fullName} joined, already placed`;
        await record(input.ticketId, caller, text, true);
        return { success: true, message: `${text}. Ticket resolved.` };
      }
      case "INTERNAL_MOVE": {
        if (!s.people.has(f.subjectUid)) return { success: false, error: "They're no longer in the workspace." };
        const placed = await place(f.subjectUid, f.rank, f.departmentId);
        if (!placed.ok) return { success: false, error: placed.error };
        const text = placed.done.length ? `${ticket.subjectName}: ${placed.done.join(", ")}` : `${ticket.subjectName} was already there`;
        await record(input.ticketId, caller, text, true);
        return { success: true, message: `${text}. Ticket resolved.` };
      }
      case "OFFBOARDING": {
        if (!s.people.has(f.subjectUid)) return { success: false, error: "They're no longer in the workspace." };
        if (f.subjectUid === caller.uid) return { success: false, error: "You can't remove yourself. Ask someone else in Internal Management." };
        const im = await loadInternalManagementIds(caller.orgId);
        const inIm = im.includes(f.subjectUid);
        if (inIm && im.length <= 1) {
          return { success: false, error: "They're the last person in Internal Management. Add someone else first." };
        }
        const owners = [...s.people.values()].filter((p) => p.role === "OWNER").length;
        if (s.people.get(f.subjectUid)!.role === "OWNER" && owners <= 1) {
          return { success: false, error: "They're the only Owner. Make someone else an Owner first." };
        }
        await removeFromWorkspace({
          orgId: caller.orgId,
          targetUid: f.subjectUid,
          targetName: ticket.subjectName ?? "A former member",
          targetInInternalManagement: inIm,
          actor: { uid: caller.uid, name: caller.name },
        });
        await record(input.ticketId, caller, `${ticket.subjectName} removed from the workspace`, true);
        return { success: true, message: `${ticket.subjectName} is out of the workspace. Ticket resolved.` };
      }
      default:
        return { success: false, error: "This ticket has nothing to apply. Do what it asks, then resolve it." };
    }
  } catch (err) {
    console.error("[Tickets] Apply failed:", err);
    return { success: false, error: "Could not apply the ticket. Try again." };
  }
}
