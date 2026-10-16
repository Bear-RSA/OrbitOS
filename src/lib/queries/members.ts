import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Member } from "@/types/member";
import { normaliseRole } from "@/lib/members/rank";

const USERS_COLLECTION = "users";

export function subscribeToMembersByOrg(
  orgId: string,
  callback: (members: Member[]) => void
) {
  const q = query(
    collection(db, USERS_COLLECTION),
    where("orgId", "==", orgId)
  );

  return onSnapshot(q, (snapshot) => {
    const members = snapshot.docs.map((doc) => {
      const data = doc.data();
      const normalizedRole = normaliseRole(data.role);
      return { id: doc.id, ...data, role: normalizedRole } as Member;
    });
    callback(members);
  }, (err) => {
    console.error("[Members Subscription Error]:", err);
    callback([]);
  });
}

export async function getMembersByOrg(orgId: string): Promise<Member[]> {
  const q = query(
    collection(db, USERS_COLLECTION),
    where("orgId", "==", orgId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const normalizedRole = normaliseRole(data.role);
    return { id: doc.id, ...data, role: normalizedRole } as Member;
  });
}

export async function getUserById(userId: string): Promise<Member | null> {
  const ref = doc(db, USERS_COLLECTION, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const normalizedRole = normaliseRole(data.role);
  return { id: snap.id, ...data, role: normalizedRole } as Member;
}


