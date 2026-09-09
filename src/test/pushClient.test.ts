// @vitest-environment node
//
// THE BROWSER HALF OF STAFF PUSH, and the two things that made it dead code.
//
// 1. `usePushNotifications` upserted `notification_settings { user_id, push_token, push_enabled }`.
//    That table has NONE of those three columns — it is keyed on `admin_user_id` and holds
//    `whatsapp_*`. The write went through a hand-written `supabase as unknown as` façade whose
//    only effect was to stop TypeScript from saying so, and no component ever called the hook.
//    Zero tokens have ever been stored.
// 2. `getToken` was called with no `serviceWorkerRegistration`, so the SDK registered
//    `/firebase-messaging-sw.js` itself — with no query string, and therefore with the
//    placeholder config that file used to carry.
//
// The decisions worth testing are the ones a phone gets wrong: which platform this is, whether
// iOS can be asked at all, and whether the config is complete. They are pure functions for that
// reason.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  iosNeedsInstall,
  platformOf,
  describeDevice,
  readPushEnv,
  serviceWorkerUrl,
} from "@/lib/firebase";
import { stripComments } from "./helpers/stripComments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const FULL_ENV = {
  VITE_FIREBASE_API_KEY: "AIza-test",
  VITE_FIREBASE_AUTH_DOMAIN: "ice.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "ice-alarm-test",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
  VITE_FIREBASE_APP_ID: "1:1234567890:web:abc",
  VITE_FIREBASE_VAPID_KEY: "BPk-vapid",
};

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
};

describe("the six environment variables", () => {
  it("gives a config only when ALL of them are present", () => {
    expect(readPushEnv(FULL_ENV).config).toEqual({
      apiKey: "AIza-test",
      authDomain: "ice.firebaseapp.com",
      projectId: "ice-alarm-test",
      messagingSenderId: "1234567890",
      appId: "1:1234567890:web:abc",
      vapidKey: "BPk-vapid",
    });
    expect(readPushEnv(FULL_ENV).missing).toEqual([]);
  });

  it("NAMES what is missing, one variable at a time", () => {
    /*
      "Not configured" with no detail is what sends somebody through six Firebase settings
      pages. The VAPID key is the one people miss, because it lives on Cloud Messaging → Web
      Push certificates while the other five are on the general project settings page.
    */
    for (const name of Object.keys(FULL_ENV)) {
      const partial = { ...FULL_ENV, [name]: "" };
      const { config, missing } = readPushEnv(partial);
      expect(config, name).toBeNull();
      expect(missing, name).toEqual([name]);
    }

    expect(readPushEnv({}).missing).toHaveLength(6);
  });

  it("treats whitespace as absent", () => {
    // A pasted value that is a newline is the classic dashboard mistake, and it produces an
    // SDK error naming nothing.
    expect(readPushEnv({ ...FULL_ENV, VITE_FIREBASE_VAPID_KEY: "  \n " }).config).toBeNull();
  });
});

describe("the service-worker URL carries the config", () => {
  const url = serviceWorkerUrl(readPushEnv(FULL_ENV).config!);

  it("passes exactly the four keys the worker initialises with", () => {
    const params = new URL(url, "https://icealarm.es").searchParams;
    expect(params.get("apiKey")).toBe("AIza-test");
    expect(params.get("projectId")).toBe("ice-alarm-test");
    expect(params.get("messagingSenderId")).toBe("1234567890");
    expect(params.get("appId")).toBe("1:1234567890:web:abc");
    expect([...params.keys()].sort()).toEqual(["apiKey", "appId", "messagingSenderId", "projectId"]);
  });

  it("does not put the VAPID key in the URL — the worker has no use for it", () => {
    expect(url).not.toContain("BPk-vapid");
    expect(url).not.toContain("vapidKey");
  });

  it("is the worker at the root, because scope cannot exceed path", () => {
    expect(url.startsWith("/firebase-messaging-sw.js?")).toBe(true);
  });

  it("keeps the same four keys the worker reads", () => {
    // A key renamed on one side and not the other is a silently unconfigured worker: it refuses
    // to initialise and says nothing, because saying something is the client's job.
    const sw = stripComments(read("public/firebase-messaging-sw.js"));
    for (const key of ["apiKey", "projectId", "messagingSenderId", "appId"]) {
      expect(sw, key).toContain(`params.get("${key}")`);
    }
  });
});

describe("which device this is", () => {
  it("reads the three platform values the column allows", () => {
    expect(platformOf(UA.iphoneSafari)).toBe("ios");
    expect(platformOf(UA.androidChrome)).toBe("android");
    expect(platformOf(UA.windowsEdge)).toBe("web");
    expect(platformOf(UA.macChrome)).toBe("web");
  });

  it("treats an installed iPad PWA as ios, not as a Mac", () => {
    // iPadOS 13+ reports itself as Macintosh. A standalone display mode on that UA is an
    // installed iPad web app, and calling it "web" would mislabel every operator's iPad.
    expect(platformOf(UA.macChrome, true)).toBe("ios");
    expect(platformOf(UA.macChrome, false)).toBe("web");
  });
});

