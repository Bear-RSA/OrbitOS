import { Timestamp } from "firebase/firestore";
import { UserPreferences } from "./preferences";
import type { StoredRole } from "@/lib/members/rank";

export interface User {
  id: string;
  email: string;
  name: string;
  orgId: string;
  role: StoredRole;
  photoURL?: string | null;
  photoPublicId?: string | null;
  /** See `Member.bannerURL`. */
  bannerURL?: string | null;
  bannerPublicId?: string | null;
  /** Partial on purpose — read it through `resolvePreferences`. */
  preferences?: Partial<UserPreferences>;
  createdAt: Timestamp;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
}
