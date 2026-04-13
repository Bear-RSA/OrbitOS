import { db } from "@/lib/firebase/client";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { ProjectFile } from "@/types/file";

export function subscribeToProjectFiles(projectId: string, callback: (files: ProjectFile[]) => void) {
  const q = query(
    collection(db, "projects", projectId, "files"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const files = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ProjectFile[];
    callback(files);
  }, (error) => {
    console.error("Firestore subscription error:", error);
    callback([]); // Return empty array on error to stop loading
  });
}
