import { adminDb } from "@/lib/firebase/admin";
import {
  departmentNodeId,
  kindOfRole,
  liveParents,
  personNodeId,
  type ChartNodeKind,
} from "@/lib/members/org-chart";
import { memberDisplayName } from "@/lib/members/profile";
import { normaliseRole, RANK_LABEL } from "@/lib/members/rank";

import {
  ACCESS_KIND_LABEL,
  type TicketFields,
  type TicketStatus,
  type TicketStructure,
  type TicketType,
} from "./rules";

/* ------------------------------------------------------------------ */
/*  Tickets, read on the server                                        */
/*                                                                     */
/*  `tickets/{id}`, scoped by `orgId`. The rules' catch-all denies     */
/*  every client, so `actions/tickets` is the only way in: an          */
/*  offboarding ticket names someone who mustn't see it, and who can   */
/*  read which ticket is decided here, not in the browser.             */
/* ------------------------------------------------------------------ */

export const TICKETS = "tickets";

export type TrailKind = "RAISED" | "ESCALATED" | "STEPPED_IN" | "NOTE" | "APPLIED" | "RESOLVED" | "DECLINED" | "WITHDRAWN";

export interface TrailEntry {
  /** Epoch ms. */
  at: number;
  by: string;
  byName: string;
  kind: TrailKind;
  text: string;
}

export interface StoredTicket {
  orgId: string;
  type: TicketType;
  status: TicketStatus;
  title: string;
  details: string;
  fields: TicketFields;
  raisedBy: string;
  raisedByName: string;
  /** Who it sits with now; null while Internal Management has it. */
  holderId: string | null;
  holderName: string | null;
  /** Everyone who has held it, oldest first. Escalation never goes back to one of them. */
  heldBy: string[];
  /** Who may read it from the Tickets page: the raiser and everyone who held it. */
  viewers: string[];
  /** The raiser's department when they raised it. Kept for the record; issues climb the wires. */
  departmentId: string | null;
  /** The person a move or offboarding is about, kept by name once they've left. */
  subjectName: string | null;
  trail: TrailEntry[];
  createdAt: number;
  updatedAt: number;
}

export function ticketDoc(id: string) {
  return adminDb.collection(TICKETS).doc(id);
}

export interface LoadedStructure extends TicketStructure {
  names: Map<string, string>;
  /** Lowercased, for matching a new hire who has joined. Never sent to a browser. */
  emails: Map<string, string>;
  departmentNames: Map<string, string>;
}

/** The person in the workspace with this email, if they've joined. */
export function memberWithEmail(s: LoadedStructure, email: string): string | null {
  for (const [id, address] of s.emails) if (address === email) return id;
  return null;
}

/** People, departments and the org chart's wires, for routing and for names. */
export async function loadTicketStructure(orgId: string): Promise<LoadedStructure> {
  const [usersSnap, departmentsSnap, chartSnap] = await Promise.all([
    adminDb.collection("users").where("orgId", "==", orgId).get(),
    adminDb.collection("departments").where("orgId", "==", orgId).get(),
    adminDb.collection("org_chart").doc(orgId).get(),
  ]);

  const people: TicketStructure["people"] = new Map(
    usersSnap.docs.map((doc) => {
      const data = doc.data();
      return [
        doc.id,
        {
          role: normaliseRole(data.role),
          departmentId: typeof data.departmentId === "string" ? data.departmentId : null,
        },
      ] as const;
    })
  );
  const names = new Map(usersSnap.docs.map((doc) => [doc.id, memberDisplayName({ name: doc.data().name as string | undefined })]));
  const emails = new Map(usersSnap.docs.map((doc) => [doc.id, ((doc.data().email as string) || "").toLowerCase()]));

  const departmentNames = new Map(departmentsSnap.docs.map((doc) => [doc.id, (doc.data().name as string) || "Untitled"]));

  const kinds = new Map<string, ChartNodeKind>();
  for (const [id, person] of people) kinds.set(personNodeId(id), kindOfRole(person.role));
  for (const id of departmentNames.keys()) kinds.set(departmentNodeId(id), "DEPARTMENT");

  const parents = liveParents(((chartSnap.data() ?? {}).parents ?? {}) as Record<string, unknown>, kinds);
  return { people, parents, names, emails, departmentNames };
}

/* ------------------------------------------------------------------ */
/*  What the screens show                                              */
/* ------------------------------------------------------------------ */

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function formatTicketDate(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? ymd : DATE_FORMAT.format(date);
}

/** The particulars as label and value, ready to list. */
export function ticketFacts(ticket: StoredTicket, departmentNames: ReadonlyMap<string, string>): { label: string; value: string }[] {
  const f = ticket.fields;
  const department = (id: string | null) => (id ? departmentNames.get(id) ?? "A deleted department" : "No department");

  switch (f.type) {
    case "ISSUE":
      return [];
    case "ACCESS":
      return [{ label: "Needs", value: ACCESS_KIND_LABEL[f.access] }];
    case "ONBOARDING":
      return [
        { label: "Name", value: f.fullName },
        { label: "Email", value: f.email },
        ...(f.jobTitle ? [{ label: "Job title", value: f.jobTitle }] : []),
        { label: "Rank", value: RANK_LABEL[f.rank] },
        { label: "Department", value: department(f.departmentId) },
        { label: "Starts", value: formatTicketDate(f.startDate) },
      ];
    case "INTERNAL_MOVE":
      return [
        { label: "Who", value: ticket.subjectName ?? "Someone who has left" },
        { label: "New rank", value: f.rank ? RANK_LABEL[f.rank] : "Stays the same" },
        { label: "Department", value: f.departmentId === "KEEP" ? "Stays the same" : department(f.departmentId) },
        { label: "From", value: formatTicketDate(f.effectiveDate) },
      ];
    case "OFFBOARDING":
      return [
        { label: "Who", value: ticket.subjectName ?? "Someone who has left" },
        { label: "Last day", value: formatTicketDate(f.lastDay) },
      ];
  }
}
