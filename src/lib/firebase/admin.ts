import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import { getMessaging, Messaging } from "firebase-admin/messaging";

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

/**
 * Cloud Messaging, for ringing a device whose browser is closed.
 *
 * Same lazy proxy as the two above, and for the same reason: the admin
 * app is only built when something actually reaches for it, so a route
 * that never sends a push never pays for the credential parse. See
 * `lib/notifications/push-sender` for the only thing that uses it.
 */
export const adminMessaging: Messaging = new Proxy({} as Messaging, {
  get(_target, prop) {
    const messaging = getMessaging(getAdminApp());
    const value = (messaging as any)[prop];
    if (typeof value === "function") {
      return value.bind(messaging);
    }
    return value;
  },
});
