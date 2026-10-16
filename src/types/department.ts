/* ------------------------------------------------------------------ */
/*  Departments                                                        */
/*                                                                     */
/*  Stored at `departments/{id}`, scoped by `orgId`. Membership lives  */
/*  on the person (`users/{uid}.departmentId`), not on the department, */
/*  so one person can never be filed in two places at once.            */
/*                                                                     */
/*  Every read and write goes through `actions/departments` on the     */
/*  Admin SDK; the catch-all in firestore.rules denies clients both,   */
/*  which is why no rule names this collection.                        */
/* ------------------------------------------------------------------ */

export interface Department {
  id: string;
  orgId: string;
  name: string;
  /** A member of this department, or null. Owners sit above departments. */
  leadId: string | null;
  /** What this department calls its lead: "Team lead", "Head of Design". */
  leadTitle: string;
  /** The colour its card is tinted with. Older departments have none; see `tintOf`. */
  tint?: string | null;
  /** One line on what the department does, shown on its card. */
  description?: string | null;
  /** A Lucide icon name for its card ("rocket"). Null draws the default mark. */
  icon?: string | null;
  /**
   * The Executive and Manager over this department, chosen on the org
   * chart in Admin Tools. Either may be absent. One person can hold the
   * same slot in several departments; neither has to be filed in it.
   */
  executiveId?: string | null;
  managerId?: string | null;
  /** Millis, so the shape survives the server-action boundary. */
  createdAt: number;
}
