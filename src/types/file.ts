import { Timestamp } from "firebase/firestore";

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  url: string;
  publicId: string;
  size: number;
  type: string;
  uploadedBy: string;
  createdAt: Timestamp;
}
