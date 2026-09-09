/**
 * Firebase Cloud Messaging on the client — the browser half of staff push.
 *
 * WHAT THIS HAD TO FIX. `requestPushPermission()` asked for permission and fetched a token, but
 * `getToken` was called without a `serviceWorkerRegistration`, so the SDK registered
 * `/firebase-messaging-sw.js` itself — with no query string, and therefore with the placeholder
 * config that file used to carry. Registration is the only channel a static service worker has
 * for its config, so this registers it explicitly, with the config attached, and hands the
 * registration to `getToken`.
 *
 * The SDK is imported dynamically: firebase/app + firebase/messaging is a large dependency and
 * most of this app's users are members who will never enable staff push.
 */

export interface FirebasePushConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

/** The six VITE_FIREBASE_* variables, and which of them are missing. */
export function readPushEnv(env: Record<string, string | undefined>): {
  config: FirebasePushConfig | null;
  missing: string[];
} {
  const names = {
    apiKey: "VITE_FIREBASE_API_KEY",
    authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
    projectId: "VITE_FIREBASE_PROJECT_ID",
    messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
    appId: "VITE_FIREBASE_APP_ID",
    vapidKey: "VITE_FIREBASE_VAPID_KEY",
  } as const;

  const missing: string[] = [];
  const config = {} as FirebasePushConfig;
  for (const [key, name] of Object.entries(names) as Array<[keyof FirebasePushConfig, string]>) {
    const value = env[name]?.trim() ?? "";
    if (!value) missing.push(name);
    config[key] = value;
  }

  // ALL SIX OR NONE, and the missing ones are named. A partial config throws inside the SDK
  // with a message that names nothing, which is indistinguishable from "push is broken" — and
  // the VAPID key is the one people forget, because it lives on a different Firebase settings
  // page from the other five.
  return missing.length === 0 ? { config, missing } : { config: null, missing };
}

export function pushEnv(): { config: FirebasePushConfig | null; missing: string[] } {
  return readPushEnv(import.meta.env as unknown as Record<string, string | undefined>);
}

/** The service-worker URL with the config attached — the worker's only way to receive it. */
export function serviceWorkerUrl(config: FirebasePushConfig): string {
  const params = new URLSearchParams({
    apiKey: config.apiKey,
    projectId: config.projectId,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  });
  // The VAPID key and authDomain are deliberately NOT passed: the worker does not use them, and
  // a query string is visible in DevTools and in the SW list. (None of the five is a secret —
  // they ship in the client bundle by design — but there is no reason to widen that.)
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

/**
 * `web`, `ios` or `android` — the three `staff_push_tokens.platform` values.
 *
 * A phone that is not the installed PWA is still `ios`/`android`: the platform is a fact about
 * the device, and the "you must install the app first" advice is a separate question answered by
 * `iosNeedsInstall`.
 */
export function platformOf(userAgent: string, standalone?: boolean): "web" | "ios" | "android" {
  if (/android/i.test(userAgent)) return "android";
  // iPadOS 13+ reports itself as Macintosh; the touch-capable Mac is the giveaway, and a
  // standalone display mode on a Mac-shaped UA means an installed iPad PWA.
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/macintosh/i.test(userAgent) && standalone) return "ios";
  return "web";
}

/** "Chrome on Android", "Safari on iOS" — what somebody recognises as "my phone" in a list. */
export function describeDevice(userAgent: string, standalone: boolean): string {
  const platform = platformOf(userAgent, standalone);
  const browser = /edg\//i.test(userAgent)
    ? "Edge"
    : /chrome|crios/i.test(userAgent)
      ? "Chrome"
      : /firefox|fxios/i.test(userAgent)
        ? "Firefox"
        : /safari/i.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = platform === "ios" ? "iOS" : platform === "android" ? "Android" : "desktop";
  return `${browser} on ${os}${standalone && platform !== "web" ? " (installed)" : ""}`;
}

/**
 * Safari on iOS grants the Notification permission ONLY to an installed web app (Add to Home
 * Screen), since 16.4. In a normal Safari tab `Notification.requestPermission` either does not
 * exist or resolves `denied`, with no explanation offered to the user — so the UI has to say it
 * before they tap.
 */
export function iosNeedsInstall(userAgent: string, standalone: boolean): boolean {
  return platformOf(userAgent, standalone) === "ios" && !standalone;
}

let messagingInstance: import("firebase/messaging").Messaging | null = null;

async function messagingFor(config: FirebasePushConfig) {
  if (messagingInstance) return messagingInstance;
  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging } = await import("firebase/messaging");
  const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: "unsupported" | "not_configured" | "denied" | "ios_needs_install" | "error"; detail?: string };

/**
 * Ask for permission (once) and return an FCM registration token for THIS device.
 *
 * Every failure is a named reason rather than null, because the card that calls this has to tell
 * somebody what to do next, and "couldn't enable notifications" is the message that produces a
 * support call.
 */
export async function registerForPush(): Promise<PushRegistration> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) {
    return { ok: false, reason: "unsupported" };
  }

  const { config } = pushEnv();
  if (!config) return { ok: false, reason: "not_configured" };

  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  if (iosNeedsInstall(navigator.userAgent, standalone)) {
    return { ok: false, reason: "ios_needs_install" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    // Explicit registration, with the config in the URL. Without this the SDK registers the
    // worker itself and the worker comes up unconfigured.
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl(config), {
      scope: "/",
    });

    const messaging = await messagingFor(config);
    const { getToken } = await import("firebase/messaging");
    const token = await getToken(messaging, {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) return { ok: false, reason: "error", detail: "FCM returned no token" };
    return { ok: true, token };
  } catch (error) {
    return { ok: false, reason: "error", detail: error instanceof Error ? error.message : "unknown" };
  }
}

/** Revoke this device's token at Firebase, so it stops being a live target. */
export async function unregisterForPush(): Promise<boolean> {
  const { config } = pushEnv();
  if (!config || typeof window === "undefined") return false;
  try {
    const messaging = await messagingFor(config);
    const { deleteToken } = await import("firebase/messaging");
    return await deleteToken(messaging);
  } catch {
    return false;
  }
}

/** Foreground messages: the app is open, so there is no OS notification. Returns an unsubscribe. */
export async function onForegroundMessage(
  callback: (payload: { title: string; body: string; link?: string }) => void,
): Promise<(() => void) | null> {
  const { config } = pushEnv();
  if (!config || typeof window === "undefined") return null;
  try {
    const messaging = await messagingFor(config);
    const { onMessage } = await import("firebase/messaging");
    return onMessage(messaging, (payload) => {
      callback({
        title: payload.notification?.title || "ICE Alarm España",
        body: payload.notification?.body || "",
        // `data.link` is the in-app path — the reason the server sends the link twice.
        link: payload.data?.link,
      });
    });
  } catch {
    return null;
  }
}