describe("iOS can only be asked from the installed app", () => {
  it("says so for a Safari tab, and not for the installed app", () => {
    /*
      Apple grants the Notification permission only to a home-screen web app (iOS 16.4+). In a
      normal Safari tab the request resolves `denied` with no explanation shown to the user — so
      the UI has to say it BEFORE the tap, or somebody taps, sees nothing, and concludes the
      product does not work.
    */
    expect(iosNeedsInstall(UA.iphoneSafari, false)).toBe(true);
    expect(iosNeedsInstall(UA.iphoneSafari, true)).toBe(false);
  });

  it("never blocks Android or desktop on it", () => {
    expect(iosNeedsInstall(UA.androidChrome, false)).toBe(false);
    expect(iosNeedsInstall(UA.windowsEdge, false)).toBe(false);
  });

  it("is what the card renders, and the card gives the actual steps", () => {
    const card = read("src/components/notifications/EnablePushCard.tsx");
    expect(card).toContain("ios_needs_install");
    // "Install the app" is not an instruction. Share → Add to Home Screen is.
    expect(card).toContain("Add to Home Screen");
  });
});

describe("what a device is called in a list", () => {
  it("names the browser and the OS, so two phones are distinguishable", () => {
    expect(describeDevice(UA.iphoneSafari, true)).toBe("Safari on iOS (installed)");
    expect(describeDevice(UA.androidChrome, false)).toBe("Chrome on Android");
    expect(describeDevice(UA.windowsEdge, false)).toBe("Edge on desktop");
    expect(describeDevice(UA.macChrome, false)).toBe("Chrome on desktop");
  });

  it("puts Edge before Chrome, since Edge's UA claims both", () => {
    expect(describeDevice(UA.windowsEdge, false)).not.toContain("Chrome");
  });
});

describe("the token is written where the router reads it", () => {
  const hook = stripComments(read("src/hooks/usePushNotifications.ts"));
  // The router's I/O half; see notify-staff-runtime.ts's header for why it is not in the
  // function any more.
  const fn = stripComments(read("supabase/functions/_shared/notify-staff-runtime.ts"));

  it("writes staff_push_tokens, not the columns notification_settings has not got", () => {
    expect(hook).toContain('from("staff_push_tokens")');
    // The dead write, and the façade that hid it from tsc. Word-bounded: `staff_push_tokens`
    // contains `push_token` as a substring, and a plain `toContain` would fail on the fix.
    expect(hook).not.toMatch(/\bpush_token\b/);
    expect(hook).not.toMatch(/\bpush_enabled\b/);
    expect(hook).not.toMatch(/supabase as unknown as/);
  });

  it("keys on the token, so a shared phone moves owner instead of failing", () => {
    // `token` is UNIQUE: the same registration token must never be attached to two staff rows,
    // or the second person to enable notifications on a shared tablet receives the first
    // person's alerts.
    expect(hook).toMatch(/onConflict: "token"/);
  });

  it("registers against a STAFF row, resolved from the signed-in user", () => {
    expect(hook).toMatch(/from\("staff"\)[\s\S]{0,120}?\.eq\("user_id", user\.id\)/);
    // A member is not staff, and a member reaching this hook is a routing bug, not a row.
    expect(hook).toMatch(/if \(!staff\)/);
  });

  it("is the same table and columns the router sends to", () => {
    expect(fn).toContain('from("staff_push_tokens").select("staff_id, token, platform")');
    // ...and the router prunes by token, which is why the client stores one row per token.
    expect(fn).toMatch(/from\("staff_push_tokens"\)\s*\.delete\(\)\.eq\("token", token\)/);
  });

  it("hands the registration to getToken, so the SDK does not register an unconfigured worker", () => {
    const lib = stripComments(read("src/lib/firebase.ts"));
    expect(lib).toMatch(/navigator\.serviceWorker\.register\(serviceWorkerUrl\(config\)/);
    expect(lib).toMatch(/serviceWorkerRegistration: registration/);
    expect(lib).toMatch(/vapidKey: config\.vapidKey/);
  });

  it("revokes at Firebase before deleting the row", () => {
    // The other order can leave a token that is live at Google and owned by nobody here: a
    // notification for a member of staff who has left, on a phone that is no longer theirs.
    const disable = hook.slice(hook.indexOf("const disable ="), hook.indexOf("useEffect(() => {", hook.indexOf("const disable =")));
    expect(disable.indexOf("unregisterForPush")).toBeGreaterThan(-1);
    expect(disable.indexOf("unregisterForPush")).toBeLessThan(disable.indexOf(".delete()"));
  });
});

describe("the card is reachable from both surfaces", () => {
  it("is on the admin Settings page, in a Notifications tab that the URL can name", () => {
    const page = read("src/pages/admin/SettingsPage.tsx");
    expect(page).toContain("<EnablePushCard />");
    expect(page).toContain('<TabsContent value="notifications"');
    // Deep-linkable, and in the valid-tab list — the "security" tab was once deep-linked to
    // without being listed, and the param was silently dropped.
    expect(page).toMatch(/SETTINGS_TABS = \[[^\]]*"notifications"/);
  });

  it("is on the staff preferences page, where the removed switches used to be", () => {
    const page = read("src/pages/call-centre/StaffPreferencesPage.tsx");
    expect(page).toContain("<EnablePushCard />");
    // The comment it replaces said the old switches "were never persisted or consumed".
    expect(stripComments(page)).not.toContain("reinstate when wired");
  });
});
