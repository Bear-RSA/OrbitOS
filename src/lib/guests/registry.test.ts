import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore, type Row } from "@/lib/testing/fake-firestore";

/* ------------------------------------------------------------------ */
/*  Guest registry                                                     */
/*                                                                     */
/*  Two things here are worth more than the rest combined.             */
/*                                                                     */
/*  The first is the membership lookup: an invited address that        */
/*  belongs to someone in the workspace has to come back as a MEMBER,  */
/*  or that person ends up on their own engagement twice under two     */
/*  identities, one of which cannot see the app.                       */
/*                                                                     */
/*  The second is idempotence. The guest id is derived from org +      */
/*  address, so inviting the same client again must land on the record */
/*  that already exists rather than forking a new identity — and must  */
/*  not reset the tokenVersion, which would silently kill every RSVP   */
/*  link already sitting in that person's inbox.                       */
/* ------------------------------------------------------------------ */

const db = new FakeFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: db }));

const {
  guestIdFor,
  linkGuestToAccount,
  loadGuests,
  nameFromEmail,
  normalizeEmail,
  resolveGuestInvites,
} = await import("@/lib/guests/registry");

const ORG = "org-1";
const INVITER = "u1";

function seedMember(uid: string, email: string, orgId = ORG) {
  db.seed("users", uid, { email, orgId, name: `User ${uid}` });
}

function seedGuest(email: string, overrides: Row = {}) {
  const id = guestIdFor(ORG, email);
  db.seed("guests", id, {
    orgId: ORG,
    email: normalizeEmail(email),
    name: "Existing Name",
    linkedUid: null,
    tokenVersion: 0,
    invitedBy: INVITER,
    createdAt: Timestamp.fromMillis(1000),
    updatedAt: Timestamp.fromMillis(1000),
    ...overrides,
  });
  return id;
}

beforeEach(() => {
  db.reset();
});

/* ------------------------------------------------------------------ */

describe("normalizeEmail", () => {
  it("treats case and whitespace as noise, not identity", () => {
    expect(normalizeEmail("  Sarah.Klein@Studio.COM ")).toBe(
      "sarah.klein@studio.com"
    );
  });
});

describe("guestIdFor", () => {
  it("is stable for the same address", () => {
    expect(guestIdFor(ORG, "a@b.com")).toBe(guestIdFor(ORG, "a@b.com"));
  });

  it("ignores case and surrounding whitespace", () => {
    expect(guestIdFor(ORG, " A@B.com ")).toBe(guestIdFor(ORG, "a@b.com"));
  });

  it("scopes the id to one workspace", () => {
    // The same client at two studios must not share a record.
    expect(guestIdFor("org-1", "a@b.com")).not.toBe(guestIdFor("org-2", "a@b.com"));
  });

  it("does not embed the address in the id", () => {
    // Ids show up in logs, URLs, and traces; the address must not.
    const id = guestIdFor(ORG, "sarah.klein@studio.com");
    expect(id).toMatch(/^g_[0-9a-f]{24}$/);
    expect(id).not.toContain("sarah");
    expect(id).not.toContain("studio");
  });
});

describe("nameFromEmail", () => {
  it("reads a name out of a dotted local part", () => {
    expect(nameFromEmail("sarah.klein@studio.com")).toBe("Sarah Klein");
  });

  it("handles underscores and hyphens the same way", () => {
    expect(nameFromEmail("thabo_ndlovu@x.com")).toBe("Thabo Ndlovu");
    expect(nameFromEmail("ana-reis@x.com")).toBe("Ana Reis");
  });

  it("drops digits rather than capitalising them", () => {
    expect(nameFromEmail("sarah99@studio.com")).toBe("Sarah");
  });

  it("falls back to `Guest` when there is no name to find", () => {
    expect(nameFromEmail("12345@studio.com")).toBe("Guest");
  });
});

