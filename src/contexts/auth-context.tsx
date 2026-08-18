"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { User as FirebaseUser } from "firebase/auth";
import { doc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { onAuthChange, syncSession } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/client";
import { User } from "@/types/auth";

/**
 * Whether the httpOnly `__session` cookie backing this client session has
 * been established.
 *
 * This matters because Firebase auth (IndexedDB, client-side) and the session
 * cookie (server-side, gates every route in middleware) expire independently.
 * When the cookie is missing the client still believes it is signed in, but
 * every navigation to a gated route is bounced to /login — which, seeing an
 * authenticated user, sends it straight back. Silent redirect loop.
 *
 *   "pending" — sync in flight, nothing gated should be trusted yet
 *   "ready"   — cookie established, server-gated navigation will succeed
 *   "error"   — cookie could not be minted; treat as NOT authenticated for
 *               anything server-gated, and surface it rather than looping
 */
export type SessionStatus = "pending" | "ready" | "error";

interface AuthContextValue {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  sessionStatus: SessionStatus;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  firebaseUser: null,
  loading: true,
  sessionStatus: "pending",
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("pending");
  const profileUnsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    let generation = 0;

    const unsubAuth = onAuthChange((fbUser) => {
      // Clean up any existing profile subscription
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }

      const thisGeneration = ++generation;
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Reset loading while we fetch the Firestore profile
        setLoading(true);
        setSessionStatus("pending");

        // Firebase persists auth in IndexedDB, but our httpOnly session
        // cookie expires independently. Re-mint it before doing anything
        // else, otherwise middleware bounces every navigation back to
        // /login while the client still believes it is signed in.
        void (async () => {
          let established = false;

          // One retry — a transient network blip here would otherwise strand
          // the user on a client-only session for the rest of the visit.
          for (let attempt = 0; attempt < 2 && !established; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 600));
            try {
              await syncSession(fbUser);
              established = true;
            } catch (err) {
              console.error(
                `[AuthProvider] Session sync failed (attempt ${attempt + 1}/2):`,
                err
              );
            }
          }

          // A newer auth event superseded this one while we awaited.
          if (thisGeneration !== generation) return;

          // Record the outcome instead of swallowing it. A failure here used
          // to fall through silently, leaving the UI fully "signed in" while
          // every gated navigation bounced.
          setSessionStatus(established ? "ready" : "error");

          subscribeToProfile(fbUser.uid, thisGeneration);
        })();
      } else {
        setUser(null);
        setSessionStatus("pending");
        setLoading(false);
      }
    });

    function subscribeToProfile(uid: string, thisGeneration: number) {
      const unsubProfile = onSnapshot(
        doc(db, "users", uid),
        (snap) => {
          if (thisGeneration !== generation) return;
          if (snap.exists()) {
            const data = snap.data();
            const normalizedRole = data?.role?.toUpperCase() === "OWNER" ? "OWNER" : "MEMBER";
            setUser({ id: snap.id, ...data, role: normalizedRole } as User);
          } else {
            setUser(null);
          }
          setLoading(false);
        },
        (error) => {
          console.error("[AuthProvider] Profile snapshot error:", error);
          if (thisGeneration !== generation) return;
          setUser(null);
          setLoading(false);
        }
      );
      profileUnsubRef.current = unsubProfile;
    }

    return () => {
      // Invalidate any in-flight session sync so it cannot open a profile
      // subscription after this cleanup has already run.
      generation++;
      unsubAuth();
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, sessionStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

