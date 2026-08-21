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
  /** Owner-only: receive the morning digest email. */
  dailyDigest: boolean;
  /** Skip the digest entirely on days with nothing to action. */
  digestOnlyWhenAttention: boolean;
  /** Email reminder the day before a task assigned to you falls due. */
  taskReminders: boolean;
  /** Morning list of everything assigned to you that falls due today. */
  dueTodayDigest: boolean;
  /** Evening summary of what you created, were handed, moved and finished. */
  dailyDebrief: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  reducedMotion: false,
  clock24h: true,
  presence: "auto",
  dailyDigest: true,
  digestOnlyWhenAttention: false,
  taskReminders: true,
  dueTodayDigest: true,
  dailyDebrief: true,
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