describe("resolveGuestInvites — membership takes precedence", () => {
  it("promotes an address that belongs to a member", async () => {
    seedMember("member-1", "sarah@studio.com");

    const outcome = await resolveGuestInvites(ORG, INVITER, [
      { email: "sarah@studio.com" },
    ]);

    expect(outcome.promotedUids).toEqual(["member-1"]);
    expect(outcome.guests).toEqual([]);
    // Nothing written — a member needs no guest record.
    expect(db.ids("guests")).toEqual([]);
  });

  it("matches a member regardless of how the address was typed", async () => {
    seedMember("member-1", "sarah@studio.com");

    const outcome = await resolveGuestInvites(ORG, INVITER, [
      { email: "  Sarah@Studio.com " },
    ]);

    expect(outcome.promotedUids).toEqual(["member-1"]);
  });

  it("does not promote a member of a different workspace", async () => {
    seedMember("outsider", "sarah@studio.com", "org-2");

    const outcome = await resolveGuestInvites(ORG, INVITER, [
      { email: "sarah@studio.com" },
    ]);

    expect(outcome.promotedUids).toEqual([]);
    expect(outcome.guests).toHaveLength(1);
  });

  it("promotes rather than reviving a guest who has since joined", async () => {
    seedGuest("sarah@studio.com", { linkedUid: "member-1" });

    const outcome = await resolveGuestInvites(ORG, INVITER, [
      { email: "sarah@studio.com" },
    ]);

    expect(outcome.promotedUids).toEqual(["member-1"]);
    expect(outcome.guests).toEqual([]);
  });
});

describe("resolveGuestInvites — creating and reusing records", () => {
  it("creates a record for a genuinely external address", async () => {
    const outcome = await resolveGuestInvites(ORG, INVITER, [
      { email: "client@acme.com", name: "Priya Naidoo" },
    ]);

    expect(outcome.guests).toHaveLength(1);
    const [guest] = outcome.guests;
    expect(guest.created).toBe(true);
    expect(guest.email).toBe("client@acme.com");
    expect(guest.name).toBe("Priya Naidoo");
    expect(guest.tokenVersion).toBe(0);

    const stored = db.read("guests", guest.id)!;
    expect(stored.orgId).toBe(ORG);
    expect(stored.invitedBy).toBe(INVITER);
    expect(stored.linkedUid).toBeNull();
  });

  it("derives a name when none was supplied", async () => {
    const outcome = await resolveGuestInvites(ORG, INVITER, [
      { email: "sarah.klein@acme.com" },
    ]);

    expect(outcome.guests[0].name).toBe("Sarah Klein");
  });

  it("reuses the existing record on a second invitation", async () => {
    const id = seedGuest("client@acme.com", { tokenVersion: 3 });

    const outcome = await resolveGuestInvites(ORG, INVITER, [
      { email: "client@acme.com" },
    ]);

    expect(outcome.guests[0].id).toBe(id);
    expect(outcome.guests[0].created).toBe(false);
    // Resetting this would kill every RSVP link already in their inbox.
    expect(outcome.guests[0].tokenVersion).toBe(3);
    expect(db.ids("guests")).toHaveLength(1);
  });

  it("keeps the name already on file rather than overwriting it", async () => {
    seedGuest("client@acme.com", { name: "Priya Naidoo" });

    const outcome = await resolveGuestInvites(ORG, INVITER, [
      { email: "client@acme.com", name: "Typo Name" },
    ]);

    expect(outcome.guests[0].name).toBe("Priya Naidoo");
  });

  it("preserves createdAt while refreshing lastInvitedAt", async () => {
    const id = seedGuest("client@acme.com");
    const before = db.read("guests", id)!.createdAt;

    await resolveGuestInvites(ORG, INVITER, [{ email: "client@acme.com" }]);

    const after = db.read("guests", id)!;
    expect(after.createdAt).toBe(before);
    expect(after.lastInvitedAt).toBeDefined();
  });
});

