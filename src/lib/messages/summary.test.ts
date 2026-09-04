import { describe, expect, it } from "vitest";
import {
  conversationTitle,
  isCleared,
  isUnread,
  type TitleFacts,
} from "@/lib/messages/summary";

/* ------------------------------------------------------------------ */
/*  Conversation summaries                                             */
/*                                                                     */
/*  Both of these are viewer-relative, so what is worth testing is     */
/*  that they give two people in the same thread different answers —   */
/*  and that a dm never accidentally shows you your own name.          */
/* ------------------------------------------------------------------ */

const SARAH = "uidSarah";
const MARCUS = "uidMarcus";

const dm = (over: Partial<TitleFacts> = {}): TitleFacts => ({
  type: "dm",
  name: null,
  participantIds: [SARAH, MARCUS],
  participantNames: { [SARAH]: "Sarah Chen", [MARCUS]: "Marcus Thorne" },
  ...over,
});

describe("naming a conversation", () => {
  it("calls a dm after the other person, from each end", () => {
    expect(conversationTitle(dm(), SARAH)).toBe("Marcus Thorne");
    expect(conversationTitle(dm(), MARCUS)).toBe("Sarah Chen");
  });

  it("prefers the live directory over the copy taken at creation", () => {
    const live = { [MARCUS]: "Marcus Thorne-Wells" };
    expect(conversationTitle(dm(), SARAH, live)).toBe("Marcus Thorne-Wells");
  });

  it("falls back to the stored copy when the directory has not loaded", () => {
    expect(conversationTitle(dm(), SARAH, {})).toBe("Marcus Thorne");
  });

  it("says so rather than showing a uid when neither has a name", () => {
    const facts = dm({ participantNames: {} });
    expect(conversationTitle(facts, SARAH)).toBe("Unknown operative");
  });

  it("uses the stored name for a group and for town hall", () => {
    expect(conversationTitle(dm({ type: "group", name: "Launch crew" }), SARAH)).toBe(
      "Launch crew"
    );
    expect(
      conversationTitle(
        { type: "townhall", name: "Town Hall", participantIds: [], participantNames: {} },
        SARAH
      )
    ).toBe("Town Hall");
  });

  it("never leaves a group untitled, even with a blank name", () => {
    expect(conversationTitle(dm({ type: "group", name: "   " }), SARAH)).toBe(
      "Untitled conversation"
    );
  });
});

describe("cleared", () => {
  it("hides a thread with nothing said since it was cleared", () => {
    expect(isCleared({ clearedAtMs: 5_000, lastMessageAtMs: 4_000 })).toBe(true);
  });

  it("hides one cleared at the very moment of the last message", () => {
    expect(isCleared({ clearedAtMs: 5_000, lastMessageAtMs: 5_000 })).toBe(true);
  });

  it("brings it back the moment somebody writes again", () => {
    /* The point of dating the mark rather than setting a flag: a reply
       must not vanish into a list nobody looks at. */
    expect(isCleared({ clearedAtMs: 5_000, lastMessageAtMs: 6_000 })).toBe(false);
  });

  it("hides an empty thread that was cleared", () => {
    expect(isCleared({ clearedAtMs: 5_000, lastMessageAtMs: null })).toBe(true);
  });

  it("shows a thread nobody has cleared", () => {
    expect(isCleared({ clearedAtMs: null, lastMessageAtMs: 6_000 })).toBe(false);
    expect(isCleared({ clearedAtMs: null, lastMessageAtMs: null })).toBe(false);
  });
});

describe("unread", () => {
  const facts = {
    lastMessageAtMs: 2_000,
    lastReadAtMs: 1_000,
    lastMessageBy: MARCUS,
    viewerUid: SARAH,
  };

  it("flags a message that arrived after you last looked", () => {
    expect(isUnread(facts)).toBe(true);
  });

  it("clears once the receipt catches up", () => {
    expect(isUnread({ ...facts, lastReadAtMs: 2_000 })).toBe(false);
  });

  it("treats a thread you have never opened as unread", () => {
    expect(isUnread({ ...facts, lastReadAtMs: null })).toBe(true);
  });

  it("never flags your own message back at you", () => {
    expect(isUnread({ ...facts, lastMessageBy: SARAH, lastReadAtMs: null })).toBe(false);
  });

  it("is quiet on an empty thread", () => {
    expect(isUnread({ ...facts, lastMessageAtMs: null, lastReadAtMs: null })).toBe(false);
  });
});
