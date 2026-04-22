import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ActivityEvent } from "@/types/activity";

/**
 * Realtime subscription to activity events for a specific project.
 * Limited to the most recent 50 events to keep the feed performant.
 */
export function subscribeToActivity(
  projectId: string, // Diagnostics
  orgId: string,     // Diagnostics
  callback: (events: ActivityEvent[], error?: any) => void,
  maxEvents = 50
) {
  // TOTAL OPEN SIGNAL - NO FILTERS
  const q = query(
    collection(db, "activity"),
    orderBy("timestamp", "desc"),
    limit(maxEvents)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const events = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ActivityEvent[];
      
      // Sort in memory by timestamp desc
      events.sort((a, b) => {
        const getT = (ts: any) => {
          if (!ts) return Date.now();
          if (typeof ts.toMillis === 'function') return ts.toMillis();
          if (typeof ts.toDate === 'function') return ts.toDate().getTime();
          if (ts.seconds) return ts.seconds * 1000;
          return new Date(ts).getTime() || 0;
        };
        return getT(b.timestamp) - getT(a.timestamp);
      });

      callback(events.slice(0, maxEvents), null);
    },
    (error) => {
      console.error("[Activity subscription error]:", error);
      callback([], error);
    }
  );
}

/**
 * Realtime subscription to org-wide activity events.
 */
export function subscribeToOrgActivity(
  orgId: string,
  callback: (events: ActivityEvent[]) => void,
  maxEvents = 100
) {
  const q = query(
    collection(db, "activity"),
    where("orgId", "==", orgId),
    orderBy("timestamp", "desc"),
    limit(maxEvents)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const events = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ActivityEvent[];
      
      // Sort in memory by timestamp desc
      events.sort((a, b) => {
        const getT = (ts: any) => {
          if (!ts) return Date.now();
          if (typeof ts.toMillis === 'function') return ts.toMillis();
          if (typeof ts.toDate === 'function') return ts.toDate().getTime();
          if (ts.seconds) return ts.seconds * 1000;
          return new Date(ts).getTime() || 0;
        };
        return getT(b.timestamp) - getT(a.timestamp);
      });

      callback(events.slice(0, maxEvents));
    },
    (error) => {
      console.error("[Org activity subscription error]:", error);
      callback([]);
    }
  );
}
