/* ------------------------------------------------------------------ */
/*  Vault cost ceilings                                                */
/*                                                                     */
/*  ALWAYS on, independent of BILLING_GUARDRAILS_ENABLED — the same    */
/*  split the call ceilings, the invite dispatcher and the telemetry   */
/*  stream guard already make. Stored bytes are a Cloudinary line item */
/*  and they are the worst kind: unlike a call or an email, storage    */
/*  keeps billing every month after the mistake, with nobody watching. */
/*                                                                     */
/*  The tier limits in `resolveVaultLimits` narrow these; nothing ever */
/*  widens them. A tier returning -1 means "the plan does not narrow   */
/*  it", not "unlimited" — there is no unlimited here, because the     */
/*  invoice is real whether or not the paywall is switched on.         */
/* ------------------------------------------------------------------ */

export const MB = 1024 * 1024;

/**
 * The largest single file the Vault will accept.
 *
 * Set by what the shelf is for rather than by what Cloudinary tolerates.
 * Registration certificates, financials and signed contracts are scans
 * and PDFs; a file past this is a video or a disk image, and those belong
 * in a project's asset repository where they are attached to the work
 * that needs them.
 */
export const HARD_MAX_FILE_BYTES = 100 * MB;

/**
 * Total bytes one workspace may keep in the Vault.
 *
 * The ceiling that matters, because it is the one an accident reaches:
 * a single 100MB file is a mistake somebody notices, and two hundred of
 * them is a habit nobody does.
 */
export const HARD_MAX_STORAGE_BYTES = 20 * 1024 * MB; // 20 GB

/**
 * Documents one workspace may keep.
 *
 * Separate from the byte ceiling because the two protect different
 * things. Bytes protect the storage bill; the count protects every read
 * of the shelf — the list subscribes in realtime, so a vault of ten
 * thousand tiny documents is cheap to store and expensive to open.
 */
export const HARD_MAX_DOCUMENTS = 2_000;

/**
 * How long a signed download link stays good.
 *
 * Short because of what these documents are. A vault link is the one
 * most likely to be forwarded — it rides in a message to an accountant
 * or an attorney — and a link to the payroll register that still works
 * next month is the leak this whole feature exists to prevent.
 */
export const DOWNLOAD_URL_TTL_SECONDS = 300;

/* ------------------------------------------------------------------ */
/*  Clamps                                                             */
/* ------------------------------------------------------------------ */

/**
 * The narrower of the plan's document allowance and the ceiling.
 *
 * `tierMax` of -1 means the plan does not narrow it, so the ceiling
 * stands alone.
 */
export function vaultDocumentAllowance(tierMax: number): number {
  if (!Number.isFinite(tierMax) || tierMax < 0) return HARD_MAX_DOCUMENTS;
  return Math.min(Math.floor(tierMax), HARD_MAX_DOCUMENTS);
}

/**
 * The narrower of the plan's storage allowance and the ceiling, in bytes.
 *
 * Takes megabytes because that is how the tier states it, and returns
 * bytes because that is what the stored usage counts in. Doing the
 * conversion here means no call site has to remember which unit it holds.
 */
export function vaultStorageAllowance(tierMaxMb: number): number {
  if (!Number.isFinite(tierMaxMb) || tierMaxMb < 0) return HARD_MAX_STORAGE_BYTES;
  return Math.min(Math.floor(tierMaxMb) * MB, HARD_MAX_STORAGE_BYTES);
}

/**
 * Whether a single file is small enough to accept.
 *
 * A non-finite or negative size fails: the only way to get one is a
 * client that lied about it or a browser that could not read the file,
 * and neither is a thing to store bytes for.
 */
export function withinFileCeiling(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > 0 && bytes <= HARD_MAX_FILE_BYTES;
}

/* ------------------------------------------------------------------ */
/*  Admission                                                          */
/* ------------------------------------------------------------------ */

export interface VaultAdmission {
  allowed: boolean;
  /** Reader-facing, and specific about which limit was reached. */
  error?: string;
}

/** Bytes as something a person can read. Mirrors the explorer's format. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}`;
}

/**
 * Decides whether one more file of `size` fits, given what the workspace
 * already holds and what it is allowed.
 *
 * Every limit is checked against the incoming file rather than against
 * the stored total alone, so a workspace one byte under its allowance
 * cannot admit a 100MB upload and go over.
 */
export function admitVaultUpload(params: {
  size: number;
  usedBytes: number;
  usedDocuments: number;
  maxBytes: number;
  maxDocuments: number;
}): VaultAdmission {
  const { size, usedBytes, usedDocuments, maxBytes, maxDocuments } = params;

  if (!withinFileCeiling(size)) {
    return {
      allowed: false,
      error: `Files are capped at ${formatBytes(HARD_MAX_FILE_BYTES)}. Attach anything larger to the project it belongs to.`,
    };
  }

  if (usedDocuments >= maxDocuments) {
    return {
      allowed: false,
      error: `Vault is full at ${maxDocuments} documents. Purge something you no longer need, or move up a plan.`,
    };
  }

  if (usedBytes + size > maxBytes) {
    return {
      allowed: false,
      error: `Not enough room — ${formatBytes(Math.max(maxBytes - usedBytes, 0))} left of ${formatBytes(maxBytes)}. Purge something you no longer need, or move up a plan.`,
    };
  }

  return { allowed: true };
}
