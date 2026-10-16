import { Timestamp } from "firebase/firestore";
import type { StoredRole } from "@/lib/members/rank";

export interface Member {
  id: string;
  email: string;
  name: string;
  orgId: string;
  role: StoredRole;
  roleDescriptor?: string;
  /** See `types/department`. Absent or null means unassigned. */
  departmentId?: string | null;
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
  /** "revoked": withdrawn from Admin Tools before anyone used it. */
  status: "pending" | "accepted" | "expired" | "revoked";
  token: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  acceptedBy?: string;
  acceptedAt?: Timestamp;
  revokedBy?: string;
  revokedAt?: Timestamp;
}
