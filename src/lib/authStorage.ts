/**
 * WHERE THE SUPABASE SESSION IS KEPT, and for how long.
 *
 * THE RULE: a session lasts until the browser is closed or the user signs out. Not until a
 * timer says so. `useSessionTimeout` signed everyone out after 30 minutes idle, and it was the
 * ONLY reason anybody ever re-logged-in or re-entered a TOTP code — Supabase persists the
 * session and refreshes the token by itself, so nothing else was expiring.
 *
 * That timer was actively dangerous here. The SOS ladder's tier 1 is an operator watching an
 * open screen; an operator who has been reading rather than clicking for half an hour is doing
 * their job, and signing them out is taking the first responder off the alert path. It is gone.
 *
 * ── TWO STORES, CHOSEN AT LOGIN ────────────────────────────────────────────
 *
 * "Keep me signed in on this device" decides which:
 *
 *   ON   → `localStorage`. Survives closing the browser. Default for MEMBERS, whose device is
 *          their own and who should not have to sign in to reach their own alarm history.
 *   OFF  → `sessionStorage`. Dies with the tab, and never touches disk. Default for STAFF and
 *          ADMINS, because a call-centre machine is shared between shifts and a token left on
 *          that disk is the next person's session.
 *
 * THE DECISION IS READ PER CALL, not captured once. The client is constructed at import time,
 * long before anybody has ticked a box, so an adapter that closed over one store would write
 * the first login's tokens to the wrong place for ever.
 *
 * ── THE ONE-TIME CARRY-OVER, and why it is deliberate ──────────────────────
 *
 * Everybody signed in today is signed in through `localStorage`, with no flag recorded. If an
 * absent flag meant "ephemeral", deploying this would clear every one of those tokens on the
 * next page load — including an operator's, mid-shift, which is the exact failure this whole
 * change exists to stop. So an absent flag beside an existing session is read as "persistent",
 * once, and written down. Their next deliberate login sets it properly.
 */

/** Where the preference lives. Not a secret — a device preference. */
const PERSIST_KEY = "ice.auth.persist";

/**
 * Supabase names its token key `sb-<project-ref>-auth-token`. We do not hardcode the ref: the
 * prefix is enough to find it, and a hardcoded ref silently stops matching the day the project
 * changes (PROJECT_REFS.md records that this has been a live question here).
 */
const SUPABASE_KEY_PREFIX = "sb-";
const SUPABASE_KEY_SUFFIX = "-auth-token";

function isSupabaseAuthKey(key: string): boolean {
  return key.startsWith(SUPABASE_KEY_PREFIX) && key.includes(SUPABASE_KEY_SUFFIX);
}

/**
 * Storage access throws, not just returns null, in a private window with site data blocked and
 * in some embedded webviews. Every access here is guarded, because an exception at import time
 * would take the whole app down at the point where somebody is trying to sign in.
 */
function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function isPersistentLogin(): boolean {
  return safely(() => window.localStorage.getItem(PERSIST_KEY) === "true", false);
}

/**
 * Record the choice, and CLEAR THE OTHER STORE.
 *
 * Without the clear, switching from "keep me signed in" to not would leave a live token in
 * `localStorage` that the next browser session would find and use — the box would be ticked
 * off and the behaviour would not change, which is the worst kind of security control.
 */
export function setPersistentLogin(persist: boolean): void {
  safely(() => {
    window.localStorage.setItem(PERSIST_KEY, persist ? "true" : "false");
    clearAuthKeys(persist ? window.sessionStorage : window.localStorage);
  }, undefined);
}

/** Delete every Supabase auth key from one store. */
function clearAuthKeys(store: Storage): void {
  safely(() => {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && isSupabaseAuthKey(key)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  }, undefined);
}

/**
 * Everything, both stores, plus the preference. Used by explicit Sign Out.
 *
 * The preference goes too: "sign me out" from a shared machine should not leave the next person
 * looking at a pre-ticked "keep me signed in".
 */
export function clearAllAuthStorage(): void {
  safely(() => {
    clearAuthKeys(window.localStorage);
    clearAuthKeys(window.sessionStorage);
    window.localStorage.removeItem(PERSIST_KEY);
  }, undefined);
}

/**
 * The one-time carry-over described in the header. Called once, before the client is built.
 *
 * Returns what it did, so a test can prove it happened rather than inferring it from the flag.
 */
export function adoptExistingSession(): "adopted" | "no-session" | "already-chosen" {
  return safely(() => {
    if (window.localStorage.getItem(PERSIST_KEY) !== null) return "already-chosen";

    let hasToken = false;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && isSupabaseAuthKey(key)) {
        hasToken = true;
        break;
      }
    }
    if (!hasToken) return "no-session";

    window.localStorage.setItem(PERSIST_KEY, "true");
    return "adopted";
  }, "no-session");
}

/**
 * The storage object handed to `createClient`.
 *
 * Deliberately NOT `localStorage` or `sessionStorage` directly: it asks `isPersistentLogin()` on
 * every single call, so the store follows the preference the moment it changes — which is what
 * makes a checkbox on a login form able to decide where that login's tokens land.
 *
 * READS FALL BACK. A `getItem` looks in the chosen store and then in the other one, because the
 * flag can legitimately be read before it is written: a fresh tab of an ephemeral session has a
 * token seeded into `sessionStorage` by `authSessionSync`, and a member arriving with a
 * persistent token has it in `localStorage`. Writes never fall back — they go to exactly one
 * store, or the token would end up in both and outlive the browser.
 */
export const authStorage: Storage | Record<string, unknown> = {
  getItem: (key: string): string | null =>
    safely(() => {
      const primary = isPersistentLogin() ? window.localStorage : window.sessionStorage;
      const secondary = isPersistentLogin() ? window.sessionStorage : window.localStorage;
      return primary.getItem(key) ?? secondary.getItem(key);
    }, null),

  setItem: (key: string, value: string): void =>
    safely(() => {
      const store = isPersistentLogin() ? window.localStorage : window.sessionStorage;
      store.setItem(key, value);
      // The other store must not keep a copy. This is the write half of the same rule
      // `setPersistentLogin` enforces on the read half.
      const other = isPersistentLogin() ? window.sessionStorage : window.localStorage;
      other.removeItem(key);
    }, undefined),

  removeItem: (key: string): void =>
    safely(() => {
      // Both, always. A sign-out that left the token in the store the user is not currently
      // using is a sign-out that a new tab undoes.
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }, undefined),
};
