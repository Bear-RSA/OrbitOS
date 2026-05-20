import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

let _app: App | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

function getAdminApp(): App {
  if (_app) return _app;

  if (getApps().length > 0) {
    _app = getApps()[0];
    return _app;
  }

  _app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  }, "admin");

  return _app;
}

export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    if (!_db) {
      _db = getFirestore(getAdminApp());
    }
    const value = (_db as any)[prop];
    if (typeof value === "function") {
      return value.bind(_db);
    }
    return value;
  },
});

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    if (!_db) {
      // ensure app is initialized
      getAdminApp();
    }
    if (!_auth) {
      _auth = getAuth(getAdminApp());
    }
    const value = (_auth as any)[prop];
    if (typeof value === "function") {
      return value.bind(_auth);
    }
    return value;
  },
});
