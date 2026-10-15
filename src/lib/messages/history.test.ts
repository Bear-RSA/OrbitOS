import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { foldHistory, ghostId } from "@/lib/messages/history";
import { railPreview } from "@/lib/messages/rail-preview";
import type { Message, MessageHistoryEntry } from "@/types/message";

const message = (id: string, ms: number, text = "hi"): Message => ({
  id,
  senderId: "uidSarah",
  createdAt: Timestamp.fromMillis(ms),
  text,
  attachment: null,
  taskRef: null,
  editedAt: null,
  deletedAt: null,
});

const entry = (over: Partial<MessageHistoryEntry>): MessageHistoryEntry => ({
  id: "h1",
  messageId: "m1",
  kind: "deleted",
  actorId: "uidOwner",
  atMs: 5_000,
  senderId: "uidSarah",
  sentAtMs: 2_000,
  text: "gone",
  attachment: null,
  taskRef: null,
  asCompany: false,
  ...over,
});

describe("railPreview", () => {
  it("prefers words, then a task card, then the picture kind", () => {
    expect(railPreview({ text: "  hello  " })).toBe("hello");
    expect(railPreview({ text: "", taskRef: { title: "Ship it" } })).toBe("Shared a task: Ship it");
    expect(railPreview({ text: "", attachment: { kind: "image" } })).toBe("Sent a picture");
  });
});

describe("foldHistory", () => {
  it("puts a deleted message back in time order", () => {
    const folded = foldHistory([message("a", 1_000), message("b", 3_000)], [entry({})], 1_000);
    expect(folded.messages.map((m) => m.id)).toEqual(["a", ghostId(entry({})), "b"]);
    expect(folded.removed.get(ghostId(entry({})))?.actorId).toBe("uidOwner");
  });

  it("leaves out deletes older than what is on screen", () => {
    const folded = foldHistory([message("a", 3_000)], [entry({ sentAtMs: 1_000 })], 3_000);
    expect(folded.messages).toHaveLength(1);
  });

  it("groups earlier wordings by message, oldest first", () => {
    const folded = foldHistory(
      [message("m1", 1_000)],
      [
        entry({ id: "e2", kind: "edited", atMs: 9_000, text: "second" }),
        entry({ id: "e1", kind: "edited", atMs: 4_000, text: "first" }),
      ],
      0
    );
    expect(folded.edits.get("m1")?.map((e) => e.text)).toEqual(["first", "second"]);
    expect(folded.messages).toHaveLength(1);
  });

  it("keeps a deleted message's edits under its ghost", () => {
    const folded = foldHistory(
      [],
      [entry({}), entry({ id: "e1", kind: "edited", text: "draft" })],
      0
    );
    expect(folded.edits.get(ghostId(entry({})))?.[0].text).toBe("draft");
  });
});
