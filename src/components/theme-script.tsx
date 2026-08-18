import { THEME_STORAGE_KEY } from "@/types/preferences";

/* ------------------------------------------------------------------ */
/*  Theme boot script                                                  */
/*                                                                     */
/*  The authoritative theme lives on the user's Firestore profile, but */
/*  that arrives several hundred ms after first paint — long enough to */
/*  flash a full-screen dark page at someone who chose light. So the   */
/*  choice is mirrored into localStorage by `PreferenceEffects`, and   */
/*  this script replays it synchronously in <head>, before the browser */
/*  paints anything.                                                   */
/*                                                                     */
/*  It must stay dependency-free and synchronous. Anything async, or   */
/*  anything that throws, reintroduces the flash.                      */
/* ------------------------------------------------------------------ */

const script = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "dark";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    /* Private mode, disabled storage, or a sandboxed iframe. Falling
       through leaves no data-theme attribute, and bare :root is dark —
       the pre-existing design, which is the right thing to fail onto. */
  }
})();
`;

export function ThemeScript() {
  return (
    <script
      // The script is a build-time constant with no interpolated user data;
      // the only dynamic part is the storage key, which is JSON-escaped.
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
