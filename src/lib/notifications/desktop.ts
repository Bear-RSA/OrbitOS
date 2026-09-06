/* ------------------------------------------------------------------ */
/*  Desktop notifications                                              */
/*                                                                     */
/*  The gap between a ring card and a phone that is actually answered. */
/*  A colleague with OrbitOS open in a background tab already receives */
/*  the call — the listener in `IncomingCall` never stopped running —   */
/*  but nothing about that reaches them, because the card is painted   */
/*  on a tab they are not looking at and the sound may be muted.       */
/*                                                                     */
/*  This is the Notification API and nothing else: no service worker,  */
/*  no server, no permission asked at page load. It works while a tab  */
/*  is open, which is precisely the case it exists for. Ringing a      */
/*  browser that is CLOSED is a different mechanism with a different   */
/*  cost — see `lib/notifications/push`.                               */
/*                                                                     */
/*  Everything here is defensive about the API being absent. A         */
/*  notification is a courtesy on top of a call that is already        */
/*  arriving, so no failure in this file may ever stop a phone from    */
/*  ringing.                                                           */
/* ------------------------------------------------------------------ */

export type NotificationAccess = "granted" | "denied" | "default" | "unsupported";

/**
 * Whether this browser has the API at all.
 *
 * Not the same question as whether permission was given. A page served
 * over plain http, an older browser, and a server render all land here
 * — and all three must read as "unsupported" rather than throwing.
 */
export function desktopNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** What the browser currently allows, without asking for anything. */
export function notificationAccess(): NotificationAccess {
  if (!desktopNotificationsSupported()) return "unsupported";
  return Notification.permission as NotificationAccess;
}

/**
 * Asks for permission. MUST be called from a real click.
 *
 * Browsers refuse — and some permanently penalise the origin — when a
 * page asks for this on load. So nothing in the app requests it
 * implicitly; the settings screen has a button, and that button is the
 * gesture. Asking again once denied is pointless by design: the browser
 * resolves immediately with the same answer, and only the user can undo
 * it from the address bar.
 */
export async function requestDesktopNotifications(): Promise<NotificationAccess> {
  if (!desktopNotificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") {
    return Notification.permission as NotificationAccess;
  }

  try {
    return (await Notification.requestPermission()) as NotificationAccess;
  } catch {
    /* Older Safari hands back a callback rather than a promise, and a
       browser that refuses outright is not a reason to break a call. */
    return notificationAccess();
  }
}

export interface NotificationDecision {
  access: NotificationAccess;
  /** The user's own preference. */
  enabled: boolean;
  /** True when OrbitOS is the tab being looked at. */
  visible: boolean;
}

/**
 * Whether to raise one.
 *
 * Pure, and split out for the reason every decision in `lib/calls` is:
 * the condition worth getting right is the LAST one. A notification
 * fired while somebody is watching the tab duplicates a card already
 * on their screen, which is how a person learns to dismiss these
 * without reading them — and the next one they dismiss is the call
 * they wanted.
 */
export function shouldNotify(facts: NotificationDecision): boolean {
  if (facts.access !== "granted") return false;
  if (!facts.enabled) return false;
  return !facts.visible;
}

export interface DesktopNotice {
  title: string;
  body: string;
  /**
   * Collapse key. Two notifications sharing a tag replace one another
   * rather than stacking, so a call that re-renders — a snapshot
   * landing, a name resolving — stays one notification.
   */
  tag: string;
  onClick?: () => void;
}

/**
 * Raises one and hands back the way to withdraw it.
 *
 * The closer is the whole reason this returns anything. A ring lasts
 * forty-five seconds and a desktop notification does not expire on its
 * own, so without this a declined call would leave a card offering to
 * take you to a conversation that ended — the same failure the ringtone
 * effect avoids by owning its own cleanup.
 */
export function showDesktopNotification(notice: DesktopNotice): () => void {
  if (!desktopNotificationsSupported() || Notification.permission !== "granted") {
    return () => {};
  }

  let notification: Notification;
  try {
    notification = new Notification(notice.title, {
      body: notice.body,
      tag: notice.tag,
      icon: "/logo.png",
      /* Survives until it is acted on or withdrawn. A call is the one
         thing in this product worth holding the screen for. */
      requireInteraction: true,
    });
  } catch {
    /* Some browsers throw here when the API exists but is only usable
       through a service worker registration. Nothing to do but let the
       in-app card carry the call on its own. */
    return () => {};
  }

  notification.onclick = () => {
    /* Bring the tab forward first. Clicking a notification about a call
       means "take me to it", and the card is already rendered — so the
       work is focusing the window, not routing anywhere. */
    window.focus();
    notice.onClick?.();
    notification.close();
  };

  return () => notification.close();
}
