import type { Rank } from "@/lib/members/rank";

/* ------------------------------------------------------------------ */
/*  Rank halos                                                         */
/*                                                                     */
/*  The glow fades down the ladder as well as the colour changing, so  */
/*  the order still reads for someone who can't tell violet from blue. */
/*  Green, amber and red already mean status in the app, so no halo    */
/*  uses them.                                                         */
/*                                                                     */
/*  Kept under components/ because Tailwind only scans app/,           */
/*  components/ and pages/ for class names.                            */
/* ------------------------------------------------------------------ */

export const RANK_HALO: Record<Rank, string> = {
  OWNER: "ring-2 ring-orbit-gold/60 shadow-[0_0_12px_rgb(var(--orbit-gold)/0.35)]",
  EXECUTIVE: "ring-2 ring-orbit-violet/60 shadow-[0_0_9px_rgb(var(--orbit-violet)/0.28)]",
  MANAGER: "ring-2 ring-orbit-blue/55 shadow-[0_0_5px_rgb(var(--orbit-blue)/0.2)]",
  TEAM_LEAD: "ring-[1.5px] ring-orbit-teal/60",
  MEMBER: "",
};

/** Text colour for a rank's name, matching its halo. */
export const RANK_TEXT: Record<Rank, string> = {
  OWNER: "text-orbit-gold",
  EXECUTIVE: "text-orbit-violet",
  MANAGER: "text-orbit-blue",
  TEAM_LEAD: "text-orbit-teal",
  MEMBER: "text-ink-dim",
};
