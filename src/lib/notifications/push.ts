"use client";

import { getMessaging, getToken, deleteToken, isSupported } from "firebase/messaging";
import app from "@/lib/firebase/client";
import { registerNotificationWorker } from "@/lib/notifications/worker";

/* ------------------------------------------------------------------ */
/*  Web push                                                           */
/*                                                                     */
/*  Ringing a device whose browser is closed. Everything else in the   */
/*  notification stack needs a live page: the ring card needs one, the */
/*  sound needs one, and `lib/notifications/desktop` needs one. This   */
/*  is the only path that does not, which is also why it is the only   */
/*  one that costs a service worker, a browser permission and a token  */
/*  stored on the server.                                              */
/*                                                                     */
/*  Off by default and enabled from a button, for the same reason the  */
/*  desktop permission is: asking on load is how an origin gets its    */
/*  request permanently denied by a browser that has learned to        */
/*  distrust it.                                                       */
/*                                                                     */
/*  A TOKEN IS PER DEVICE, not per person. Somebody signed in on a     */
/*  laptop and a phone has two, both of which should ring, so the      */
/*  server stores a set and fans out — see `lib/notifications/push-    */
/*  sender`. It is also a bearer credential for interrupting somebody, */
/*  so it is written through a server action and never readable by a   */
/*  client.                                                            */
/* ------------------------------------------------------------------ */

/**
 * The public half of the VAPID key pair, from the Firebase console
 * (Project settings → Cloud Messaging → Web Push certificates).
 *
 * Public by design — it is what lets a push service verify that a
 * message claiming to come from this app really did. The private half
 * never leaves Google.
 */
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";

export type PushOutcome =
  | { ok: true; token: string }
  | { ok: false; reason: "unsupported" | "denied" | "unconfigured" | "failed"; message: string };

/**
 * Whether this browser can do it at all.
 *
 * Four separate capabilities, and they genuinely come apart: iOS Safari
 * has service workers but only grants push to a site installed to the
 * home screen, and Firefox's private windows have the API present and
 * registration disabled. `isSupported` from the SDK is the check that
 * knows about those, so it is the one that decides.
 */
export async function pushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/** True when the deploy has a VAPID key to sign with. */
export function pushConfigured(): boolean {
  return VAPID_KEY.length > 0;
}

/**
 * Turns push on for THIS device and returns the token to register.
 *
 * Must be called from a click: it asks for the notification permission,
 * and browsers only honour that request during a gesture.
 *
 * The token is returned rather than saved here. Writing it is a server
 * action's job — the token says "interrupt this person on this device",
 * and which person it belongs to must be read from the session cookie
 * rather than sent alongside it by a browser.
 */
export async function enablePush(): Promise<PushOutcome> {
  if (!(await pushSupported())) {
    return {
      ok: false,
      reason: "unsupported",
      message: "This browser cannot receive notifications while it is closed.",
    };
  }

  if (!pushConfigured()) {
    return {
      ok: false,
      reason: "unconfigured",
      message: "Push is not configured on this deployment.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason: "denied",
      message:
        "Your browser is blocking notifications for OrbitOS. Allow them from the icon in the address bar, then try again.",
    };
  }

  try {
    const registration = await registerNotificationWorker();
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return {
        ok: false,
        reason: "failed",
        message: "Could not register this device. Try again.",
      };
    }

    return { ok: true, token };
  } catch (err) {
    console.error("[Push] Could not enable:", err);
    return {
      ok: false,
      reason: "failed",
      message: "Could not register this device for notifications.",
    };
  }
}

/**
 * Turns it off for this device, and hands back the token to forget.
 *
 * Both halves matter and neither is enough alone. Deleting the token at
 * the browser stops it receiving; deleting the row stops the server
 * sending to a token that no longer works, which is otherwise a failed
 * send on every single call for the life of the workspace.
 */
export async function disablePush(): Promise<string | null> {
  if (!(await pushSupported()) || !pushConfigured()) return null;

  try {
    const messaging = getMessaging(app);
    /* Read the current token BEFORE deleting it — afterwards there is
       nothing left to tell the server to forget. */
    const registration = await navigator.serviceWorker.getRegistration("/");
    const token = registration
      ? await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration,
        }).catch(() => null)
      : null;

    await deleteToken(messaging).catch(() => false);
    return token;
  } catch (err) {
    console.error("[Push] Could not disable:", err);
    return null;
  }
}
