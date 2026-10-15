"use client";

/* ------------------------------------------------------------------ */
/*  The service worker                                                 */
/*                                                                     */
/*  One worker, two jobs. It receives push while OrbitOS is closed     */
/*  (`lib/notifications/push`), and it is the only way a phone will    */
/*  draw a notification at all: Android Chrome refuses the plain       */
/*  `new Notification()` constructor outright and insists on           */
/*  `registration.showNotification` instead (`lib/notifications/       */
/*  desktop`). Kept apart from both so the desktop path can reach it   */
/*  without pulling the Firebase messaging SDK into every page.        */
/* ------------------------------------------------------------------ */

/** Where the worker is served from. Must be at the origin root. */
const WORKER_PATH = "/firebase-messaging-sw.js";

/**
 * Registers the worker, handing it the config on the query string.
 *
 * The worker cannot read `process.env` — it is served raw from
 * `public/` — and the same values are already in the client bundle, so
 * passing them here duplicates nothing that was private. The path stays
 * distinct per config, which means a project id changing between
 * environments registers a new worker rather than reusing one pointed
 * at the old project.
 */
export async function registerNotificationWorker(): Promise<ServiceWorkerRegistration> {
  const config = new URLSearchParams({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  });

  await navigator.serviceWorker.register(`${WORKER_PATH}?${config.toString()}`, { scope: "/" });

  /* getToken against a worker that is still installing fails with an
     opaque error, and so does showNotification — wait until it is
     usable. */
  return navigator.serviceWorker.ready;
}

/** The worker already in charge of this origin, registering it if there is none. */
export async function notificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    return existing ?? (await registerNotificationWorker());
  } catch {
    return null;
  }
}

/**
 * Clears cards that are no longer news — a thread's, once it is open on
 * screen. Never registers a worker to do it: no worker means no cards.
 */
export async function withdrawNotifications(tag: string): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const open = (await registration?.getNotifications({ tag })) ?? [];
    open.forEach((card) => card.close());
  } catch {
    /* A card left behind is untidy, not wrong. */
  }
}
