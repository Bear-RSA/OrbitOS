import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Member, MemberInvite } from "@/types/member";
import { nanoid } from "../utils/nanoid";

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
      const normalizedRole = data.role?.toUpperCase() === "OWNER" ? "OWNER" : "MEMBER";
      return { id: doc.id, ...data, role: normalizedRole } as Member;
    });
    callback(members);
  }, (err) => {
    console.error("[Members Subscription Error]:", err);
    callback([]);
  });
}
const INVITES_COLLECTION = "memberInvites";

export async function getMembersByOrg(orgId: string): Promise<Member[]> {
  const q = query(
    collection(db, USERS_COLLECTION),
    where("orgId", "==", orgId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const normalizedRole = data.role?.toUpperCase() === "OWNER" ? "OWNER" : "MEMBER";
    return { id: doc.id, ...data, role: normalizedRole } as Member;
  });
}

export async function getUserById(userId: string): Promise<Member | null> {
  const ref = doc(db, USERS_COLLECTION, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const normalizedRole = data.role?.toUpperCase() === "OWNER" ? "OWNER" : "MEMBER";
  return { id: snap.id, ...data, role: normalizedRole } as Member;
}

export async function createInvite(
  orgId: string,
  email: string,
  invitedBy: string
): Promise<MemberInvite> {
  const token = nanoid(32);
  const now = new Date();
  const expires = new Date();
  expires.setDate(now.getDate() + 7);

  const invite: Omit<MemberInvite, "id"> = {
    orgId,
    email: email.toLowerCase().trim(),
    invitedBy,
    role: "MEMBER",
    status: "pending",
    token,
    createdAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expires),
  };
  const ref = await addDoc(collection(db, INVITES_COLLECTION), invite);
  return { id: ref.id, ...invite };
}

export async function getInviteByToken(token: string): Promise<MemberInvite | null> {
  const q = query(
    collection(db, INVITES_COLLECTION),
    where("token", "==", token)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as MemberInvite;
}


