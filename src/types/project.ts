import { Timestamp } from "firebase/firestore";

export interface Project {
  id: string;
  orgId: string;
  name: string;
  ownerId: string;
  createdBy?: string;
  createdAt: Timestamp;
  priority?: number;
  description?: string;
  /* Archiving is a soft hide, not a delete: the document and its tasks stay
     intact, but the project drops out of the workspace listings until an
     owner restores it. Legacy projects predate the flag, so treat a missing
     `archived` as false everywhere rather than querying on it. */
  archived?: boolean;
  archivedAt?: Timestamp;
  archivedBy?: string;
}