describe("resolveGuestInvites — input handling", () => {
  it("does nothing for an empty list, including no write", async () => {
    const outcome = await resolveGuestInvites(ORG, INVITER, []);

    expect(outcome).toEqual({ guests: [], promotedUids: [], invalid: [] });
    expect(db.batchCommits).toBe(0);
  });

  it("reports malformed addresses instead of mailing them", async () => {
    const outcome = await resolveGuestInvites(ORG, INVITER, [
      { email: "not-an-address" },
      { email: "missing@tld" },
      { email: "spaces in@acme.com" },
      { email: "fine@acme.com" },
    ]);

    expect(outcome.invalid).toEqual([
      "not-an-address",
      "missing@tld",
      "spaces in@acme.com",
    ]);
    expect(outcome.guests).toHaveLength(1);
  });

  it("counts the same person listed twice as one invitation", async () => {
    const outcome = await resolveGuestInvites(ORG, INVITER, [
      { email: "client@acme.com" },
      { email: "CLIENT@acme.com" },
      { email: " client@acme.com " },
    ]);

    expect(outcome.guests).toHaveLength(1);
    expect(db.ids("guests")).toHaveLength(1);
  });

  it("prefers the duplicate entry that carries a real name", async () => {
    const outcome = await resolveGuestInvites(ORG, INVITER, [
      { email: "client@acme.com" },
      { email: "client@acme.com", name: "Priya Naidoo" },
    ]);

    expect(outcome.guests[0].name).toBe("Priya Naidoo");
  });

  it("chunks the membership lookup past Firestore's 30-value `in` cap", async () => {
    // 35 addresses, one of which is a member sitting in the second chunk.
    const inputs = Array.from({ length: 35 }, (_, i) => ({
      email: `person${i}@acme.com`,
    }));
    seedMember("member-1", "person32@acme.com");

    const outcome = await resolveGuestInvites(ORG, INVITER, inputs);

    expect(outcome.promotedUids).toEqual(["member-1"]);
    expect(outcome.guests).toHaveLength(34);
  });
});

describe("loadGuests", () => {
  it("hydrates records by id", async () => {
    const id = seedGuest("client@acme.com", { name: "Priya Naidoo", tokenVersion: 2 });

    const loaded = await loadGuests([id]);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      id,
      email: "client@acme.com",
      name: "Priya Naidoo",
      tokenVersion: 2,
    });
  });

  it("returns nothing for an empty list without touching Firestore", async () => {
    expect(await loadGuests([])).toEqual([]);
  });

  it("skips ids that have gone missing rather than throwing", async () => {
    const id = seedGuest("client@acme.com");

    const loaded = await loadGuests([id, "g_deadbeef", "g_alsogone"]);

    expect(loaded.map((g) => g.id)).toEqual([id]);
  });

  it("derives a name for a record that never had one", async () => {
    const id = seedGuest("sarah.klein@acme.com", { name: "" });

    const loaded = await loadGuests([id]);
    expect(loaded[0].name).toBe("Sarah Klein");
  });
});

describe("linkGuestToAccount", () => {
  it("points the record at the account and invalidates old links", async () => {
    const id = seedGuest("sarah@studio.com", { tokenVersion: 4 });

    await linkGuestToAccount(ORG, "sarah@studio.com", "member-1");

    const stored = db.read("guests", id)!;
    expect(stored.linkedUid).toBe("member-1");
    // They have an account now and answer through it, so any RSVP link
    // already sent has to stop working.
    expect(stored.tokenVersion).toBe(5);
  });

  it("matches the record regardless of address casing", async () => {
    const id = seedGuest("sarah@studio.com");

    await linkGuestToAccount(ORG, "  Sarah@Studio.com ", "member-1");

    expect(db.read("guests", id)!.linkedUid).toBe("member-1");
  });

  it("does nothing when there is no guest record", async () => {
    await linkGuestToAccount(ORG, "nobody@acme.com", "member-1");
    expect(db.directWrites).toEqual([]);
  });

  it("leaves an already-linked record alone", async () => {
    const id = seedGuest("sarah@studio.com", {
      linkedUid: "member-1",
      tokenVersion: 4,
    });

    await linkGuestToAccount(ORG, "sarah@studio.com", "member-2");

    const stored = db.read("guests", id)!;
    expect(stored.linkedUid).toBe("member-1");
    // No second increment — re-linking must not invalidate live links.
    expect(stored.tokenVersion).toBe(4);
    expect(db.directWrites).toEqual([]);
  });
});
