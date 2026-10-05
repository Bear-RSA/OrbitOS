import { describe, expect, it } from "vitest";
import {
  emptyRoster,
  MAX_VISIBLE_NOTICES,
  NOTICE_TTL_MS,
  noteArrival,
  noteDeparture,
  noticeText,
  pruneNotices,
  readChatMessage,
  settleRoster,
  type RoomNotice,
} from "@/lib/calls/room-notices";

/* ------------------------------------------------------------------ */
/*  Room notices                                                       */
/*                                                                     */
/*  The failure these guard against is noise: eight cards on walking   */
/*  into a room of eight, a card for a departure that never happened,  */
/*  and a custom app-message read as somebody saying nothing.          */
/* ------------------------------------------------------------------ */

describe("the roster", () => {
  it("announces nobody before the local participant has joined", () => {
    const roster = emptyRoster();
    expect(noteArrival(roster, "a")).toBe(false);
    expect(noteDeparture(roster, "a")).toBe(false);
  });

  /* The condition worth getting right. The provider replays everyone
     already present as a series of arrivals, and none of them is news. */
  it("takes the people present at join time as read", () => {
    const roster = settleRoster(emptyRoster(), ["a", "b"]);
    expect(noteArrival(roster, "a")).toBe(false);
    expect(noteArrival(roster, "b")).toBe(false);
  });

  it("announces somebody new once settled", () => {
    const roster = settleRoster(emptyRoster(), ["a"]);
    expect(noteArrival(roster, "c")).toBe(true);
    // Once. A second event for the same session is a repeat, not news.
    expect(noteArrival(roster, "c")).toBe(false);
  });

  it("announces a departure only for somebody it counted", () => {
    const roster = settleRoster(emptyRoster(), ["a"]);
    expect(noteDeparture(roster, "a")).toBe(true);
    expect(noteDeparture(roster, "a")).toBe(false);
    expect(noteDeparture(roster, "never-here")).toBe(false);
  });

  it("lets somebody leave and come back", () => {
    const roster = settleRoster(emptyRoster(), ["a"]);
    expect(noteDeparture(roster, "a")).toBe(true);
    expect(noteArrival(roster, "a")).toBe(true);
  });
});

describe("reading a chat line", () => {
  it("reads a Prebuilt chat message", () => {
    expect(
      readChatMessage({ event: "chat-msg", message: "on my way", name: "Ada", date: "x" })
    ).toEqual({ name: "Ada", message: "on my way" });
  });

  it("leaves the name for the caller when the payload has none", () => {
    expect(readChatMessage({ event: "chat-msg", message: "hi" })).toEqual({
      name: null,
      message: "hi",
    });
    expect(readChatMessage({ event: "chat-msg", message: "hi", name: "   " })?.name).toBeNull();
  });

  it("ignores app-messages that are not chat", () => {
    expect(readChatMessage({ event: "cursor", x: 1 })).toBeNull();
    expect(readChatMessage({ message: "unmarked" })).toBeNull();
  });

  it("ignores a chat line with nothing in it", () => {
    expect(readChatMessage({ event: "chat-msg", message: "   " })).toBeNull();
    expect(readChatMessage({ event: "chat-msg", message: 42 })).toBeNull();
  });

  it("survives payloads that are not objects", () => {
    expect(readChatMessage(null)).toBeNull();
    expect(readChatMessage("chat-msg")).toBeNull();
    expect(readChatMessage(undefined)).toBeNull();
  });
});

describe("wording", () => {
  it("says who did what", () => {
    expect(noticeText({ kind: "joined", name: "Ada" })).toBe("Ada joined");
    expect(noticeText({ kind: "left", name: "Ada" })).toBe("Ada left");
    expect(noticeText({ kind: "chat", name: "Ada", text: "hello" })).toBe("Ada: hello");
  });
});

describe("pruning", () => {
  const notice = (id: string, at: number): RoomNotice => ({ id, kind: "joined", name: id, at });

  it("drops what has expired and keeps what has not", () => {
    const now = 100_000;
    const kept = pruneNotices(
      [notice("old", now - NOTICE_TTL_MS), notice("fresh", now - NOTICE_TTL_MS + 1)],
      now
    );
    expect(kept.map((n) => n.id)).toEqual(["fresh"]);
  });

  it("keeps the newest when there are more than fit", () => {
    const now = 100_000;
    const many = Array.from({ length: MAX_VISIBLE_NOTICES + 2 }, (_, i) =>
      notice(`n${i}`, now - 1000 + i)
    );
    const kept = pruneNotices(many, now);
    expect(kept).toHaveLength(MAX_VISIBLE_NOTICES);
    expect(kept[kept.length - 1].id).toBe(`n${MAX_VISIBLE_NOTICES + 1}`);
  });
});
