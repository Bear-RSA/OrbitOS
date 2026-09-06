import { describe, expect, it } from "vitest";
import { shouldNotify, type NotificationDecision } from "@/lib/notifications/desktop";

/* ------------------------------------------------------------------ */
/*  Desktop notifications                                              */
/*                                                                     */
/*  A notification is a courtesy on top of a call that is already      */
/*  arriving, so the tests are about the two ways it becomes a         */
/*  nuisance: firing when nobody agreed to it, and firing at somebody  */
/*  who is already looking at the thing it is telling them about.      */
/* ------------------------------------------------------------------ */

const facts = (over: Partial<NotificationDecision> = {}): NotificationDecision => ({
  access: "granted",
  enabled: true,
  visible: false,
  ...over,
});

describe("whether to raise a desktop notification", () => {
  it("notifies when OrbitOS is not the window being looked at", () => {
    expect(shouldNotify(facts())).toBe(true);
  });

  /* The condition worth getting right. The ring card is already on
     screen for somebody watching this tab, and a notification on top of
     it is how a person learns to dismiss these unread. */
  it("stays quiet while the tab is in front of the reader", () => {
    expect(shouldNotify(facts({ visible: true }))).toBe(false);
  });

  it("stays quiet when the browser has not granted permission", () => {
    expect(shouldNotify(facts({ access: "default" }))).toBe(false);
  });

  it("stays quiet when the browser has refused", () => {
    expect(shouldNotify(facts({ access: "denied" }))).toBe(false);
  });

  it("stays quiet where the API does not exist", () => {
    expect(shouldNotify(facts({ access: "unsupported" }))).toBe(false);
  });

  /* Permission granted is not consent to be interrupted — the browser
     said yes once, and the preference is where the person says whether
     they still mean it. */
  it("stays quiet when the reader switched it off, however it was granted", () => {
    expect(shouldNotify(facts({ enabled: false }))).toBe(false);
  });
});
