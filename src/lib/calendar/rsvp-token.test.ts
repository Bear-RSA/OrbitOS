import { describe, expect, it } from "vitest";
import { rsvpUrlFor, signRsvpToken, verifyRsvpToken } from "@/lib/calendar/rsvp-token";

/* ------------------------------------------------------------------ */
/*  RSVP tokens                                                        */
/*                                                                     */
/*  These links are handed to people with no account, and forwarding   */
/*  invite mail is normal behaviour. So the tests that matter are the  */
/*  negative ones: what a holder of a valid link must NOT be able to   */
/*  reach by editing it.                                               */
/* ------------------------------------------------------------------ */

/* Set at module scope, not in `beforeAll`. Describe bodies run while the
   file is being collected, which is before any hook fires, and one of them
   signs a token up front. The module reads these lazily on each call, so
   assigning them here is enough. */
process.env.CALENDAR_FEED_SECRET = "test-secret-at-least-32-characters-long";
process.env.NEXT_PUBLIC_APP_URL = "https://orbit-os.co.za";

describe("round trip", () => {
  it("returns what a guest token claims", () => {
    const token = signRsvpToken("guest", "g_abc123", "evt_789", 3);

    expect(verifyRsvpToken(token)).toEqual({
      kind: "guest",
      subjectId: "g_abc123",
      eventId: "evt_789",
      version: 3,
    });
  });

  it("returns what a member token claims", () => {
    const token = signRsvpToken("member", "uid_42", "evt_1", 0);

    expect(verifyRsvpToken(token)).toEqual({
      kind: "member",
      subjectId: "uid_42",
      eventId: "evt_1",
      version: 0,
    });
  });

  it("survives ids that need encoding", () => {
    const token = signRsvpToken("guest", "g_+/=aA", "evt/with+chars", 1);
    const back = verifyRsvpToken(token);

    expect(back?.subjectId).toBe("g_+/=aA");
    expect(back?.eventId).toBe("evt/with+chars");
  });
});

describe("tampering", () => {
  const token = signRsvpToken("guest", "g_abc123", "evt_789", 3);

  it("rejects a hand-raised version", () => {
    // The version is the revocation counter. If it could be edited, a
    // revoked link would revive itself by counting up.
    expect(verifyRsvpToken(token.replace(/\.3\./, ".4."))).toBeNull();
  });

  it("rejects a token repointed at another engagement", () => {
    /* The forgery is swapping the event while KEEPING the signature that
       was issued for the original. Taking the other token's signature too
       just rebuilds a legitimate token and proves nothing. */
    const other = signRsvpToken("guest", "g_abc123", "evt_OTHER", 3);
    const parts = token.split(".");
    parts[2] = other.split(".")[2];

    expect(verifyRsvpToken(parts.join("."))).toBeNull();
  });

  it("rejects a guest link replayed as a member link", () => {
    expect(verifyRsvpToken("m" + token.slice(1))).toBeNull();
  });

  it("rejects a token repointed at another subject", () => {
    const other = signRsvpToken("guest", "g_someone_else", "evt_789", 3);
    const parts = token.split(".");
    parts[1] = other.split(".")[1];

    expect(verifyRsvpToken(parts.join("."))).toBeNull();
  });

  it("rejects a signature from a different secret", () => {
    const real = process.env.CALENDAR_FEED_SECRET;
    process.env.CALENDAR_FEED_SECRET = "a-completely-different-32-char-secret";
    const foreign = signRsvpToken("guest", "g_abc123", "evt_789", 3);
    process.env.CALENDAR_FEED_SECRET = real;

    expect(verifyRsvpToken(foreign)).toBeNull();
  });
});

describe("malformed input", () => {
  it.each([
    ["garbage", "not-a-token"],
    ["too few parts", "m.a.b.0"],
    ["empty", ""],
    ["unknown kind", "x.YQ.Yg.0.sig"],
    ["negative version", "g.YQ.Yg.-1.sig"],
  ])("rejects %s", (_label, value) => {
    expect(verifyRsvpToken(value)).toBeNull();
  });
});

describe("a missing secret", () => {
  it("throws rather than signing with nothing", () => {
    const real = process.env.CALENDAR_FEED_SECRET;
    process.env.CALENDAR_FEED_SECRET = "too-short";

    // Callers catch this and report a deployment fault, which must stay
    // distinguishable from an ordinary bad link.
    expect(() => signRsvpToken("guest", "g_a", "evt_a", 0)).toThrow();

    process.env.CALENDAR_FEED_SECRET = real;
  });
});

describe("rsvpUrlFor", () => {
  it("builds an absolute link whose token verifies", () => {
    const url = rsvpUrlFor("guest", "g_abc123", "evt_789", 3);

    expect(url.startsWith("https://orbit-os.co.za/rsvp/")).toBe(true);
    expect(verifyRsvpToken(url.split("/rsvp/")[1])).not.toBeNull();
  });

  it("does not double up on a trailing slash", () => {
    const real = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://orbit-os.co.za/";

    expect(rsvpUrlFor("guest", "g_a", "evt_a", 0)).toContain("co.za/rsvp/");
    expect(rsvpUrlFor("guest", "g_a", "evt_a", 0)).not.toContain("co.za//rsvp/");

    process.env.NEXT_PUBLIC_APP_URL = real;
  });
});
