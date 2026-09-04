import { describe, expect, it } from "vitest";
import {
  dmConversationId,
  isTownHallConversationId,
  townHallConversationId,
} from "@/lib/messages/conversation-id";

/* ------------------------------------------------------------------ */
/*  Conversation ids                                                   */
/*                                                                     */
/*  Two properties carry the whole design: the same pair always lands  */
/*  on the same document, and nothing that could bend a document path  */
/*  is ever built into one.                                            */
/* ------------------------------------------------------------------ */

const ORG = "org123";
const SARAH = "uidSarah";
const MARCUS = "uidMarcus";

describe("town hall", () => {
  it("is one id per org", () => {
    expect(townHallConversationId(ORG)).toBe("townhall_org123");
    expect(townHallConversationId("other")).not.toBe(townHallConversationId(ORG));
  });

  it("recognises its own output, and only for the right org", () => {
    expect(isTownHallConversationId(townHallConversationId(ORG), ORG)).toBe(true);
    expect(isTownHallConversationId(townHallConversationId("other"), ORG)).toBe(false);
    expect(isTownHallConversationId("townhall_org123/../x", ORG)).toBe(false);
    expect(isTownHallConversationId(null, ORG)).toBe(false);
  });
});

describe("direct messages", () => {
  it("gives the same id whichever way round the pair is asked for", () => {
    expect(dmConversationId(ORG, SARAH, MARCUS)).toBe(dmConversationId(ORG, MARCUS, SARAH));
  });

  it("keeps the pair inside its own org", () => {
    expect(dmConversationId(ORG, SARAH, MARCUS)).not.toBe(
      dmConversationId("otherOrg", SARAH, MARCUS)
    );
  });

  it("refuses a thread with yourself", () => {
    expect(() => dmConversationId(ORG, SARAH, SARAH)).toThrow();
  });
});

describe("path safety", () => {
  it("refuses a separator that would address another collection", () => {
    expect(() => dmConversationId(ORG, SARAH, "../../users/admin")).toThrow();
    expect(() => townHallConversationId("org/../other")).toThrow();
  });

  it("refuses reserved and empty segments", () => {
    expect(() => townHallConversationId("")).toThrow();
    expect(() => townHallConversationId("..")).toThrow();
    expect(() => dmConversationId(ORG, SARAH, ".")).toThrow();
  });

  it("refuses non-strings rather than building a path out of them", () => {
    expect(() => townHallConversationId(null as unknown as string)).toThrow();
    expect(() => dmConversationId(ORG, SARAH, 42 as unknown as string)).toThrow();
  });
});
