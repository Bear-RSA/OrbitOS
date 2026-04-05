import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Project } from "@/types/project";

const PROJECTS_COLLECTION = "projects";

export async function getProjectByOrg(orgId: string): Promise<Project | null> {
  const q = query(
    collection(db, PROJECTS_COLLECTION),
    where("orgId", "==", orgId),
    orderBy("createdAt", "asc"),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Project;
}
