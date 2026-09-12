import { describe, expect, it } from "vitest";
import { hashPasscode, isValidPasscodeFormat, safeEqualHex, verifyPasscode } from "@/lib/vault/passcode";

/* ------------------------------------------------------------------ */
/*  Vault passcode hashing                                             */
/*                                                                     */
/*  The gate's whole security rests on the hash never leaving the        */
/*  server and the comparison being fixed-time — this pins down the       */
/*  round trip a wrong or malformed code has to fail through. */
/* ------------------------------------------------------------------ */

describe("format", () => {
  it("accepts exactly four digits", () => {
    expect(isValidPasscodeFormat("0000")).toBe(true);
    expect(isValidPasscodeFormat("1234")).toBe(true);
    expect(isValidPasscodeFormat("9999")).toBe(true);
  });

  it("rejects anything that is not exactly four digits", () => {
    expect(isValidPasscodeFormat("123")).toBe(false);
    expect(isValidPasscodeFormat("12345")).toBe(false);
    expect(isValidPasscodeFormat("12a4")).toBe(false);
    expect(isValidPasscodeFormat("")).toBe(false);
    expect(isValidPasscodeFormat(undefined)).toBe(false);
    expect(isValidPasscodeFormat(1234)).toBe(false);
  });
});

describe("hashing and verification", () => {
  it("verifies the same code it was hashed from", () => {
    const { hash, salt } = hashPasscode("4821");
    expect(verifyPasscode("4821", hash, salt)).toBe(true);
  });

  it("refuses a different code against the same hash", () => {
    const { hash, salt } = hashPasscode("4821");
    expect(verifyPasscode("1248", hash, salt)).toBe(false);
  });

  it("never stores the code itself in the hash or salt", () => {
    const { hash, salt } = hashPasscode("4821");
    expect(hash).not.toContain("4821");
    expect(salt).not.toContain("4821");
  });

  it("produces a different salt (and hash) for the same code each time", () => {
    const first = hashPasscode("4821");
    const second = hashPasscode("4821");
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    // Both still verify against their own salt.
    expect(verifyPasscode("4821", first.hash, first.salt)).toBe(true);
    expect(verifyPasscode("4821", second.hash, second.salt)).toBe(true);
  });

  it("does not throw on a malformed stored hash or salt", () => {
    expect(verifyPasscode("4821", "not-hex-!!", "also-not-hex")).toBe(false);
  });
});

describe("safeEqualHex", () => {
  it("matches identical hex strings", () => {
    expect(safeEqualHex("abcd1234", "abcd1234")).toBe(true);
  });

  it("refuses different hex strings, including different lengths", () => {
    expect(safeEqualHex("abcd1234", "abcd1235")).toBe(false);
    expect(safeEqualHex("abcd", "abcd1234")).toBe(false);
  });

  it("does not throw on invalid hex", () => {
    expect(safeEqualHex("not-hex", "abcd1234")).toBe(false);
  });
});
