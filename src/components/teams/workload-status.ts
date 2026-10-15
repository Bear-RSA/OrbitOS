import type { WorkloadStatus } from "@/types/dashboard";

/* ------------------------------------------------------------------ */
/*  Workload status, as Teams draws it                                 */
/*                                                                     */
/*  Shared by the roster grid and the org tree so a person's dot is    */
/*  the same colour in both views.                                     */
/* ------------------------------------------------------------------ */

export const WORKLOAD_STATUS: Record<
  WorkloadStatus,
  { label: string; text: string; dot: string; weight: number }
> = {
  // Ordered by how much attention the operator needs — `weight` sorts the roster.
  "needs-attention": { label: "Critical Load", text: "text-orbit-red", dot: "bg-orbit-red", weight: 0 },
  heavy: { label: "High Volume", text: "text-orbit-amber", dot: "bg-orbit-amber", weight: 1 },
  balanced: { label: "Optimal Flow", text: "text-orbit-green", dot: "bg-orbit-green", weight: 2 },
  light: { label: "Under Capacity", text: "text-orbit-blue", dot: "bg-orbit-blue", weight: 3 },
};
