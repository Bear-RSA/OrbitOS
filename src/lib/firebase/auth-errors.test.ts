import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./auth-errors";

class FakeFirebaseError extends Error {
  constructor(public code: string) {
    super(`Firebase: Error (${code}).`);
  }
}

describe("friendlyAuthError", () => {
  it("maps a known Firebase code to plain language", () => {
    expect(friendlyAuthError(new FakeFirebaseError("auth/network-request-failed"))).toBe(
      "Couldn't reach OrbitOS. Check your connection and try again."
    );
  });

  it("recovers the code from a message when the code property is gone", () => {
    expect(friendlyAuthError(new Error("Firebase: Error (auth/too-many-requests)."))).toMatch(
      /Too many attempts/
    );
  });

  it("never shows a raw Firebase string for an unknown code", () => {
    const message = friendlyAuthError(new FakeFirebaseError("auth/some-new-code"));
    expect(message).not.toMatch(/Firebase|auth\//);
  });

  it("passes the app's own human-written errors through", () => {
    expect(friendlyAuthError(new Error("Session setup timed out. Check your connection and try again."))).toBe(
      "Session setup timed out. Check your connection and try again."
    );
  });

  it("uses the caller's fallback for non-errors", () => {
    expect(friendlyAuthError("nope", "Couldn't save your details.")).toBe("Couldn't save your details.");
  });
});
