import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

export function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  
  return initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  }, "admin");
}

export const adminDb = new Proxy({}, {
  get: (target, prop) => getFirestore(getAdminApp())[prop as keyof ReturnType<typeof getFirestore>],
}) as ReturnType<typeof getFirestore>;

export const adminAuth = new Proxy({}, {
  get: (target, prop) => getAuth(getAdminApp())[prop as keyof ReturnType<typeof getAuth>],
}) as ReturnType<typeof getAuth>;
