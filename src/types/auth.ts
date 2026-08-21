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
  /**
   * End-of-day debriefs delivered to this person, ever. Metered against the
   * tier's `lifetimeDebriefs` so the free tier's trial runs out once rather
   * than daily.
   *
   * Written only by the debrief cron on the Admin SDK, and deliberately
   * absent from `isProfileEdit` in firestore.rules — a counter the client
   * could write is a counter the client can reset.
   */
  debriefsSent?: number;
  createdAt: Timestamp;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
}
