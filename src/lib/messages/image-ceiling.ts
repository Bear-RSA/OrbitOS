import { periodKeyFor } from "@/types/transcript";
import { EMPTY_CHAT_IMAGE_USAGE, type ChatImageUsage } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Chat image cost ceilings                                           */
/*                                                                     */
/*  ALWAYS on, independent of BILLING_GUARDRAILS_ENABLED — the same    */
/*  split the vault ceilings, the transcript ceilings and the GIF      */
/*  search guard already make.                                         */
/*                                                                     */
/*  A GIF from the catalogue costs us nothing: GIPHY hosts it. A       */
/*  pasted screenshot is different — it goes up to OUR Cloudinary      */
/*  account, is stored there every month after the thread has moved   */
/*  on, and is served from there every time somebody scrolls past it.  */
/*  Nobody deletes a chat image, so the bill only ever grows. These    */
/*  numbers are what keeps that growth inside something a workspace    */
/*  can be charged for.                                                */
/*                                                                     */
/*  The tier limit in `resolveChatImageLimit` narrows these; nothing   */
/*  ever widens them. A tier returning -1 means "the plan does not     */
/*  narrow it", not "unlimited".                                       */
/* ------------------------------------------------------------------ */

export const MB = 1024 * 1024;

/**
 * The largest single picture chat will accept.
 *
 * A screenshot is a few hundred kilobytes; a phone photo is a few
 * megabytes. Past this it is a scan or a render, and those belong in
 * the Vault or on a project, where they are attached to the work.
 */
export const HARD_MAX_IMAGE_BYTES = 10 * MB;

/**
 * Pictures one workspace may upload into chat in a month.
 *
 * Multiplied by `HARD_MAX_IMAGE_BYTES` this is the worst-case monthly
 * growth of the storage bill for one org, and it is sized so that a
 * runaway client pasting in a loop is a number worth arguing about
 * rather than an invoice worth crying over.
 */
export const HARD_MAX_IMAGES_PER_MONTH = 3_000;

/**
 * The longest edge Cloudinary is told to keep, in pixels.
 *
 * Signed into the upload as an incoming transformation, so it is
 * enforced whatever the client sends: a 6000px 4K screenshot is stored
 * at this size and never at its own. Wide enough that text in a
 * screenshot stays legible when opened; small enough that the stored
 * copy is bounded by the format rather than by the sender's monitor.
 */
export const HARD_MAX_EDGE_PX = 2_400;

/**
 * The widest rendition the transcript asks for.
 *
 * The bubble is capped at 320 CSS pixels; this is enough for a retina
 * display at that width and is the copy every reader downloads. The
 * full-size original is one click away and only fetched on purpose.
 */
export const PREVIEW_WIDTH_PX = 800;

/**
 * What the composer will take from the clipboard or the picker.
 *
 * Deliberately the browser-native raster formats and nothing else. An
 * SVG is a document that can carry script; a HEIC or TIFF is something
 * most colleagues' browsers will not draw. A GIF is included because a
 * screen recording tool often produces one, and it is a picture.
 */
export const CHAT_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/** The folder every chat image lives under — see `chatImageFolder`. */
export const CHAT_IMAGE_ROOT = "chat";

/* ------------------------------------------------------------------ */
/*  Clamps                                                             */
/* ------------------------------------------------------------------ */

/**
 * The narrower of the plan's monthly allowance and the ceiling.
 *
 * `tierMax` of -1 means the plan does not narrow it, so the ceiling
 * stands alone. Zero is a real answer and passes through untouched.
 */
export function chatImageAllowance(tierMax: number): number {
  if (!Number.isFinite(tierMax) || tierMax < 0) return HARD_MAX_IMAGES_PER_MONTH;
  return Math.min(Math.floor(tierMax), HARD_MAX_IMAGES_PER_MONTH);
}

/**
 * Whether a single picture is small enough to accept.
 *
 * A non-finite or negative size fails: the only way to get one is a
 * client that lied about it or a browser that could not read the file.
 */
export function withinImageCeiling(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > 0 && bytes <= HARD_MAX_IMAGE_BYTES;
}

export function isChatImageType(type: unknown): type is string {
  return typeof type === "string" && CHAT_IMAGE_TYPES.has(type);
}

/* ------------------------------------------------------------------ */
/*  Naming                                                             */
/* ------------------------------------------------------------------ */

/**
 * Where one conversation's pictures live in Cloudinary.
 *
 * Org first, so a workspace's uploads are one prefix — which is what a
 * future "purge this org" needs, and what `isChatImagePublicId` checks
 * a client's claim against.
 */
