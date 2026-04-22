import { db } from "@/lib/firebase/client";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";

export interface Briefing {
  id: string;
  projectId: string;
  milestoneId: string;
  author: {
    uid: string;
    name: string;
    photoURL: string | null;
  };
  content: string;
  timestamp: any;
}

export function getMilestoneBriefings(
  projectId: string,
  milestoneId: string,
  onUpdate: (briefings: Briefing[]) => void
) {
  const q = query(
    collection(db, "briefings"),
    where("projectId", "==", projectId),
    where("milestoneId", "==", milestoneId),
    orderBy("timestamp", "asc")
  );

  return onSnapshot(q, (snapshot) => {
    const data: Briefing[] = [];
    snapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() } as Briefing);
    });
    onUpdate(data);
  });
}
