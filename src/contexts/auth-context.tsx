"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { User as FirebaseUser } from "firebase/auth";
import { doc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { onAuthChange } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/client";
import { User } from "@/types/auth";

interface AuthContextValue {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  firebaseUser: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const profileUnsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthChange((fbUser) => {
      // Clean up any existing profile subscription
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }

      setFirebaseUser(fbUser);

      if (fbUser) {
        // Reset loading while we fetch the Firestore profile
        setLoading(true);
        // Subscribe to live profile updates
        const unsubProfile = onSnapshot(
          doc(db, "users", fbUser.uid),
          (snap) => {
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
            setUser(null);
            setLoading(false);
          }
        );
        profileUnsubRef.current = unsubProfile;
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

