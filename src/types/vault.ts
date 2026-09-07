import { Timestamp } from "firebase/firestore";

/* ------------------------------------------------------------------ */
/*  The Vault — company records, org-scoped                            */
/*                                                                     */
/*  Project files live under the project they belong to and die with   */
/*  it. Company records do not: a certificate of incorporation, a       */
/*  signed lease, last year's annual financials and an employee's tax   */
/*  form all outlive every project in the workspace, and none of them   */
/*  belong to one. They hang off the organization instead.              */
/*                                                                     */
/*  The other difference is who may read them. A project's asset        */
/*  repository is flat — anyone in the org sees everything in it. That  */
/*  is wrong for a shelf holding payroll and bank statements, so every  */
/*  document here carries a clearance, and it is enforced in Firestore  */
/*  rules and in every server action, not by hiding rows in the UI.     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Clearance                                                          */
/* ------------------------------------------------------------------ */

/**
 * Who may read a document.
 *
 *   INTERNAL   — anyone in the workspace.
 *   RESTRICTED — owners, plus whoever filed it.
 *
 * The uploader keeps their own read access on a RESTRICTED document on
 * purpose. Without it a member who files their signed contract into HR
 * immediately loses sight of it, which reads as the app eating the file;
 * with it, "only leadership and I can see this" is a thing a member can
 * actually do.
 */
export type VaultClearance = "INTERNAL" | "RESTRICTED";

export const VAULT_CLEARANCES: VaultClearance[] = ["INTERNAL", "RESTRICTED"];

export function isVaultClearance(value: unknown): value is VaultClearance {
  return value === "INTERNAL" || value === "RESTRICTED";
}

/* ------------------------------------------------------------------ */
/*  Categories                                                         */
/* ------------------------------------------------------------------ */

/**
 * The shelf labels. Deliberately a fixed set rather than folders users
 * create: the whole value of a company vault is that the lease is always
 * filed where the next person will look for it, and free-form folders
 * are how you end up with "Legal", "legal docs" and "LEGAL (old)".
 */
export type VaultCategory =
  | "registration"
  | "finance"
  | "tax"
  | "hr"
  | "legal"
  | "insurance"
  | "policies"
  | "other";

export interface VaultCategoryDefinition {
  id: VaultCategory;
  label: string;
  /** Shown under the category chip when it is the active filter. */
  description: string;
  /**
   * The clearance a document gets when filed here and the uploader does
   * not say otherwise.
   *
   * Defaults lean restricted wherever the shelf normally holds money or
   * people. An uploader can always override per document — the default is
   * about what happens when nobody thinks about it, and the failure worth
   * preventing is a payroll export landing in front of the whole team
   * because someone accepted a form they did not read.
   */
  defaultClearance: VaultClearance;
}

export const VAULT_CATEGORIES: Record<VaultCategory, VaultCategoryDefinition> = {
  registration: {
    id: "registration",
    label: "Registration",
    description: "Incorporation, CIPC filings, B-BBEE certificates, licences.",
    defaultClearance: "INTERNAL",
  },
  finance: {
    id: "finance",
    label: "Finance",
    description: "Management accounts, statements, budgets, audits.",
    defaultClearance: "RESTRICTED",
  },
  tax: {
    id: "tax",
    label: "Tax",
    description: "SARS returns, VAT, tax clearance certificates.",
    defaultClearance: "RESTRICTED",
  },
  hr: {
    id: "hr",
    label: "HR",
    description: "Employment contracts, payroll, leave and onboarding forms.",
    defaultClearance: "RESTRICTED",
  },
  legal: {
    id: "legal",
    label: "Legal",
    description: "Client contracts, NDAs, leases, IP assignments.",
    defaultClearance: "RESTRICTED",
  },
  insurance: {
    id: "insurance",
    label: "Insurance",
    description: "Policies, schedules, claims history.",
    defaultClearance: "INTERNAL",
  },
  policies: {
    id: "policies",
    label: "Policies",
    description: "Handbooks, codes of conduct, operating procedures.",
    defaultClearance: "INTERNAL",
  },
  other: {
    id: "other",
    label: "Other",
    description: "Anything that does not sit on one of the shelves above.",
    defaultClearance: "RESTRICTED",
  },
};

/** Display order for the filter rail. */
export const VAULT_CATEGORY_ORDER: VaultCategory[] = [
  "registration",
  "finance",
  "tax",
  "hr",
  "legal",
  "insurance",
  "policies",
  "other",
];

export const DEFAULT_VAULT_CATEGORY: VaultCategory = "other";

export function isVaultCategory(value: unknown): value is VaultCategory {
  return typeof value === "string" && value in VAULT_CATEGORIES;
}

/**
 * Resolves the category a write claims into one that exists, and the
 * clearance to store alongside it.
 *
 * Both halves are resolved together because the clearance default is a
 * property of the category: taking an unrecognised category and a missing
 * clearance separately is how a document ends up filed in "other" while
 * carrying the default of a shelf it is not on.
 */
export function resolveVaultFiling(
  category: unknown,
  clearance: unknown
): { category: VaultCategory; clearance: VaultClearance } {
  const resolvedCategory = isVaultCategory(category)
    ? category
    : DEFAULT_VAULT_CATEGORY;
  const resolvedClearance = isVaultClearance(clearance)
    ? clearance
    : VAULT_CATEGORIES[resolvedCategory].defaultClearance;

  return { category: resolvedCategory, clearance: resolvedClearance };
}

/* ------------------------------------------------------------------ */
/*  Document                                                           */
/* ------------------------------------------------------------------ */

/**
 * How Cloudinary classified the asset. Stored at upload time rather than
 * re-derived from the browser MIME type later — the project asset
 * repository learned that the hard way, where a guessed type produced
 * download URLs pointing at a resource path Cloudinary never used.
 */
export type VaultResourceType = "image" | "video" | "raw";

/**
 * A document at `organizations/{orgId}/vault/{documentId}`.
 */
export interface VaultDocument {
  id: string;
  orgId: string;
  /** The original filename, as the uploader's machine had it. */
  name: string;
  /** What this is and why it is on the shelf. Optional, free text. */
  note?: string;
  category: VaultCategory;
  clearance: VaultClearance;
  url: string;
  publicId: string;
  resourceType: VaultResourceType;
  /** Bytes. Summed into the org's storage allowance. */
  size: number;
  /** Browser MIME type, kept for the file-class badge. */
  type: string;
  uploadedBy: string;
  /**
   * Denormalised so the list renders a name without a users lookup per
   * row. The roster is not loaded on this page — the Vault is about
   * documents, not people, and fetching every member to label eight rows
   * is a read budget spent on nothing.
   */
  uploadedByName: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * The running totals kept on the organization document, at
 * `organizations/{orgId}.vaultUsage`.
 *
 * Maintained transactionally on every file and purge rather than counted
 * on demand. Counting means reading every document in the vault before
 * accepting an upload, which is a bill that grows with the shelf and is
 * paid most often by the workspaces storing the most.
 */
export interface VaultUsage {
  documents: number;
  bytes: number;
}

export const EMPTY_VAULT_USAGE: VaultUsage = { documents: 0, bytes: 0 };
