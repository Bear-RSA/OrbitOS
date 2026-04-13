import { Timestamp } from "firebase/firestore";

export interface User {
  id: string;
  email: string;
  name: string;
  orgId: string;
  role: "owner" | "member";
  photoURL?: string | null;
  photoPublicId?: string | null;
  createdAt: Timestamp;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
}
