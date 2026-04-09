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

const PROJECTS_COLLECTION = "projects";

export async function getProjectsByOrg(orgId: string): Promise<Project[]> {
  const q = query(
    collection(db, PROJECTS_COLLECTION),
    where("orgId", "==", orgId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project));
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const docRef = doc(db, PROJECTS_COLLECTION, projectId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Project;
}

