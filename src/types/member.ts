import { Timestamp } from "firebase/firestore";

export interface Member {
  id: string;
  email: string;
  name: string;
  orgId: string;
  role: "OWNER" | "MEMBER";
  operationalStatus?: "available" | "focused" | "offline";
  lastActivity?: Timestamp;
  photoURL?: string | null;
  photoPublicId?: string | null;
  createdAt: Timestamp;
}

export interface MemberInvite {
  id: string;
  orgId: string;
  email: string;
  invitedBy: string;
  role: "MEMBER";
  status: "pending" | "accepted" | "expired";
  token: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  acceptedBy?: string;
  acceptedAt?: Timestamp;
}
