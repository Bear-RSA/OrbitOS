import { describe, expect, it } from "vitest";
import {
  GUEST_SUFFIX,
  MAX_DISPLAY_NAME,
  participantName,
  sanitizeDisplayName,
  vetDisplayName,
} from "@/lib/calls/display-name";

/* ------------------------------------------------------------------ */
/*  Display names                                                      */
/*                                                                     */
/*  This string is typed by someone with no account and rendered on    */
/*  everyone else's screen, so the tests that matter are the ones      */
/*  about what a walk-in must NOT be able to put into a room.          */
/* ------------------------------------------------------------------ */

describe("sanitizing", () => {
  it("keeps an ordinary name intact", () => {
    expect(sanitizeDisplayName("Sarah Klein")).toBe("Sarah Klein");
  });

  it("collapses padding used to crowd a participant list", () => {
    expect(sanitizeDisplayName("   Sarah     Klein  ")).toBe("Sarah Klein");
  });

  it("strips a right-to-left override", () => {
    expect(sanitizeDisplayName("Sarah\u202EnielK")).toBe("SarahnielK");
  });

  it("strips zero-width characters", () => {
    expect(sanitizeDisplayName("Sa\u200Brah\u200D Klein")).toBe("Sarah Klein");
  });

  it("strips control characters", () => {
    expect(sanitizeDisplayName("Sarah\u0000\u001F Klein")).toBe("Sarah Klein");
  });

  it("truncates a name long enough to break a tile", () => {
    expect(sanitizeDisplayName("a".repeat(200))).toHaveLength(MAX_DISPLAY_NAME);
  });

  it("survives an empty input rather than throwing", () => {
    expect(sanitizeDisplayName("")).toBe("");
  });
});

describe("vetting", () => {
  it("accepts a real name", () => {
    expect(vetDisplayName("Sarah Klein")).toEqual({ name: "Sarah Klein" });
  });

  it("accepts a non-Latin name", () => {
    expect(vetDisplayName("Thabo Mokoena").name).toBe("Thabo Mokoena");
    expect(vetDisplayName("\u674E\u4F1F").name).toBe("\u674E\u4F1F");
  });

  it("rejects nothing typed", () => {
    expect(vetDisplayName("   ").error).toBeTruthy();
  });

  it("rejects a single character", () => {
    expect(vetDisplayName("S").error).toBeTruthy();
  });

  it("rejects punctuation posing as a name", () => {
    expect(vetDisplayName("...").error).toBeTruthy();
    expect(vetDisplayName("---").error).toBeTruthy();
  });

  it("rejects a string that is only invisibles", () => {
    expect(vetDisplayName("\u200B\u200B\u200B").error).toBeTruthy();
  });
});

describe("participant naming", () => {
  it("marks a walk-in", () => {
    expect(participantName("Sarah Klein", true)).toBe("Sarah Klein" + GUEST_SUFFIX);
  });

  it("leaves a member unmarked", () => {
    expect(participantName("Sarah Klein", false)).toBe("Sarah Klein");
  });

  it("keeps the marker on a name long enough to be truncated", () => {
    expect(participantName("a".repeat(200), true).endsWith(GUEST_SUFFIX)).toBe(true);
  });

  it("does not let a typed name forge the guest marker away", () => {
    expect(participantName("Sarah (guest)", true)).toBe("Sarah (guest)" + GUEST_SUFFIX);
  });

  it("falls back rather than rendering an empty tile", () => {
    expect(participantName("", true)).toBe("Guest" + GUEST_SUFFIX);
  });
});