export function chatImageFolder(orgId: string, conversationId: string): string {
  return `${CHAT_IMAGE_ROOT}/${orgId}/${conversationId}`;
}

/**
 * Whether a `public_id` the client reports is one this server would
 * have signed for THIS conversation in THIS org.
 *
 * The server chose the id, so the client only ever echoes it back —
 * but an echo is still a claim, and this is the check that stops a
 * member naming a picture from another workspace's folder, or from a
 * thread they are not in, and having the server write a URL to it.
 *
 * The tail is pinned to the alphabet `chatImageName` draws from, so a
 * public_id that is well-prefixed but carries a path or a
 * transformation in its tail is refused too.
 */
export function isChatImagePublicId(
  value: unknown,
  orgId: string,
  conversationId: string
): value is string {
  if (typeof value !== "string") return false;
  const prefix = `${chatImageFolder(orgId, conversationId)}/`;
  if (!value.startsWith(prefix)) return false;
  return /^[A-Za-z0-9_-]{8,64}$/.test(value.slice(prefix.length));
}

/* ------------------------------------------------------------------ */
/*  Usage                                                              */
/* ------------------------------------------------------------------ */

/**
 * Reads the running monthly total off an organization document.
 *
 * Tolerant on purpose: every workspace that existed before chat images
 * has no counter, and a missing one has to mean "none this month"
 * rather than blocking the first screenshot in every existing org.
 *
 * A counter from a previous month reads as zero. The document is only
 * rewritten when a picture is sent, so last month's number sits there
 * until then and must never be mistaken for this month's.
 */
export function readChatImageUsage(
  orgData: unknown,
  at: Date = new Date()
): ChatImageUsage {
  const period = periodKeyFor(at);
  const usage = (orgData as { chatImageUsage?: unknown } | undefined)
    ?.chatImageUsage as Partial<ChatImageUsage> | undefined;

  if (!usage || typeof usage !== "object" || usage.periodKey !== period) {
    return { ...EMPTY_CHAT_IMAGE_USAGE, periodKey: period };
  }

  const images = Number(usage.images);
  const bytes = Number(usage.bytes);

  return {
    periodKey: period,
    images: Number.isFinite(images) && images > 0 ? Math.floor(images) : 0,
    bytes: Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0,
  };
}

/**
 * The totals after one more picture of `bytes` is recorded.
 *
 * Never goes down, and never leaves the current period: a usage
 * document written under last month's key would hand the workspace a
 * second free allowance for the same month.
 */
export function applyChatImageDelta(usage: ChatImageUsage, bytes: number): ChatImageUsage {
  const added = Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0;
  return {
    periodKey: usage.periodKey || periodKeyFor(),
    images: usage.images + 1,
    bytes: usage.bytes + added,
  };
}

/* ------------------------------------------------------------------ */
/*  Admission                                                          */
/* ------------------------------------------------------------------ */

export interface ChatImageAdmission {
  allowed: boolean;
  /** Reader-facing, and specific about which limit was reached. */
  error?: string;
}

/**
 * Whether this workspace may put one more picture of `size` into chat
 * this month.
 *
 * Checked twice — once when the upload is signed, so a workspace that
 * is already out finds out before pushing bytes over the wire, and
 * once inside the transaction that records the message, which is the
 * only one that counts.
 */
export function admitChatImage(params: {
  size: number;
  /** Omitted at record time — the format was settled when the upload was signed. */
  type?: unknown;
  usedImages: number;
  maxImages: number;
}): ChatImageAdmission {
  const { size, type, usedImages, maxImages } = params;

  if (type !== undefined && !isChatImageType(type)) {
    return {
      allowed: false,
      error: "Only PNG, JPEG, WebP and GIF pictures can be sent here.",
    };
  }

  if (!withinImageCeiling(size)) {
    return {
      allowed: false,
      error: `Pictures are capped at ${HARD_MAX_IMAGE_BYTES / MB} MB. Put anything larger in the Vault or on the project.`,
    };
  }

  if (maxImages <= 0) {
    return { allowed: false, error: "Sending pictures requires a paid plan." };
  }

  if (usedImages >= maxImages) {
    return {
      allowed: false,
      error: `This workspace has sent ${maxImages} picture${
        maxImages === 1 ? "" : "s"
      } this month. The allowance resets next month, or move up a plan.`,
    };
  }

  return { allowed: true };
}
