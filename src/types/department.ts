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
  /** Millis, so the shape survives the server-action boundary. */
  createdAt: number;
}
