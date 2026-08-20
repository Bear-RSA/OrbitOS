import { createHash } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { GuestInviteInput } from "@/types/guest";

/* ------------------------------------------------------------------ */
/*  Guest registry                                                     */
/*                                                                     */
/*  The rule that makes the rest of this work: an invited address is   */
/*  looked up before it is treated as external. If it already belongs  */
/*  to someone in this workspace, they are added as a MEMBER — with    */
/*  their real profile, their real availability, and their own feed —  */
/*  not as a stranger who happens to share their email. Skipping that  */
/*  check is how a person ends up on their own engagement twice under  */
/*  two identities.                                                    */
/*                                                                     */
/*  Everything else becomes a guest record. The id is derived from     */
/*  org + address rather than auto-generated, which buys idempotence   */
/*  for free: inviting the same client to a second engagement resolves */
/*  to the record that already exists, so their history accumulates in */
/*  one place instead of forking a new identity per meeting.           */
/* ------------------------------------------------------------------ */

const GUESTS = "guests";

/** Case and whitespace are not identity. Everything keys off this form. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deterministic id for an address within one workspace. Hashed rather
 * than built from the raw address so the document id is not itself a
 * piece of personal data — ids show up in logs, URLs, and error traces.
 */
export function guestIdFor(orgId: string, email: string): string {
  const digest = createHash("sha256")
    .update(`${orgId}:${normalizeEmail(email)}`)
    .digest("hex");
  return `g_${digest.slice(0, 24)}`;
}

/** "sarah.klein@studio.com" becomes "Sarah Klein" — better than a raw address. */
export function nameFromEmail(email: string): string {
  const local = normalizeEmail(email).split("@")[0] ?? "";
  const words = local
    .replace(/[._-]+/g, " ")
    .replace(/[0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "Guest";
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export interface ResolvedGuest {
  id: string;
  email: string;
  name: string;
  tokenVersion: number;
  /** True the first time this address is seen in this workspace. */
  created: boolean;
}

export interface ResolutionOutcome {
  /** Guest records for the addresses that are genuinely off-platform. */
  guests: ResolvedGuest[];
  /**
   * uids for invited addresses that turned out to belong to members.
   * Callers must fold these into the attendee list.
   */
  promotedUids: string[];
  /** Addresses rejected as malformed, echoed back for the error message. */
  invalid: string[];
}

/* A pragmatic shape check, not RFC 5322. The address is going to Resend,
   which does its own validation and will bounce; this only catches the
   obvious typo before it costs a send. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * Turns raw invite input into guest records, promoting anyone who turns
 * out to already be a member.
 *
 * Writes are idempotent: an existing guest keeps its `tokenVersion` and
 * `createdAt`, and only gains a name if it did not already have one.
 */
export async function resolveGuestInvites(
  orgId: string,
  invitedBy: string,
  inputs: GuestInviteInput[]
): Promise<ResolutionOutcome> {
  const outcome: ResolutionOutcome = { guests: [], promotedUids: [], invalid: [] };
  if (inputs.length === 0) return outcome;

  // Dedupe by address first — the same person listed twice is one invite.
  const byEmail = new Map<string, GuestInviteInput>();
  for (const input of inputs) {
    const email = normalizeEmail(input.email ?? "");
    if (!EMAIL_SHAPE.test(email)) {
      outcome.invalid.push(input.email);
      continue;
    }
    // A later entry carrying a real name beats an earlier one without.
    const existing = byEmail.get(email);
    if (!existing || (!existing.name && input.name)) byEmail.set(email, { ...input, email });
  }
  if (byEmail.size === 0) return outcome;

  const emails = [...byEmail.keys()];

  /* Membership lookup. `in` caps at 30 values per query and the attendee
     ceiling is 50, so this chunks rather than assuming one round trip. */
  const memberByEmail = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 30) {
    const chunk = emails.slice(i, i + 30);
    const snap = await adminDb
      .collection("users")
      .where("orgId", "==", orgId)
      .where("email", "in", chunk)
      .get();
    for (const doc of snap.docs) {
      const email = normalizeEmail((doc.data().email as string) ?? "");
      if (email) memberByEmail.set(email, doc.id);
    }
  }

  const now = Timestamp.now();
  const batch = adminDb.batch();
  let writes = 0;

  for (const [email, input] of byEmail) {
    const memberUid = memberByEmail.get(email);
    if (memberUid) {
      outcome.promotedUids.push(memberUid);
      continue;
    }

    const id = guestIdFor(orgId, email);
    const ref = adminDb.collection(GUESTS).doc(id);
    const snap = await ref.get();

    if (snap.exists) {
      const data = snap.data()!;

      /* If this address has since joined the workspace, the account is
         the identity now — the stale guest record must not be revived. */
      if (data.linkedUid) {
        outcome.promotedUids.push(data.linkedUid as string);
        continue;
      }

      const name = (data.name as string) || input.name?.trim() || nameFromEmail(email);
      batch.update(ref, { name, lastInvitedAt: now, updatedAt: now });
      writes++;

      outcome.guests.push({
        id,
        email,
        name,
        tokenVersion: Number(data.tokenVersion ?? 0),
        created: false,
      });
      continue;
    }

    const name = input.name?.trim() || nameFromEmail(email);
    batch.set(ref, {
      orgId,
      email,
      name,
      linkedUid: null,
      tokenVersion: 0,
      invitedBy,
      lastInvitedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    writes++;

    outcome.guests.push({ id, email, name, tokenVersion: 0, created: true });
  }

  if (writes > 0) await batch.commit();
  return outcome;
}

/** Hydrates guest records by id, skipping any that have gone missing. */
export async function loadGuests(guestIds: string[]): Promise<ResolvedGuest[]> {
  if (guestIds.length === 0) return [];

  const refs = guestIds.map((id) => adminDb.collection(GUESTS).doc(id));
  const snaps = await adminDb.getAll(...refs);

  return snaps
    .filter((snap) => snap.exists)
    .map((snap) => {
      const data = snap.data()!;
      const email = data.email as string;
      return {
        id: snap.id,
        email,
        name: (data.name as string) || nameFromEmail(email),
        tokenVersion: Number(data.tokenVersion ?? 0),
        created: false,
      };
    });
}

/**
 * Points every guest record for this address at a real account.
 *
 * Call this when someone joins an org. Their past engagements keep
 * resolving through the guest id — rewriting historical attendee lists
 * would be a fan-out write for no gain — while every future invite to
 * the same address resolves to the account instead.
 */
export async function linkGuestToAccount(
  orgId: string,
  email: string,
  uid: string
): Promise<void> {
  const ref = adminDb.collection(GUESTS).doc(guestIdFor(orgId, email));
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.linkedUid) return;

  await ref.update({
    linkedUid: uid,
    updatedAt: Timestamp.now(),
    // Any RSVP link already sitting in their inbox stops working; they
    // have an account now and answer through it.
    tokenVersion: FieldValue.increment(1),
  });
}
