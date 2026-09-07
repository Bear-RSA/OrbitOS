import { describe, expect, it } from "vitest";
import {
  applyVaultDelta,
  canManageVaultDocument,
  canReadVaultDocument,
  readVaultUsage,
} from "@/lib/vault/access";
import { resolveVaultFiling, VAULT_CATEGORIES } from "@/types/vault";

/* ------------------------------------------------------------------ */
/*  Clearance                                                          */
/*                                                                     */
/*  This predicate is the feature. It is spelled a second time in      */
/*  firestore.rules and a third as the member's two queries in         */
/*  `lib/queries/vault`, and all three have to mean the same thing —   */
/*  so what it means is pinned down here.                              */
/* ------------------------------------------------------------------ */

const owner = { uid: "owner-1", role: "OWNER" };
const member = { uid: "member-1", role: "MEMBER" };
const otherMember = { uid: "member-2", role: "MEMBER" };

const internalDoc = { clearance: "INTERNAL" as const, uploadedBy: "member-1" };
const restrictedDoc = { clearance: "RESTRICTED" as const, uploadedBy: "member-1" };

describe("reading", () => {
  it("lets anyone in the workspace read an internal document", () => {
    expect(canReadVaultDocument(internalDoc, member)).toBe(true);
    expect(canReadVaultDocument(internalDoc, otherMember)).toBe(true);
    expect(canReadVaultDocument(internalDoc, owner)).toBe(true);
  });

  it("keeps a restricted document from a member who did not file it", () => {
    expect(canReadVaultDocument(restrictedDoc, otherMember)).toBe(false);
  });

  it("lets an owner read a restricted document", () => {
    expect(canReadVaultDocument(restrictedDoc, owner)).toBe(true);
  });

  it("leaves the uploader able to read what they filed", () => {
    /* Without this, a member who files their own signed contract under
       HR immediately loses sight of it, which reads as the app eating
       the file. */
    expect(canReadVaultDocument(restrictedDoc, member)).toBe(true);
  });

  it("accepts a lowercase role, as some older user documents carry", () => {
    expect(canReadVaultDocument(restrictedDoc, { uid: "x", role: "owner" })).toBe(true);
  });
});

describe("managing", () => {
  it("is the same set that can read a restricted document", () => {
    expect(canManageVaultDocument(restrictedDoc, owner)).toBe(true);
    expect(canManageVaultDocument(restrictedDoc, member)).toBe(true);
    expect(canManageVaultDocument(restrictedDoc, otherMember)).toBe(false);
  });

  it("does not let readable mean deletable", () => {
    /* An internal document is readable by everyone; if that also made it
       purgeable by everyone the Vault would not be a filing cabinet. */
    expect(canReadVaultDocument(internalDoc, otherMember)).toBe(true);
    expect(canManageVaultDocument(internalDoc, otherMember)).toBe(false);
  });
});

describe("usage counters", () => {
  it("treats a workspace with no counter as empty", () => {
    /* Every org that existed before the Vault has no field here, and a
       missing counter must not block their first upload. */
    expect(readVaultUsage(undefined)).toEqual({ documents: 0, bytes: 0 });
    expect(readVaultUsage({})).toEqual({ documents: 0, bytes: 0 });
    expect(readVaultUsage({ vaultUsage: null })).toEqual({ documents: 0, bytes: 0 });
  });

  it("ignores a corrupt counter rather than trusting it", () => {
    expect(readVaultUsage({ vaultUsage: { documents: "many", bytes: -5 } })).toEqual({
      documents: 0,
      bytes: 0,
    });
  });

  it("adds a filed document to both counters", () => {
    expect(applyVaultDelta({ documents: 2, bytes: 1000 }, 500, 1)).toEqual({
      documents: 3,
      bytes: 1500,
    });
  });

  it("credits a purge back", () => {
    expect(applyVaultDelta({ documents: 2, bytes: 1000 }, 500, -1)).toEqual({
      documents: 1,
      bytes: 500,
    });
  });

  it("never lets a counter go negative and hand out free storage", () => {
    expect(applyVaultDelta({ documents: 0, bytes: 0 }, 500, -1)).toEqual({
      documents: 0,
      bytes: 0,
    });
  });
});

describe("filing", () => {
  it("takes the clearance from the shelf when none is given", () => {
    expect(resolveVaultFiling("finance", undefined)).toEqual({
      category: "finance",
      clearance: "RESTRICTED",
    });
    expect(resolveVaultFiling("policies", undefined)).toEqual({
      category: "policies",
      clearance: "INTERNAL",
    });
  });

  it("honours an explicit clearance over the shelf's default", () => {
    expect(resolveVaultFiling("finance", "INTERNAL")).toEqual({
      category: "finance",
      clearance: "INTERNAL",
    });
  });

  it("falls back to the resolved shelf's default, not the claimed one", () => {
    /* An unrecognised category must not leave a document filed in
       "other" while carrying the default of a shelf it is not on. */
    const filed = resolveVaultFiling("payroll-secrets", "not-a-clearance");
    expect(filed.category).toBe("other");
    expect(filed.clearance).toBe(VAULT_CATEGORIES.other.defaultClearance);
  });

  it("defaults an unrecognised shelf to restricted", () => {
    expect(resolveVaultFiling(undefined, undefined).clearance).toBe("RESTRICTED");
  });
});
