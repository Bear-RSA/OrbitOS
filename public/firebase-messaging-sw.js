/* ------------------------------------------------------------------ */
/*  Firebase messaging service worker                                  */
/*                                                                     */
/*  The one piece of OrbitOS that runs when OrbitOS is not open. It    */
/*  exists so a call can ring a device whose tab is closed, which the  */
/*  Notification API alone cannot do — that one needs a page, and a    */
/*  closed browser has no page.                                        */
/*                                                                     */
/*  PLAIN JS ON PURPOSE. This file is served from `public/` exactly as */
/*  written: it is never bundled, never transpiled, and cannot import  */
/*  anything from `src/`. So the SDK arrives by `importScripts` from   */
/*  Google's CDN, pinned to a version, and the config arrives on the   */
/*  query string — a service worker has no `process.env` to read, and  */
/*  templating one at build time would mean a build step for a file    */
/*  whose whole virtue is that it has none.                            */
/*                                                                     */
/*  None of the values passed this way are secret. They are the same   */
/*  `NEXT_PUBLIC_FIREBASE_*` keys already shipped in the client        */
/*  bundle; what protects the data is `firestore.rules`, not the       */
/*  obscurity of a project id.                                         */
/* ------------------------------------------------------------------ */

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

/* Written by `registerPushWorker`, which puts the same config the page
   booted with onto the registration URL. */
var params = new URLSearchParams(self.location.search);

firebase.initializeApp({
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});

var messaging = firebase.messaging();

/**
 * A push that arrived while no tab is in the foreground.
 *
 * The server sends DATA ONLY — no `notification` block — and that is
 * deliberate. A payload carrying `notification` is displayed by the
 * browser itself before this handler runs, which would show a second
 * card on top of the one the page already painted for anyone who does
 * have OrbitOS open. Sending data and drawing it here means exactly one
 * notification per call, wherever the call was received.
 */
messaging.onBackgroundMessage(function (payload) {
  var data = payload.data || {};

  self.registration.showNotification(data.title || "Incoming call", {
    body: data.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    /* One card per call, replaced rather than stacked if anything about
       it is sent twice. */
    tag: data.tag || "orbit-call",
    requireInteraction: true,
    data: { url: data.url || "/dashboard" },
  });
});

/**
 * Taking the call.
 *
 * Focus a window that already has OrbitOS open rather than opening a
 * second one — the ring card is live in that tab, and a fresh window
 * would load the app from scratch while the phone is still ringing.
 */
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  var target = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (windows) {
        for (var i = 0; i < windows.length; i++) {
          if (windows[i].url.indexOf(self.location.origin) === 0 && "focus" in windows[i]) {
            return windows[i].focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});
