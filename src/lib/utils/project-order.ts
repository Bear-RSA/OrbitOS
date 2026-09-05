import { Project } from "@/types/project";

/**
 * The workspace's own ordering: priority ascending (P1 first), then the
 * unprioritized by createdAt descending.
 *
 * Every listing that shows projects has to sort through here. Reordering
 * writes `priority: index + 1` against the order on screen, so a listing
 * that renders projects in Firestore order lets an owner save a ranking
 * they can never see again.
 */
export function sortProjectsByPriority<T extends Project>(projects: T[]): T[] {
  return [...projects].sort((a, b) => {
    const aPri = a.priority ?? Infinity;
    const bPri = b.priority ?? Infinity;
    if (aPri !== bPri) return aPri - bPri;
    // Both unprioritized — newest first
    const aTime = a.createdAt?.toMillis?.() ?? 0;
    const bTime = b.createdAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });
}
