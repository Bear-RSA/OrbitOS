import { describe, expect, it } from "vitest";
import {
  hasContent,
  isAllowedMediaUrl,
  isValidAttachment,
} from "@/lib/messages/attachment";
import type { MessageAttachment } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Attachment validation                                              */
/*                                                                     */
/*  This is the check standing between a member and an <img src> in    */
/*  every colleague's browser, so the tests that matter are the URLs   */
/*  that should NOT get through — each of which is a tracking pixel    */
/*  reporting who read the thread and when.                            */
/* ------------------------------------------------------------------ */

const attachment = (over: Partial<MessageAttachment> = {}): MessageAttachment => ({
  kind: "gif",
  url: "https://media.giphy.com/abc123/reaction.gif",
  previewUrl: "https://media1.giphy.com/abc123/reaction-tiny.gif",
  width: 480,
  height: 270,
  alt: "a cat knocking a mug off a table",
  provider: "giphy",
  providerId: "1234567890",
  ...over,
});

describe("the host allowlist", () => {
  it("accepts the provider's CDN and its numbered shards", () => {
    expect(isAllowedMediaUrl("https://media.giphy.com/x/y.gif")).toBe(true);
    expect(isAllowedMediaUrl("https://media7.giphy.com/x/y.gif")).toBe(true);
  });

  it("refuses a lookalike host", () => {
    expect(isAllowedMediaUrl("https://media.giphy.com.evil.test/x.gif")).toBe(false);
    expect(isAllowedMediaUrl("https://mediagiphy.com/x.gif")).toBe(false);
    expect(isAllowedMediaUrl("https://giphy.com.attacker.io/x.gif")).toBe(false);
  });

  it("refuses the host smuggled into a path — the classic allowlist hole", () => {
    expect(isAllowedMediaUrl("https://evil.test/media.giphy.com/x.gif")).toBe(false);
    expect(isAllowedMediaUrl("https://evil.test/?u=https://media.giphy.com/x.gif")).toBe(
      false
    );
  });

  it("refuses anything that is not https", () => {
    expect(isAllowedMediaUrl("http://media.giphy.com/x.gif")).toBe(false);
    expect(isAllowedMediaUrl("//media.giphy.com/x.gif")).toBe(false);
    expect(isAllowedMediaUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedMediaUrl("data:image/gif;base64,R0lGOD")).toBe(false);
  });

  it("refuses a credentialed URL pointing somewhere else", () => {
    expect(isAllowedMediaUrl("https://media.giphy.com@evil.test/x.gif")).toBe(false);
  });

  it("refuses non-strings rather than throwing", () => {
    expect(isAllowedMediaUrl(null)).toBe(false);
    expect(isAllowedMediaUrl(42)).toBe(false);
    expect(isAllowedMediaUrl({})).toBe(false);
  });
});

describe("attachment shape", () => {
  it("accepts a well-formed gif and sticker", () => {
    expect(isValidAttachment(attachment())).toBe(true);
    expect(isValidAttachment(attachment({ kind: "sticker" }))).toBe(true);
  });

  it("refuses an unknown kind or provider", () => {
    expect(isValidAttachment(attachment({ kind: "video" as never }))).toBe(false);
    expect(isValidAttachment(attachment({ provider: "tenor" as never }))).toBe(false);
  });

  it("refuses extra keys — the rules pin the key set exactly", () => {
    expect(isValidAttachment({ ...attachment(), onload: "steal()" })).toBe(false);
  });

  it("refuses a missing key", () => {
    const { alt: _alt, ...missing } = attachment();
    expect(isValidAttachment(missing)).toBe(false);
  });

  it("refuses a bad preview even when the main url is fine", () => {
    expect(isValidAttachment(attachment({ previewUrl: "https://evil.test/p.gif" }))).toBe(
      false
    );
  });

  it("refuses dimensions that would break the reserved box", () => {
    expect(isValidAttachment(attachment({ width: 0 }))).toBe(false);
    expect(isValidAttachment(attachment({ height: -1 }))).toBe(false);
    expect(isValidAttachment(attachment({ width: 99_999 }))).toBe(false);
    expect(isValidAttachment(attachment({ width: 12.5 }))).toBe(false);
  });

  it("refuses an alt field being used to smuggle a body of text", () => {
    expect(isValidAttachment(attachment({ alt: "x".repeat(500) }))).toBe(false);
  });

  it("refuses non-objects", () => {
    expect(isValidAttachment(null)).toBe(false);
    expect(isValidAttachment("gif")).toBe(false);
  });
});

describe("a message has to say something", () => {
  it("accepts words alone", () => {
    expect(hasContent("shipping it", null)).toBe(true);
  });

  it("accepts a picture alone", () => {
    expect(hasContent("", attachment())).toBe(true);
    expect(hasContent("   ", attachment())).toBe(true);
  });

  it("refuses an empty row in somebody's transcript", () => {
    expect(hasContent("", null)).toBe(false);
    expect(hasContent("   ", null)).toBe(false);
  });

  it("refuses a blank message carrying a rejected attachment", () => {
    expect(hasContent("", { url: "https://evil.test/x.gif" })).toBe(false);
  });
});
