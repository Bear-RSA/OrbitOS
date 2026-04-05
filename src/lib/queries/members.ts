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
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Member, MemberInvite } from "@/types/member";
import { nanoid } from "../utils/nanoid";

const USERS_COLLECTION = "users";
const INVITES_COLLECTION = "memberInvites";

export async function getMembersByOrg(orgId: string): Promise<Member[]> {
  const q = query(
    collection(db, USERS_COLLECTION),
    where("orgId", "==", orgId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Member));
}

export async function getUserById(userId: string): Promise<Member | null> {
  const ref = doc(db, USERS_COLLECTION, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Member;
}

export async function createInvite(
  orgId: string,
  email: string,
  invitedBy: string
): Promise<MemberInvite> {
  const token = nanoid(32);
  const invite: Omit<MemberInvite, "id"> = {
    orgId,
    email,
    invitedBy,
    role: "member",
    status: "pending",
    token,
    createdAt: Timestamp.now(),
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

export async function acceptInvite(inviteId: string): Promise<void> {
  await updateDoc(doc(db, INVITES_COLLECTION, inviteId), {
    status: "accepted",
  });
}
