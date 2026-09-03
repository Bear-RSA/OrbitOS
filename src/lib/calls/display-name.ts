/* ------------------------------------------------------------------ */
/*  Display names in a room                                            */
/*                                                                     */
/*  The name a walk-in types is the only thing anyone else in the call */
/*  knows about them, and it is unauthenticated free text going onto   */
/*  other people's screens. So it is cleaned here, once, rather than   */
/*  trusted at each render site.                                       */
/*                                                                     */
/*  What this is NOT is an identity check. Nothing stops a walk-in     */
/*  typing a colleague's name — that is inherent to letting people in  */
/*  without an account, and it is why walk-ins are marked. The `guest` */
/*  suffix is the honest signal: this person's name is a claim, not a  */
/*  credential, and the room should be able to see that at a glance.   */
/* ------------------------------------------------------------------ */

/** Long enough for a real name, short enough not to break a tile. */
export const MAX_DISPLAY_NAME = 60;

const MIN_DISPLAY_NAME = 2;

/** Marks a participant who entered by typing a name rather than signing in. */
export const GUEST_SUFFIX = " (guest)";

/**
 * Characters with no business in a name rendered next to a video tile.
 *
 * The C0 and C1 control ranges, the zero-width joiners and spaces, the
 * bidirectional overrides, and the byte-order mark. These are how a
 * display name is made to render as something other than what it says —
 * a right-to-left override turns one name into a different one on screen
 * while comparing equal to neither.
 */
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

/**
 * Strips the invisibles, then collapses whitespace — a name padded out
 * with spaces is how one participant pushes others out of a list.
 */
export function sanitizeDisplayName(raw: string): string {
  return (raw ?? "")
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DISPLAY_NAME)
    .trim();
}

export interface NameCheck {
  name?: string;
  error?: string;
}

/**
 * Vets a typed name for the join screens.
 *
 * Pure, and shaped like `vetGuest` in `events/engagement-form` so the
 * walk-in page can surface the failure inline instead of round-tripping
 * to the server to learn that a name is blank.
 */
export function vetDisplayName(raw: string): NameCheck {
  const name = sanitizeDisplayName(raw);

  if (name.length === 0) return { error: "Enter your full name." };
  if (name.length < MIN_DISPLAY_NAME) {
    return { error: "That is too short to be a name." };
  }
  // A name made only of punctuation renders as noise in the participant list.
  if (!/[\p{L}\p{N}]/u.test(name)) {
    return { error: "Enter your name using letters." };
  }

  return { name };
}

/**
 * The name that goes to the provider.
 *
 * The suffix is appended after truncation, never before — a long name
 * must lose its own tail rather than lose the marker that says its owner
 * walked in off a forwarded link.
 */
export function participantName(raw: string, isGuest: boolean): string {
  const name = sanitizeDisplayName(raw) || "Guest";
  return isGuest ? `${name}${GUEST_SUFFIX}` : name;
}
