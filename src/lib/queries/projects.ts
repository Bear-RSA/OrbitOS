import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Project } from "@/types/project";
import { sortProjectsByPriority } from "@/lib/utils/project-order";

const PROJECTS_COLLECTION = "projects";

async function fetchOrgProjects(orgId: string): Promise<Project[]> {
  const q = query(
    collection(db, PROJECTS_COLLECTION),
    where("orgId", "==", orgId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project));
}

/**
 * Active projects for an org, in the workspace's own priority order.
 *
 * Archived ones are filtered in memory because Firestore cannot match
 * `archived != true` on documents that never had the field — projects
 * created before archiving existed have no `archived` key. The sort is in
 * memory for the same reason: `priority` is absent on projects the owner
 * has never ranked, and `orderBy` drops those documents entirely.
 */
export async function getProjectsByOrg(orgId: string): Promise<Project[]> {
  const projects = await fetchOrgProjects(orgId);
  return sortProjectsByPriority(projects.filter((p) => !p.archived));
}

/** The archive shelf — what an owner restores from. */
export async function getArchivedProjectsByOrg(orgId: string): Promise<Project[]> {
  const projects = await fetchOrgProjects(orgId);
  return sortProjectsByPriority(projects.filter((p) => p.archived === true));
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const docRef = doc(db, PROJECTS_COLLECTION, projectId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Project;
}
