import {
  EMPTY_VAULT_USAGE,
  type VaultClearance,
  type VaultUsage,
} from "@/types/vault";

/* ------------------------------------------------------------------ */
/*  Vault clearance                                                    */
/*                                                                     */
/*  Kept pure and free of Firestore so the rule the whole feature       */
/*  rests on can be tested directly, and so the three places that must  */
/*  agree — the Firestore rules, the server actions and the client       */
/*  query — are checked against one definition rather than three        */
/*  re-spellings of the same conditional.                               */
/*                                                                     */
/*  These are the LAST word only in the actions. The client list is     */
/*  built from queries a member is allowed to run, so a restricted       */
/*  document never reaches the browser to be filtered out of.           */
/* ------------------------------------------------------------------ */

/** The shape both predicates need. Anything wider is the caller's business. */
export interface VaultSubject {
  clearance: VaultClearance;
  uploadedBy: string;
}

export interface VaultActor {
  uid: string;
  role: string;
}

function isOwnerRole(role: string): boolean {
  return role?.toUpperCase() === "OWNER";
}

/**
 * Whether this person may read the document.
 *
 * INTERNAL is everyone in the workspace — org membership is established
 * before this is ever called, by the session and by the document's path.
 * RESTRICTED is owners plus the person who filed it.
 */
export function canReadVaultDocument(
  doc: VaultSubject,
  actor: VaultActor
): boolean {
  if (doc.clearance === "INTERNAL") return true;
  return isOwnerRole(actor.role) || doc.uploadedBy === actor.uid;
}

/**
 * Whether this person may re-file, re-classify or purge the document.
 *
 * The same set that can read a restricted document, and deliberately not
 * wider: if every member could delete from the Vault, an INTERNAL
 * clearance would mean "everyone may read this and any one of them may
 * destroy it", which is not a filing cabinet.
 */
export function canManageVaultDocument(
  doc: VaultSubject,
  actor: VaultActor
): boolean {
  return isOwnerRole(actor.role) || doc.uploadedBy === actor.uid;
}

/* ------------------------------------------------------------------ */
/*  Usage arithmetic                                                   */
/* ------------------------------------------------------------------ */

/**
 * Reads the running totals off an organization document.
 *
 * Tolerant on purpose: every workspace that existed before the Vault has
 * no `vaultUsage` field, and a missing counter has to mean "empty" rather
 * than blocking the first upload of every existing org.
 */
export function readVaultUsage(orgData: unknown): VaultUsage {
  const usage = (orgData as { vaultUsage?: unknown } | undefined)?.vaultUsage as
    | Partial<VaultUsage>
    | undefined;

  if (!usage || typeof usage !== "object") return { ...EMPTY_VAULT_USAGE };

  const documents = Number(usage.documents);
  const bytes = Number(usage.bytes);

  return {
    documents: Number.isFinite(documents) && documents > 0 ? Math.floor(documents) : 0,
    bytes: Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0,
  };
}

/**
 * The totals after a document of `size` is added or removed.
 *
 * Clamped at zero because the counters are the quota, and a counter that
 * has gone negative hands out free storage. Drift is possible — a purge
 * whose Cloudinary call succeeded and whose transaction did not, say —
 * and the safe direction to drift is toward less room, not more.
 */
export function applyVaultDelta(
  usage: VaultUsage,
  size: number,
  direction: 1 | -1
): VaultUsage {
  const delta = Number.isFinite(size) && size > 0 ? Math.floor(size) : 0;
  return {
    documents: Math.max(usage.documents + direction, 0),
    bytes: Math.max(usage.bytes + delta * direction, 0),
  };
}
