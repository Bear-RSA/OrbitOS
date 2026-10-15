import { describe, expect, it } from "vitest";
import {
  canCreateGroup,
  canDeleteMessage,
  canEditMessage,
  canManageTownHall,
  canOpenDm,
  canPostToConversation,
  canReadConversation,
  type ConversationFacts,
  type GroupFacts,
  type MessageFacts,
} from "@/lib/messages/access";

/* ------------------------------------------------------------------ */
/*  Message access                                                     */
/*                                                                     */
/*  These decide who reads a colleague's private thread and who can    */
/*  address the whole workspace, so what is tested is the refusals —   */
/*  and, for Town Hall, the deliberate gap between being allowed to    */
/*  read and being allowed to write.                                   */
/* ------------------------------------------------------------------ */

const ORG = "org1";
const OWNER = "uidOwner";
const SARAH = "uidSarah";
const MARCUS = "uidMarcus";
const OUTSIDER = "uidOutsider";

const dm = (over: Partial<ConversationFacts> = {}): ConversationFacts => ({
  type: "dm",
  conversationOrgId: ORG,
  participantIds: [SARAH, MARCUS],
  viewerUid: SARAH,
  viewerOrgId: ORG,
  viewerRole: "MEMBER",
  ...over,
});

const townhall = (over: Partial<ConversationFacts> = {}): ConversationFacts =>
  dm({ type: "townhall", participantIds: [], ...over });

describe("reading a conversation", () => {
  it("lets a participant read their own dm", () => {
    expect(canReadConversation(dm()).allowed).toBe(true);
  });

  it("keeps a third member of the same org out of it", () => {
    expect(canReadConversation(dm({ viewerUid: OWNER }))).toMatchObject({
      allowed: false,
      reason: "not-a-participant",
    });
  });

  it("refuses another workspace even for someone on the list", () => {
    expect(canReadConversation(dm({ viewerOrgId: "org2" }))).toMatchObject({
      allowed: false,
      reason: "wrong-org",
    });
  });

  it("refuses a user with no workspace at all", () => {
    expect(canReadConversation(dm({ viewerOrgId: "" }))).toMatchObject({
      allowed: false,
      reason: "no-org",
    });
  });

  it("opens town hall to any member of the org, with no participant list", () => {
    expect(canReadConversation(townhall({ viewerUid: OUTSIDER })).allowed).toBe(true);
  });

  it("still closes town hall to another workspace", () => {
    expect(canReadConversation(townhall({ viewerOrgId: "org2" }))).toMatchObject({
      allowed: false,
      reason: "wrong-org",
    });
  });
});

describe("posting to a conversation", () => {
  it("lets a dm participant write", () => {
    expect(canPostToConversation(dm()).allowed).toBe(true);
  });

  it("lets a group participant write", () => {
    const group = dm({ type: "group", participantIds: [SARAH, MARCUS, OWNER] });
    expect(canPostToConversation(group).allowed).toBe(true);
  });

  it("refuses a member posting to town hall, and says why", () => {
    const d = canPostToConversation(townhall({ viewerRole: "MEMBER" }));
    expect(d).toMatchObject({ allowed: false, reason: "announcements-only" });
    expect(d.allowed === false && d.message).toMatch(/owner/i);
  });

  it("lets the owner post to town hall", () => {
    expect(canPostToConversation(townhall({ viewerRole: "OWNER" })).allowed).toBe(true);
  });

  it("reads a lowercased role the same way the rules do", () => {
    expect(canPostToConversation(townhall({ viewerRole: "owner" })).allowed).toBe(true);
  });

  it("refuses a missing role rather than assuming ownership", () => {
    expect(canPostToConversation(townhall({ viewerRole: null }))).toMatchObject({
      allowed: false,
      reason: "announcements-only",
    });
  });

  it("refuses to post where it would refuse to read", () => {
    expect(canPostToConversation(dm({ viewerUid: OWNER }))).toMatchObject({
      allowed: false,
      reason: "not-a-participant",
    });
  });
});

describe("opening a dm", () => {
  const facts = { callerUid: SARAH, callerOrgId: ORG, targetUid: MARCUS, targetOrgId: ORG };

  it("lets two colleagues start one", () => {
    expect(canOpenDm(facts).allowed).toBe(true);
  });

  it("refuses someone in another workspace", () => {
    expect(canOpenDm({ ...facts, targetOrgId: "org2" })).toMatchObject({
      allowed: false,
      reason: "wrong-org",
    });
  });

  it("refuses a thread with yourself", () => {
    expect(canOpenDm({ ...facts, targetUid: SARAH })).toMatchObject({
      allowed: false,
      reason: "self",
    });
  });
});

