import { initializeApp, getApps } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "dummy",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "dummy",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "dummy",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "dummy",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "dummy",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "dummy",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

/**
 * Auth without the popup/redirect resolver.
 *
 * `getAuth` wires one in, and on start-up it loads a hidden iframe from
 * the project's firebaseapp.com domain before reporting who is signed
 * in. On an iPhone running OrbitOS from the Home Screen that cross-site
 * frame can stall, and every screen waits on the answer — the login
 * page sits on its loader indefinitely. OrbitOS signs in with email and
 * password only, so the resolver bought nothing.
 *
 * `initializeAuth` throws if called twice (hot reload, a second import
 * path), so a repeat falls back to the instance that already exists.
 */
function createAuth(): Auth {
  if (typeof window === "undefined") return getAuth(app);
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
  } catch {
    return getAuth(app);
  }
}

/**
 * Firestore with its cache in IndexedDB rather than memory.
 *
 * A message written while the connection is down sits in the cache's
 * queue until the server takes it. In memory, a refresh threw that
 * queue away and the message with it — typed, shown, and never sent.
 * On disk it outlives the tab and goes out when the connection is back.
 * Multi-tab, because OrbitOS is often open in more than one.
 *
 * Same double-call guard as `createAuth`: a second `initializeFirestore`
 * throws, and the instance that already exists is the right answer.
 */
function createDb(): Firestore {
  if (typeof window === "undefined") return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
}

export const auth = createAuth();
export const db = createDb();
export default app;
