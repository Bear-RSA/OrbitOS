import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/* ------------------------------------------------------------------ */
/*  Test runner                                                        */
/*                                                                     */
/*  Node environment, not jsdom: what is worth testing here is the     */
/*  logic that decides what gets written and who gets emailed, none of */
/*  which needs a DOM. Components are left to the browser.             */
/*                                                                     */
/*  Tests sit next to the code they cover as `*.test.ts` rather than   */
/*  in a parallel tree, so a module and its tests move together.       */
/* ------------------------------------------------------------------ */

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /* Engagement timing is read as local wall time throughout — see the
       timezone note in `lib/events/engagement-form`. Pinning the zone
       keeps a run on a developer's machine and a run in CI agreeing on
       what "14:00" means. */
    env: { TZ: "Africa/Johannesburg" },
  },
  resolve: {
    // Mirrors the `@/*` path in tsconfig.json.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
