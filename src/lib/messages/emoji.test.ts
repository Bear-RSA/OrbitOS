import { describe, expect, it } from "vitest";
import { EMOJI_GROUPS, EMOJI_ONLY_MAX, emojiOnlyCount } from "@/lib/messages/emoji";

/* ------------------------------------------------------------------ */
/*  Emoji                                                              */
/*                                                                     */
/*  `emojiOnlyCount` decides whether a message renders as a gesture or  */
/*  as a sentence, so what matters is that ordinary text never trips   */
/*  it — a message with one emoji in it is still a message.            */
/* ------------------------------------------------------------------ */

describe("emoji-only messages", () => {
  it("counts a lone gesture", () => {
    expect(emojiOnlyCount("👍")).toBe(1);
  });

  it("counts a short run", () => {
    expect(emojiOnlyCount("🎉🎉🎉")).toBe(3);
  });

  it("ignores whitespace between them", () => {
    expect(emojiOnlyCount("  👍 🔥  ")).toBe(2);
  });

  it("treats a wall of emoji as ordinary text", () => {
    expect(emojiOnlyCount("🎉🎉🎉🎉🎉")).toBe(0);
  });

  it("refuses anything with words in it", () => {
    expect(emojiOnlyCount("nice 👍")).toBe(0);
    expect(emojiOnlyCount("👍 shipping it")).toBe(0);
  });

  it("refuses punctuation and numbers", () => {
    expect(emojiOnlyCount("👍!")).toBe(0);
    expect(emojiOnlyCount("100")).toBe(0);
    expect(emojiOnlyCount(":)")).toBe(0);
  });

  it("is quiet on empty and whitespace", () => {
    expect(emojiOnlyCount("")).toBe(0);
    expect(emojiOnlyCount("   ")).toBe(0);
  });

  it("counts a joined sequence as one character, not three", () => {
    /* 🧑‍💻 is person + ZWJ + laptop. Counting code points would make a
       single emoji look like a wall of them. */
    expect(emojiOnlyCount("🧑‍💻")).toBe(1);
  });

  it("handles an emoji carrying a skin tone", () => {
    expect(emojiOnlyCount("👍🏽")).toBe(1);
  });

  it("never exceeds the documented cap", () => {
    expect(emojiOnlyCount("😀".repeat(EMOJI_ONLY_MAX))).toBe(EMOJI_ONLY_MAX);
    expect(emojiOnlyCount("😀".repeat(EMOJI_ONLY_MAX + 1))).toBe(0);
  });
});

describe("the catalogue", () => {
  it("has no duplicate characters within a group", () => {
    for (const group of EMOJI_GROUPS) {
      expect(new Set(group.emoji).size, `${group.name} repeats an emoji`).toBe(
        group.emoji.length
      );
    }
  });

  it("holds only emoji — a stray letter would render as a broken tile", () => {
    for (const group of EMOJI_GROUPS) {
      for (const emoji of group.emoji) {
        expect(emojiOnlyCount(emoji), `${group.name}: ${emoji}`).toBeGreaterThan(0);
      }
    }
  });
});
