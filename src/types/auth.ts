import { Timestamp } from "firebase/firestore";
import { UserPreferences } from "./preferences";

export interface User {
  id: string;
  email: string;
  name: string;
  orgId: string;
  role: "OWNER" | "MEMBER";
  photoURL?: string | null;
  photoPublicId?: string | null;
  /** Partial on purpose — read it through `resolvePreferences`. */
  preferences?: Partial<UserPreferences>;
  createdAt: Timestamp;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
}
