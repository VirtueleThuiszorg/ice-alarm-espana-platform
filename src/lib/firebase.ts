/**
 * Firebase Cloud Messaging (FCM) setup for push notifications.
 *
 * The actual Firebase SDK is loaded dynamically to avoid bloating the main
 * bundle for users who haven't opted in to notifications.
 */

let messagingInstance: any = null;

async function getFirebaseConfig() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  if (!config.apiKey || !config.projectId) {
    console.warn("[FCM] Firebase config missing — push notifications disabled");
    return null;
  }

  return config;
}

/**
 * Request notification permission and get an FCM token.
 * Returns the token string or null if unavailable/denied.
 */
export async function requestPushPermission(): Promise<string | null> {
  try {
    // Check browser support
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      console.warn("[FCM] Browser does not support push notifications");
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.info("[FCM] Notification permission denied");
      return null;
    }

    const config = await getFirebaseConfig();
    if (!config) return null;

    // Dynamically import Firebase to keep bundle small
    const { initializeApp, getApps } = await import("firebase/app");
    const { getMessaging, getToken } = await import("firebase/messaging");

    const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
    messagingInstance = getMessaging(app);

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    const token = await getToken(messagingInstance, { vapidKey });

    return token;
  } catch (error) {
    console.error("[FCM] Failed to get push token:", error);
    return null;
  }
}

/**
 * Listen for foreground messages. Returns an unsubscribe function.
 */
export async function onForegroundMessage(
  callback: (payload: { title: string; body: string; data?: Record<string, string> }) => void
): Promise<(() => void) | null> {
  try {
    if (!messagingInstance) {
      const config = await getFirebaseConfig();
      if (!config) return null;

      const { initializeApp, getApps } = await import("firebase/app");
      const { getMessaging } = await import("firebase/messaging");

      const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
      messagingInstance = getMessaging(app);
    }

    const { onMessage } = await import("firebase/messaging");

    const unsubscribe = onMessage(messagingInstance, (payload) => {
      callback({
        title: payload.notification?.title || "ICE Alarm",
        body: payload.notification?.body || "",
        data: payload.data,
      });
    });

    return unsubscribe;
  } catch (error) {
    console.error("[FCM] Failed to set up foreground listener:", error);
    return null;
  }
}
