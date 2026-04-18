/* eslint-disable no-undef */
// Firebase messaging service worker for background push notifications.
// This file MUST be at the root of the public directory.

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
);

// Firebase config is injected at build time via env vars.
// For the service worker, we read from query params passed during registration,
// or use a minimal fallback.
firebase.initializeApp({
  apiKey: "placeholder",
  projectId: "placeholder",
  messagingSenderId: "placeholder",
  appId: "placeholder",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};

  self.registration.showNotification(title || "ICE Alarm España", {
    body: body || "You have a new notification",
    icon: "/icon-512.png",
    badge: "/favicon.ico",
    tag: payload.data?.type || "general",
    data: payload.data,
  });
});

// Handle notification click — open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if available
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        // Otherwise open new window
        return clients.openWindow(url);
      })
  );
});
