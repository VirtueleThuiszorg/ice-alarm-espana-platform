import type { SupabaseClient } from "@supabase/supabase-js";

import { isPersistentLogin } from "@/lib/authStorage";

/**
 * MULTI-TAB FOR AN EPHEMERAL SESSION — the one real cost of using `sessionStorage`.
 *
 * THE PROBLEM. `sessionStorage` is per-tab. It is what makes "the session ends when the browser
 * closes" true without leaving a token on a shared call-centre disk — but it also means a
 * SECOND tab starts with nothing and shows a login page, while the first tab is signed in. For
 * an operator who opens the member record in a new tab mid-alert, that is unacceptable.
 *
 * (Browsers copy `sessionStorage` into a tab opened FROM another tab — ctrl-click, target=_blank
 * — so that case already works. The gap is a tab opened from the address bar, a bookmark, or a
 * restored window.)
 *
 * THE FIX. Tabs ask each other. A tab that starts with no session broadcasts one request; any
 * signed-in tab replies with its tokens; the asker installs them with `setSession`. Nothing is
 * written to disk and nothing crosses an origin — `BroadcastChannel` is same-origin only.
 *
 * WHY THIS AND NOT "localStorage plus clear on last tab close". That was the alternative, and
 * it is weaker on the thing that matters here: it keeps the token on disk for the whole session,
 * on a machine shared between shifts, and it relies on an unload handler that does not fire on
 * a crash or a force-quit — so the "cleared on close" promise fails exactly when somebody
 * yanked the power out, which is when you would most want it to have held.
 *
 * IT IS ASYNCHRONOUS, AND THAT IS VISIBLE. The Supabase client reads storage synchronously as it
 * is constructed, so a seeded tab is briefly unauthenticated before `setSession` resolves. The
 * app already has a loading state for exactly that window (`AuthContext.isLoading`), so the
 * honest behaviour is a moment of "loading" rather than a flash of the login page.
 */

const CHANNEL = "ice-auth-session";

/** How long to wait for another tab to answer before concluding nobody is signed in. */
const REPLY_TIMEOUT_MS = 400;

type Message =
  | { type: "request"; from: string }
  | { type: "offer"; access_token: string; refresh_token: string };

function newId(): string {
  return Math.random().toString(36).slice(2);
}

function channel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

/**
 * Start answering other tabs' requests. Called once per tab, for the life of the tab.
 *
 * Returns a teardown function. Answering is unconditional on the persistence mode: a persistent
 * tab replying costs nothing (the asker would have found the token in `localStorage` anyway),
 * and making it conditional would mean a tab whose mode changed mid-life stops answering.
 */
export function serveSessionToOtherTabs(supabase: SupabaseClient): () => void {
  const bus = channel();
  if (!bus) return () => {};

  const onMessage = async (event: MessageEvent) => {
    const message = event.data as Message | undefined;
    if (message?.type !== "request") return;

    const { data } = await supabase.auth.getSession();
    const session = data.session;
    // No session, no reply. Silence is the asker's "nobody is signed in" answer, and it is
    // reached by its own timeout rather than by a negative message — so a tab that is still
    // starting up cannot answer "no" on behalf of a tab that is signed in.
    if (!session?.access_token || !session.refresh_token) return;

    bus.postMessage({
      type: "offer",
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    } satisfies Message);
  };

  bus.addEventListener("message", onMessage);
  return () => {
    bus.removeEventListener("message", onMessage);
    bus.close();
  };
}

/**
 * Ask other tabs for a session, and install the first one offered.
 *
 * Resolves `"adopted"` when a session was installed, `"none"` when nobody answered in time, and
 * `"not-needed"` when this tab already has one or is in persistent mode (where `localStorage` is
 * shared across tabs and there is nothing to sync).
 */
export async function adoptSessionFromOtherTab(
  supabase: SupabaseClient,
): Promise<"adopted" | "none" | "not-needed"> {
  // Persistent mode shares `localStorage` between tabs, so a new tab already has the token.
  if (isPersistentLogin()) return "not-needed";

  const { data } = await supabase.auth.getSession();
  if (data.session) return "not-needed";

  const bus = channel();
  if (!bus) return "none";

  const me = newId();

  try {
    const offer = await new Promise<Message | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), REPLY_TIMEOUT_MS);

      const onReply = (event: MessageEvent) => {
        const message = event.data as Message | undefined;
        if (message?.type !== "offer") return;
        clearTimeout(timer);
        bus.removeEventListener("message", onReply);
        resolve(message);
      };
      bus.addEventListener("message", onReply);

      bus.postMessage({ type: "request", from: me } satisfies Message);
    });

    if (!offer || offer.type !== "offer") return "none";

    const { error } = await supabase.auth.setSession({
      access_token: offer.access_token,
      refresh_token: offer.refresh_token,
    });
    // A refused token is not an error to show anybody: it means the offering tab's session had
    // already expired, which is indistinguishable from nobody being signed in.
    return error ? "none" : "adopted";
  } finally {
    bus.close();
  }
}
