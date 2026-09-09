// @vitest-environment node
//
// THE SERVICE WORKER IS A SHIPPED FILE, SO IT IS TESTED AS ONE.
//
// public/firebase-messaging-sw.js cannot import from the app bundle — a service worker is a
// static script — so its logic cannot be moved into a module the way everything else here is.
// The alternative to testing it in place is not testing it, and this file had three separate
// defects that a reader would have to spot by eye:
//
//   1. `initializeApp({ apiKey: "placeholder", … })` under a comment promising the config was
//      "injected at build time via env vars". Nothing injected anything; nothing could.
//   2. `showNotification` called from `onBackgroundMessage` for EVERY message, including the
//      ones carrying a `notification` payload that the SDK displays itself — two cards on the
//      lock screen for one event.
//   3. A click handler reading `data.url` when the server sends `data.link`, so
//      `undefined || "/"` sent every tap to the dashboard.
//
// So this evaluates the real file with stubbed globals and drives its handlers.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { stripComments } from "./helpers/stripComments";

const SW = readFileSync(join(process.cwd(), "public/firebase-messaging-sw.js"), "utf8");

const CONFIG = {
  apiKey: "AIza-test",
  projectId: "ice-alarm-test",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc",
};

interface Harness {
  self: Record<string, unknown>;
  importScripts: ReturnType<typeof vi.fn>;
  initializeApp: ReturnType<typeof vi.fn>;
  showNotification: ReturnType<typeof vi.fn>;
  openWindow: ReturnType<typeof vi.fn>;
  onBackgroundMessage: (payload: unknown) => void;
  notificationClick: (event: unknown) => void;
  windowClients: Array<{ url: string; focus: () => void; navigate: (u: string) => void }>;
}

/** Evaluate the worker with `self` (and the globals it reaches for) replaced. */
function evaluateWorker(href: string, windowClients: Harness["windowClients"] = []): Harness {
  const listeners: Record<string, (event: unknown) => void> = {};
  let backgroundHandler: (payload: unknown) => void = () => {};

  const showNotification = vi.fn();
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const importScripts = vi.fn();
  const initializeApp = vi.fn();
  const onBackgroundMessage = vi.fn((cb: (payload: unknown) => void) => {
    backgroundHandler = cb;
  });

  const selfStub: Record<string, unknown> = {
    location: { href, origin: "https://icealarm.es" },
    registration: { showNotification },
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      listeners[type] = handler;
    },
    clients: {
      matchAll: vi.fn().mockResolvedValue(windowClients),
      openWindow,
    },
  };

  const firebase = { initializeApp, messaging: () => ({ onBackgroundMessage }) };

  // `self` is the worker's global object, so the file's top-level `const`s and function
  // declarations are evaluated inside a function whose parameters shadow the globals it uses.
  const run = new Function("self", "importScripts", "firebase", "URL", "URLSearchParams", SW);
  run(selfStub, importScripts, firebase, URL, URLSearchParams);

  return {
    self: selfStub,
    importScripts,
    initializeApp,
    showNotification,
    openWindow,
    windowClients,
    onBackgroundMessage: (payload: unknown) => backgroundHandler(payload),
    notificationClick: (event: unknown) => listeners["notificationclick"]?.(event),
  };
}

const configuredHref = () =>
  `https://icealarm.es/firebase-messaging-sw.js?${new URLSearchParams(CONFIG).toString()}`;

describe("the config arrives through the registration URL", () => {
  it("initialises Firebase with the query-string config, not a placeholder", () => {
    const h = evaluateWorker(configuredHref());

    expect(h.initializeApp).toHaveBeenCalledWith(CONFIG);
    expect(h.importScripts).toHaveBeenCalledTimes(2);
    expect((h.self.__push as { configured: boolean }).configured).toBe(true);

    // The word that was in the shipped file for the whole of its life. Code only: the comment
    // explaining the defect names it, and a prose scan that fails on its own explanation is how
    // a guard gets deleted instead of kept.
    expect(stripComments(SW)).not.toContain("placeholder");
  });

  it("does NOT initialise on a partial config — and says nothing rather than throwing", () => {
    /*
      A partially-configured app throws inside the SDK with a message that names none of the
      missing keys, and a service worker that throws during evaluation is simply never installed:
      push then fails with no error anywhere a person can see. Refusing to initialise is the
      honest state, and the client's own env check is what tells somebody which key is missing.
    */
    for (const partial of [
      { apiKey: CONFIG.apiKey },
      { ...CONFIG, appId: "" },
      {},
    ]) {
      const href = `https://icealarm.es/firebase-messaging-sw.js?${new URLSearchParams(
        partial as Record<string, string>,
      ).toString()}`;
      const h = evaluateWorker(href);
      expect(h.initializeApp, JSON.stringify(partial)).not.toHaveBeenCalled();
      expect(h.importScripts, JSON.stringify(partial)).not.toHaveBeenCalled();
      expect((h.self.__push as { configured: boolean }).configured).toBe(false);
    }
  });

  it("still installs its click handler when push is not configured", async () => {
    // The worker may already be registered from a previous deploy and hold notifications the
    // user has not tapped yet. Dropping the handler would make those taps do nothing.
    const h = evaluateWorker("https://icealarm.es/firebase-messaging-sw.js");
    let done: Promise<unknown> = Promise.resolve();
    h.notificationClick({
      notification: { data: { link: "/admin/orders/o-1" }, close: () => {} },
      waitUntil: (p: Promise<unknown>) => {
        done = p;
      },
    });
    await done;
    expect(h.openWindow).toHaveBeenCalledWith("/admin/orders/o-1");
  });
});

