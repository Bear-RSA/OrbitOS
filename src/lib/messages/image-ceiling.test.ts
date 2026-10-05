import { describe, expect, it } from "vitest";
import {
  HARD_MAX_IMAGES_PER_MONTH,
  HARD_MAX_IMAGE_BYTES,
  MB,
  admitChatImage,
  applyChatImageDelta,
  chatImageAllowance,
  chatImageFolder,
  isChatImagePublicId,
  readChatImageUsage,
  withinImageCeiling,
} from "@/lib/messages/image-ceiling";
import { periodKeyFor } from "@/types/transcript";

/* ------------------------------------------------------------------ */
/*  Chat image cost ceilings                                           */
/*                                                                     */
/*  Always on, independent of the paywall, because a pasted screenshot */
/*  is a Cloudinary upload that bills every month it is kept. Every    */
/*  test here is about the direction that costs money: a caller must   */
/*  never ask for MORE than the ceiling and be given it.               */
/* ------------------------------------------------------------------ */

describe("monthly allowance", () => {
  it("passes a tier narrower than the ceiling through", () => {
    expect(chatImageAllowance(100)).toBe(100);
  });

  it("clamps a tier more generous than the ceiling", () => {
    expect(chatImageAllowance(1_000_000)).toBe(HARD_MAX_IMAGES_PER_MONTH);
  });

  it("treats -1 as 'the plan does not narrow it', never as unlimited", () => {
    expect(chatImageAllowance(-1)).toBe(HARD_MAX_IMAGES_PER_MONTH);
  });

  it("lets zero through as a real answer", () => {
    expect(chatImageAllowance(0)).toBe(0);
  });

  it("does not let a non-number become unbounded", () => {
    expect(chatImageAllowance(Number.NaN)).toBe(HARD_MAX_IMAGES_PER_MONTH);
    expect(chatImageAllowance(Number.POSITIVE_INFINITY)).toBe(HARD_MAX_IMAGES_PER_MONTH);
  });
});

describe("file ceiling", () => {
  it("accepts a screenshot-sized file", () => {
    expect(withinImageCeiling(400 * 1024)).toBe(true);
  });

  it("refuses anything over the cap", () => {
    expect(withinImageCeiling(HARD_MAX_IMAGE_BYTES + 1)).toBe(false);
  });

  it("refuses a size the browser could not read", () => {
    expect(withinImageCeiling(0)).toBe(false);
    expect(withinImageCeiling(-1)).toBe(false);
    expect(withinImageCeiling(Number.NaN)).toBe(false);
  });
});

describe("public id", () => {
  const org = "org_1";
  const thread = "dm_a_b";
  const prefix = chatImageFolder(org, thread);

  it("accepts an id the server would have minted", () => {
    expect(isChatImagePublicId(`${prefix}/abcDEF123_-xyz`, org, thread)).toBe(true);
  });

  it("refuses another workspace's folder", () => {
    expect(isChatImagePublicId(`chat/org_2/${thread}/abcDEF123456`, org, thread)).toBe(false);
  });

  it("refuses another thread's folder in the same workspace", () => {
    expect(isChatImagePublicId(`chat/${org}/other/abcDEF123456`, org, thread)).toBe(false);
  });

  it("refuses a tail that carries a path", () => {
    expect(isChatImagePublicId(`${prefix}/abcDEF123456/evil`, org, thread)).toBe(false);
    expect(isChatImagePublicId(`${prefix}/../abcDEF123456`, org, thread)).toBe(false);
  });

  it("refuses a non-string", () => {
    expect(isChatImagePublicId(null, org, thread)).toBe(false);
    expect(isChatImagePublicId(42, org, thread)).toBe(false);
  });
});

describe("usage", () => {
  const now = new Date("2026-09-13T10:00:00Z");
  const period = periodKeyFor(now);

  it("reads an org with no counter as none this month", () => {
    expect(readChatImageUsage(undefined, now)).toEqual({ periodKey: period, images: 0, bytes: 0 });
    expect(readChatImageUsage({}, now)).toEqual({ periodKey: period, images: 0, bytes: 0 });
  });

  it("reads this month's counter", () => {
    expect(
      readChatImageUsage({ chatImageUsage: { periodKey: period, images: 7, bytes: 900 } }, now)
    ).toEqual({ periodKey: period, images: 7, bytes: 900 });
  });

  it("reads last month's counter as zero", () => {
    expect(
      readChatImageUsage(
        { chatImageUsage: { periodKey: "2026-08", images: 2_999, bytes: 1 } },
        now
      )
    ).toEqual({ periodKey: period, images: 0, bytes: 0 });
  });

  it("does not let junk in the counter become a negative allowance", () => {
    expect(
      readChatImageUsage(
        { chatImageUsage: { periodKey: period, images: -5, bytes: "many" } },
        now
      )
    ).toEqual({ periodKey: period, images: 0, bytes: 0 });
  });

  it("adds one picture and its bytes, staying in the period", () => {
    expect(applyChatImageDelta({ periodKey: period, images: 3, bytes: 10 }, 5)).toEqual({
      periodKey: period,
      images: 4,
      bytes: 15,
    });
  });

  it("never subtracts bytes", () => {
    expect(applyChatImageDelta({ periodKey: period, images: 0, bytes: 10 }, -50).bytes).toBe(10);
  });
});

describe("admission", () => {
  const ok = { size: 1 * MB, type: "image/png", usedImages: 0, maxImages: 100 };

  it("admits an ordinary screenshot", () => {
    expect(admitChatImage(ok)).toEqual({ allowed: true });
  });

  it("refuses a format the composer does not take", () => {
    expect(admitChatImage({ ...ok, type: "image/svg+xml" }).allowed).toBe(false);
    expect(admitChatImage({ ...ok, type: "application/pdf" }).allowed).toBe(false);
  });

  it("refuses a picture over the file cap before looking at the allowance", () => {
    const result = admitChatImage({ ...ok, size: HARD_MAX_IMAGE_BYTES + 1 });
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/capped/);
  });

  it("refuses when the month's allowance is spent", () => {
    const result = admitChatImage({ ...ok, usedImages: 100 });
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/this month/);
  });

  it("treats a zero allowance as a plan gate", () => {
    const result = admitChatImage({ ...ok, maxImages: 0 });
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/paid plan/);
  });
});
