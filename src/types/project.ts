import { Timestamp } from "firebase/firestore";

export interface Project {
  id: string;
  orgId: string;
  name: string;
  ownerId: string;
  createdAt: Timestamp;
}
