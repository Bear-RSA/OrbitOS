/* ------------------------------------------------------------------ */
/*  User Preferences                                                   */
/*                                                                     */
/*  Stored at `users/{uid}.preferences`. Every field is optional in    */
/*  Firestore — accounts created before this existed simply fall back  */
/*  to `DEFAULT_PREFERENCES` via `resolvePreferences`.                 */
/* ------------------------------------------------------------------ */

/**
 * `auto` hands presence back to the status engine in
 * `syncOperationalStatusAction`, which derives it from workload and
 * heartbeat. Anything else is a manual override the engine leaves alone.
 */
export type PresenceMode = "auto" | "available" | "focused" | "offline";

/** `system` follows the OS via `prefers-color-scheme`. */
export type ThemeMode = "system" | "light" | "dark";

/** Mirrored into localStorage so the boot script can apply it before paint. */
export const THEME_STORAGE_KEY = "orbitos.theme";

export interface UserPreferences {
  /** Colour scheme. Applied to `<html data-theme>`. */
  theme: ThemeMode;
  /** Suppresses animation and scroll-reveal motion app-wide. */
  reducedMotion: boolean;
  /** 24-hour clock in the dashboard chrome; otherwise 12-hour. */
  clock24h: boolean;
  /** Presence shown to teammates in the personnel hub. */
  presence: PresenceMode;
  /** Email reminder the day before a task assigned to you falls due. */
  taskReminders: boolean;
  /** Email when someone RSVPs to an engagement you organize. */
  rsvpNotifications: boolean;
  /**
   * A short chime when a message arrives from a colleague.
   *
   * On by default, because a message you are not told about is a message
   * that did not arrive — the unread dot only exists on screens you have
   * to already be looking at. Off is one toggle away for anyone who
   * works with the sound up.
   */
  messageSounds: boolean;
  /**
   * A repeating ring while a colleague is calling you, and a ringback
   * tone while you wait for them to pick up.
   *
   * Its own switch rather than a second use of `messageSounds`: a ring
   * is louder and lasts forty-five seconds, so somebody may well want it
   * when they have turned chimes off — and somebody working next to a
   * sleeping baby wants the opposite. On by default, because a silent
   * phone is not a phone.
   */
  callSounds: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  reducedMotion: false,
  clock24h: true,
  presence: "auto",
  taskReminders: true,
  rsvpNotifications: true,
  messageSounds: true,
  callSounds: true,
};

/** Fills in every missing key so callers never branch on `undefined`. */
export function resolvePreferences(
  stored: Partial<UserPreferences> | null | undefined
): UserPreferences {
  return { ...DEFAULT_PREFERENCES, ...(stored ?? {}) };
}

/** Narrows an untrusted string (localStorage, a URL) to a ThemeMode. */
export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}