describe("creating a group", () => {
  const group = (over: Partial<GroupFacts> = {}): GroupFacts => ({
    creatorUid: SARAH,
    creatorOrgId: ORG,
    participants: [
      { uid: MARCUS, orgId: ORG },
      { uid: OWNER, orgId: ORG },
    ],
    maxParticipants: 50,
    ...over,
  });

  it("lets any member create one — no approval", () => {
    expect(canCreateGroup(group()).allowed).toBe(true);
  });

  it("refuses a group with nobody else in it", () => {
    expect(canCreateGroup(group({ participants: [{ uid: SARAH, orgId: ORG }] }))).toMatchObject({
      allowed: false,
      reason: "empty",
    });
  });

  it("refuses one that would pull in an outsider", () => {
    const facts = group({
      participants: [
        { uid: MARCUS, orgId: ORG },
        { uid: OUTSIDER, orgId: "org2" },
      ],
    });
    expect(canCreateGroup(facts)).toMatchObject({ allowed: false, reason: "wrong-org" });
  });

  it("counts the creator against the cap", () => {
    const facts = group({
      maxParticipants: 3,
      participants: [
        { uid: MARCUS, orgId: ORG },
        { uid: OWNER, orgId: ORG },
        { uid: "uidThree", orgId: ORG },
      ],
    });
    expect(canCreateGroup(facts)).toMatchObject({ allowed: false, reason: "too-many" });
  });

  it("ignores the creator appearing in their own participant list", () => {
    const facts = group({
      participants: [
        { uid: SARAH, orgId: ORG },
        { uid: MARCUS, orgId: ORG },
      ],
    });
    expect(canCreateGroup(facts).allowed).toBe(true);
  });
});

describe("deleting a message", () => {
  const facts = (over: Partial<MessageFacts> = {}): MessageFacts => ({
    ...townhall({ viewerUid: OWNER, viewerRole: "OWNER" }),
    senderId: SARAH,
    hasTaskRef: false,
    hasText: true,
    ...over,
  });

  it("lets an owner delete anyone's message", () => {
    expect(canDeleteMessage(facts()).allowed).toBe(true);
  });

  it("refuses a member, even on their own message", () => {
    expect(
      canDeleteMessage(facts({ viewerUid: SARAH, viewerRole: "MEMBER" }))
    ).toMatchObject({ allowed: false, reason: "owners-only" });
  });

  it("refuses an owner in a thread they cannot read", () => {
    expect(
      canDeleteMessage(facts({ ...dm({ viewerUid: OWNER, viewerRole: "OWNER" }) }))
    ).toMatchObject({ allowed: false, reason: "not-a-participant" });
  });
});

describe("editing a message", () => {
  const facts = (over: Partial<MessageFacts> = {}): MessageFacts => ({
    ...dm(),
    senderId: SARAH,
    hasTaskRef: false,
    hasText: true,
    ...over,
  });

  it("lets the sender edit their own words", () => {
    expect(canEditMessage(facts()).allowed).toBe(true);
  });

  it("refuses someone else's message, owner or not", () => {
    expect(
      canEditMessage(facts({ senderId: MARCUS, viewerRole: "OWNER" }))
    ).toMatchObject({ allowed: false, reason: "not-yours" });
  });

  it("refuses a task card and a bare picture", () => {
    expect(canEditMessage(facts({ hasTaskRef: true }))).toMatchObject({
      allowed: false,
      reason: "not-editable",
    });
    expect(canEditMessage(facts({ hasText: false }))).toMatchObject({
      allowed: false,
      reason: "not-editable",
    });
  });

  it("refuses a member who can no longer post in Town Hall", () => {
    expect(
      canEditMessage(facts({ ...townhall({ viewerRole: "MEMBER" }), senderId: SARAH }))
    ).toMatchObject({ allowed: false, reason: "announcements-only" });
  });
});

describe("managing Town Hall", () => {
  it("lets any owner speak for the company", () => {
    expect(canManageTownHall(townhall({ viewerUid: OWNER, viewerRole: "OWNER" })).allowed).toBe(true);
  });

  it("refuses a member", () => {
    expect(canManageTownHall(townhall({ viewerRole: "MEMBER" }))).toMatchObject({
      allowed: false,
      reason: "owners-only",
    });
  });

  it("refuses a group, which has no company profile", () => {
    const group = dm({ type: "group", participantIds: [SARAH, OWNER], viewerUid: OWNER, viewerRole: "OWNER" });
    expect(canManageTownHall(group)).toMatchObject({ allowed: false, reason: "not-town-hall" });
  });

  it("refuses another workspace's owner", () => {
    expect(
      canManageTownHall(townhall({ viewerOrgId: "org2", viewerRole: "OWNER" }))
    ).toMatchObject({ allowed: false, reason: "wrong-org" });
  });
});
