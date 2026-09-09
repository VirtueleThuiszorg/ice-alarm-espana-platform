/*
  Firebase Cloud Messaging service worker — background push for staff phones.

  MUST live at the root of the site (a service worker's scope cannot exceed its own path), and
  MUST be a plain script: a service worker cannot import from the app bundle, so the two
  decisions it makes are declared here as named functions and exercised directly by
  src/test/pushServiceWorker.test.ts, which evaluates this file with stubbed globals.

  WHAT WAS WRONG WITH THE VERSION THIS REPLACES, all three fatal:

    1. `firebase.initializeApp({ apiKey: "placeholder", projectId: "placeholder", … })` — a
       comment promised the config was "injected at build time via env vars"; nothing injected
       anything. A service worker is a static file served as-is, so nothing ever could.
       Registration is what carries the config now, as query parameters, because that is the
       only channel a static worker has.
    2. It called `showNotification` from `onBackgroundMessage` for EVERY message. Our server
       sends a `notification` block (see _shared/fcm.ts), which the SDK displays itself — so
       one event produced two cards on the lock screen.
    3. Its click handler read `event.notification.data.url`. The server sends `data.link`.
       `undefined || "/"` meant every notification opened the dashboard: "tapping it does
       nothing" for the alert somebody was tapping.
*/

/**
 * Is this message OURS to display?
 *
 * NO if it carries a `notification` payload: the FCM SDK renders those itself. Whether it also
 * invokes `onBackgroundMessage` for them has changed between SDK versions and is documented
 * both ways, so this does not depend on the answer — it is correct either way, where "show it
 * unconditionally" is wrong in one of the two worlds and duplicates every notification.
 */
function shouldShowLocally(payload) {
  return !(payload && payload.notification);
}

/**
 * Where a tap goes.
 *
 * `data.link` is what the server sends (an in-app path — see fcmMessage). `FCM_MSG` is the
 * envelope the SDK stores on notifications IT displayed; reading the link out of it means a tap
 * still lands somewhere sensible if this handler ever runs for one of those.
 */
function linkFor(data) {
  if (!data) return "/";
  if (typeof data.link === "string" && data.link) return data.link;
  const envelope = data.FCM_MSG;
  const fromEnvelope =
    envelope &&
    ((envelope.data && envelope.data.link) ||
      (envelope.notification && envelope.notification.click_action) ||
      (envelope.fcmOptions && envelope.fcmOptions.link));
  return typeof fromEnvelope === "string" && fromEnvelope ? fromEnvelope : "/";
}

/**
 * Was this notification put on screen by the SDK rather than by us?
 *
 * The SDK installs its own `notificationclick` listener for those, and two listeners opening a
 * window is two windows. Ours stands down.
 */
function displayedBySdk(notification) {
  return !!(notification && notification.data && notification.data.FCM_MSG);
}

function readConfig(href) {
  const params = new URL(href).searchParams;
  const config = {
    apiKey: params.get("apiKey") || "",
    projectId: params.get("projectId") || "",
    messagingSenderId: params.get("messagingSenderId") || "",
    appId: params.get("appId") || "",
  };
  // Every field or none. A partially-configured app throws inside the SDK with a message that
  // names none of the missing keys, which is how "push silently does not work" happens.
  const complete = Object.values(config).every((v) => v.length > 0);
  return complete ? config : null;
}

self.__push = { shouldShowLocally, linkFor, displayedBySdk, readConfig, configured: false };

const firebaseConfig = readConfig(self.location.href);

if (firebaseConfig) {
  importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  self.__push.configured = true;

  messaging.onBackgroundMessage((payload) => {
    if (!shouldShowLocally(payload)) return;

    const data = payload.data || {};
    self.registration.showNotification(data.title || "ICE Alarm España", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/favicon-32x32.png",
      // One card per event type, replacing the previous one rather than stacking six "device
      // offline" notifications on a lock screen. Matches the server's webpush tag.
      tag: data.type || "general",
      data,
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  if (displayedBySdk(event.notification)) return;

  event.notification.close();
  const link = linkFor(event.notification.data);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin)) {
          // Focus first, then navigate: navigating a background tab and leaving it in the
          // background is indistinguishable from the tap having done nothing.
          return Promise.resolve(client.focus()).then(() =>
            client.navigate ? client.navigate(link) : undefined,
          );
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