describe("one event, one notification", () => {
  it("does NOT display a message that carries a notification payload", () => {
    /*
      THE DOUBLE-NOTIFICATION BUG. Our server sends `notification: {title, body}` (see
      _shared/fcm.ts), which the FCM SDK renders itself. Whether it ALSO invokes
      onBackgroundMessage for such messages has changed between SDK versions and is documented
      both ways — so the worker is written to be correct either way, and this asserts that:
      called with a notification payload, it shows nothing.
    */
    const h = evaluateWorker(configuredHref());
    h.onBackgroundMessage({
      notification: { title: "🟢 PAID SALE", body: "€39.90" },
      data: { type: "sale.paid", link: "/admin/orders/o-1" },
    });
    expect(h.showNotification).not.toHaveBeenCalled();
  });

  it("DOES display a data-only message, tagged by event type", () => {
    const h = evaluateWorker(configuredHref());
    h.onBackgroundMessage({
      data: { type: "sos.opened", title: "SOS", body: "Alert raised", link: "/admin/alerts/a-1" },
    });

    expect(h.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = h.showNotification.mock.calls[0];
    expect(title).toBe("SOS");
    expect(options.body).toBe("Alert raised");
    // One card per event type, replacing the previous one rather than stacking six "device
    // offline" notifications on a lock screen.
    expect(options.tag).toBe("sos.opened");
    expect(options.data.link).toBe("/admin/alerts/a-1");
  });

  it("falls back to a title rather than an empty notification", () => {
    const h = evaluateWorker(configuredHref());
    h.onBackgroundMessage({ data: {} });
    expect(h.showNotification.mock.calls[0][0]).toBe("ICE Alarm España");
    expect(h.showNotification.mock.calls[0][1].tag).toBe("general");
  });
});

describe("where a tap goes", () => {
  /**
   * `waitUntil` is how a service worker says "this work is asynchronous, keep me alive". So the
   * promise handed to it IS the assertion point: the first version of these tests read the spy
   * immediately and found nothing, because `clients.matchAll()` had not resolved yet.
   */
  const clickWith = (data: unknown, windowClients: Harness["windowClients"] = []) => {
    const h = evaluateWorker(configuredHref(), windowClients);
    const close = vi.fn();
    let done: Promise<unknown> = Promise.resolve();
    h.notificationClick({
      notification: { data, close },
      waitUntil: (p: Promise<unknown>) => {
        done = p;
      },
    });
    return { h, close, done };
  };

  it("opens data.link — the key the server actually sends", async () => {
    // The old handler read `data.url`. Nothing has ever sent `url`, so every tap opened "/".
    const { h, close, done } = clickWith({ link: "/admin/alerts/a-1", type: "sos.opened" });
    await done;
    expect(h.openWindow).toHaveBeenCalledWith("/admin/alerts/a-1");
    expect(close).toHaveBeenCalled();
    expect(stripComments(SW)).not.toMatch(/data(\?)?\.url/);
  });

  it("focuses an open tab and navigates it, rather than opening a second one", async () => {
    const focus = vi.fn();
    const navigate = vi.fn();
    const { h, done } = clickWith({ link: "/admin/leads" }, [
      { url: "https://icealarm.es/admin", focus, navigate },
    ]);
    await done;

    expect(h.openWindow).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/admin/leads");
  });

  it("ignores a window from another origin", async () => {
    const focus = vi.fn();
    const { h, done } = clickWith({ link: "/admin/leads" }, [
      { url: "https://not-us.example/admin", focus, navigate: vi.fn() },
    ]);
    await done;
    expect(focus).not.toHaveBeenCalled();
    expect(h.openWindow).toHaveBeenCalledWith("/admin/leads");
  });

  it("stands down on a notification the SDK displayed, so a tap opens ONE window", () => {
    // The messaging SDK installs its own notificationclick listener for the notifications it
    // rendered, and two listeners opening a window is two windows.
    const { h, close } = clickWith({ FCM_MSG: { data: { link: "/admin/orders/o-1" } } });
    expect(h.openWindow).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("has a defined destination for every shape, and never undefined", () => {
    const linkFor = (data: unknown) => {
      const h = evaluateWorker(configuredHref());
      return (h.self.__push as { linkFor: (d: unknown) => string }).linkFor(data);
    };
    expect(linkFor({ link: "/admin" })).toBe("/admin");
    expect(linkFor({ FCM_MSG: { data: { link: "/a" } } })).toBe("/a");
    expect(linkFor({ FCM_MSG: { notification: { click_action: "/b" } } })).toBe("/b");
    expect(linkFor({ FCM_MSG: { fcmOptions: { link: "/c" } } })).toBe("/c");
    expect(linkFor({ link: "" })).toBe("/");
    expect(linkFor({})).toBe("/");
    expect(linkFor(null)).toBe("/");
    expect(linkFor(undefined)).toBe("/");
  });
});
