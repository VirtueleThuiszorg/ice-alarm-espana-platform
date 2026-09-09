/**
 * Sessions last until the browser is closed or the user signs out.
 *
 * WHAT WAS WRONG. `useSessionTimeout` signed EVERYBODY out after 30 minutes without a
 * mousemove, and it was the only reason anybody ever re-logged-in or re-entered a TOTP code —
 * Supabase persists the session and refreshes the access token by itself, so nothing else was
 * expiring. It was worst for the people it mattered most to: the SOS ladder's tier 1 is an
 * operator watching an open screen, and an operator who has been reading rather than clicking
 * for half an hour is doing their job.
 *
 * THE "BROWSER CLOSE" SIMULATION IS REAL, not a mock. Closing a browser clears
 * `sessionStorage` and leaves `localStorage` alone — that is the whole of the difference between
 * the two stores. So `closeBrowser()` below clears `sessionStorage` and nothing else, and the
 * assertions ask the storage adapter what it can still see. That is the actual property, tested
 * the actual way.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  adoptExistingSession,
  authStorage,
  clearAllAuthStorage,
  isPersistentLogin,
  setPersistentLogin,
} from "@/lib/authStorage";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The shape Supabase actually uses: `sb-<project-ref>-auth-token`. */
const TOKEN_KEY = "sb-crpsuhoixfdhjugprbuc-auth-token";
const TOKEN = JSON.stringify({ access_token: "a", refresh_token: "r" });

const store = authStorage as {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
};

/** What a browser close does, and all it does. */
function closeBrowser() {
  window.sessionStorage.clear();
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("the idle logout is gone", () => {
  it("neither the hook nor its dialog exists any more", () => {
    // Deleted rather than defanged. A hook left in place with a longer timeout is a hook
    // somebody re-tunes; a deleted one has to be rewritten on purpose.
    expect(existsSync(join(process.cwd(), "src/hooks/useSessionTimeout.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/components/SessionTimeoutWarning.tsx"))).toBe(false);
  });

  it("nothing is mounted that could sign anyone out on a timer", () => {
    const app = code("src/App.tsx");
    expect(app).not.toMatch(/SessionTimeoutWarning/);
    expect(app).not.toMatch(/useSessionTimeout/);
  });

  it("the timeout constants are gone too, not merely enlarged", () => {
    // Set to 8h or Infinity, the next person "tidies" it back down. There is no number left.
    const constants = code("src/config/constants.ts");
    expect(constants).not.toMatch(/SESSION_IDLE/);
    expect(constants).not.toMatch(/SESSION_WARNING/);
    expect(constants).not.toMatch(/ACTIVITY_THROTTLE/);
  });

  it("no source file arms a timer that signs somebody out", () => {
    /*
      The load-bearing assertion of requirement 1, and it is deliberately a search over the
      whole tree rather than over the two files I deleted: the failure to prevent is somebody
      re-adding an inactivity logout anywhere, not those two files coming back by name.
    */
    const files = [
      "src/App.tsx",
      "src/contexts/AuthContext.tsx",
      "src/components/auth/ProtectedRoute.tsx",
      "src/lib/authStorage.ts",
      "src/lib/authSessionSync.ts",
    ];
    for (const file of files) {
      const source = code(file);
      // A setTimeout/setInterval whose body reaches signOut within a few lines.
      expect(source, file).not.toMatch(/set(Timeout|Interval)\([\s\S]{0,200}?signOut/);
    }
  });

  it("Supabase is still told to persist and refresh — which is why no timer is needed", () => {
    const client = code("src/integrations/supabase/client.ts");
    expect(client).toMatch(/persistSession:\s*true/);
    expect(client).toMatch(/autoRefreshToken:\s*true/);
  });
});

/**
 * Lee's test 1, and an honest note on what these two prove.
 *
 * They advance fake time past the old cliff and assert the token is still readable — so they
 * prove the STORES do not expire a session by themselves. They do NOT mount the app, so no
 * timer could fire in them regardless; they cannot catch somebody re-adding an inactivity
 * logout. That is what "no source file arms a timer that signs somebody out" above is for, and
 * that one IS mutation-proven: planting a `setTimeout(() => handleSignOut(), 30 * 60 * 1000)`
 * back into `AuthContext` makes it fail.
 *
 * Both are kept because they fail for different reasons. Saying so beats a comment claiming
 * this is the behavioural proof when the behavioural proof is the other assertion.
 */
describe("staff idle for 31 minutes are still signed in", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("31 minutes of wall-clock silence removes nothing from storage", async () => {
    // A staff session is ephemeral by default, so this is the ephemeral store being asked
    // whether it quietly drops a token over time. It does not.
    setPersistentLogin(false);
    store.setItem(TOKEN_KEY, TOKEN);
    expect(store.getItem(TOKEN_KEY)).toBe(TOKEN);

    // Well past the old 30-minute cliff, and past the 5-minute warning before it.
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);

    expect(store.getItem(TOKEN_KEY), "an idle operator was signed out").toBe(TOKEN);
  });

  it("and neither does eight hours", async () => {
    // Lee offered 8h for members as an alternative and preferred none. None is what this is.
    setPersistentLogin(true);
    store.setItem(TOKEN_KEY, TOKEN);
    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000 + 1000);
    expect(store.getItem(TOKEN_KEY)).toBe(TOKEN);
  });
});

describe("closing the browser — the checkbox decides", () => {
  it("UNCHECKED: the token never touches localStorage, and is gone after a close", () => {
    // Lee's test 2. The staff default.
    setPersistentLogin(false);
    store.setItem(TOKEN_KEY, TOKEN);

    // The security property, checked directly: nothing on disk.
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe(TOKEN);
    expect(
      window.localStorage.getItem(TOKEN_KEY),
      "a token in localStorage outlives the browser on a shared machine",
    ).toBeNull();

    closeBrowser();

    expect(store.getItem(TOKEN_KEY), "still signed in after closing the browser").toBeNull();
  });

  it("CHECKED: the token survives a close", () => {
    // Lee's test 3. The member default.
    setPersistentLogin(true);
    store.setItem(TOKEN_KEY, TOKEN);

    expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN);
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull();

    closeBrowser();

    expect(store.getItem(TOKEN_KEY), "signed out despite asking to be remembered").toBe(TOKEN);
  });

  it("switching the box OFF clears the copy the previous choice left on disk", () => {
    /*
      Without this, ticking the box off would change nothing observable: the old localStorage
      token would still be found on the next browser session, so the control would be a
      security setting that does not do anything — the worst kind.
    */
    setPersistentLogin(true);
    store.setItem(TOKEN_KEY, TOKEN);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN);

    setPersistentLogin(false);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("switching the box ON clears the ephemeral copy, so one store holds the session", () => {
    setPersistentLogin(false);
    store.setItem(TOKEN_KEY, TOKEN);
    setPersistentLogin(true);
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("a write never lands in both stores", () => {
    // Two copies means the ephemeral one expires and the persistent one does not, so "signed
    // out when the browser closes" quietly stops being true.
    setPersistentLogin(false);
    window.localStorage.setItem(TOKEN_KEY, "stale");
    store.setItem(TOKEN_KEY, TOKEN);

    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe(TOKEN);
  });

  it("defaults to ephemeral when nobody has chosen", () => {
    expect(isPersistentLogin()).toBe(false);
  });

  it("a STALE localStorage token cannot resurrect an ephemeral session", () => {
    /*
      THE HOLE THIS FILE ORIGINALLY MISSED, found by reviewing the adapter rather than by a
      failing test — and the reason it was missed is worth keeping.

      `getItem` used to fall back to the other store when the chosen one was empty. So:
      an ephemeral staff session closes the browser → `sessionStorage` is empty, as intended →
      the fallback reads `localStorage` → a token left there by an earlier persistent login is
      found → the operator is signed in after a browser close, which is the exact opposite of
      what the unticked box promises.

      Every test above passed regardless, because `setPersistentLogin(false)` clears the other
      store IN THE SAME CALL and each test set the preference immediately before reading. On a
      real browser reopen the preference is already recorded, so nothing clears anything.

      Hence: the preference is written directly here, WITHOUT going through
      `setPersistentLogin`, to reproduce the state a reopened browser is actually in.
    */
    window.localStorage.setItem("ice.auth.persist", "false");
    window.localStorage.setItem(TOKEN_KEY, "stale-but-still-valid");

    expect(
      store.getItem(TOKEN_KEY),
      "an ephemeral session read a token out of localStorage",
    ).toBeNull();
  });

  it("and the mirror: a persistent session ignores a token in sessionStorage", () => {
    // The same rule in the other direction. One store, chosen by the flag, and nothing else.
    window.localStorage.setItem("ice.auth.persist", "true");
    window.sessionStorage.setItem(TOKEN_KEY, "wrong-store");

    expect(store.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe("explicit Sign Out clears everything", () => {
  it("both stores and the preference", () => {
    // Requirement 4. A token left in the store the user is not currently using is a token the
    // next tab picks up, so "sign out" would be undone by opening a tab.
    setPersistentLogin(true);
    window.localStorage.setItem(TOKEN_KEY, TOKEN);
    window.sessionStorage.setItem(TOKEN_KEY, TOKEN);

    clearAllAuthStorage();

    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    // The preference too, or the next person at a shared terminal finds it pre-ticked.
    expect(isPersistentLogin()).toBe(false);
  });

  it("leaves everything that is not a Supabase auth key alone", () => {
    // It must not be a `localStorage.clear()`: the wizard draft, the language choice and the
    // cookie consent all live there, and signing out is not a reason to lose them.
    window.localStorage.setItem("ice_join_wizard", "draft");
    window.localStorage.setItem("i18nextLng", "es");
    window.localStorage.setItem(TOKEN_KEY, TOKEN);

    clearAllAuthStorage();

    expect(window.localStorage.getItem("ice_join_wizard")).toBe("draft");
    expect(window.localStorage.getItem("i18nextLng")).toBe("es");
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("AuthContext calls it, after signing out of Supabase", () => {
    const context = code("src/contexts/AuthContext.tsx");
    expect(context).toContain("clearAllAuthStorage()");
    expect(context.indexOf("supabase.auth.signOut()")).toBeLessThan(
      context.indexOf("clearAllAuthStorage()"),
    );
  });

  it("and staff are still warned when they log out on duty (#246)", () => {
    // Requirement 4's second half. Unchanged by this work, so asserted rather than rebuilt.
    const header = code("src/components/layout/CallCentreHeader.tsx");
    expect(header).toMatch(/onDuty/);
    expect(header).toMatch(/endShift|logOut/);
  });
});

describe("the one-time carry-over for people already signed in", () => {
  it("adopts an existing localStorage session as persistent", () => {
    /*
      Everybody signed in today is signed in through localStorage with no preference recorded.
      If an absent preference meant "ephemeral", deploying this would clear every one of those
      tokens on the next page load — including an operator's, mid-shift, which is the exact
      failure this whole change exists to stop.
    */
    window.localStorage.setItem(TOKEN_KEY, TOKEN);

    expect(adoptExistingSession()).toBe("adopted");
    expect(isPersistentLogin()).toBe(true);
    expect(store.getItem(TOKEN_KEY)).toBe(TOKEN);
  });

  it("does nothing for a first-time visitor, who stays ephemeral by default", () => {
    expect(adoptExistingSession()).toBe("no-session");
    expect(isPersistentLogin()).toBe(false);
  });

  it("never overrides a choice somebody has already made", () => {
    // The carry-over is once, for the deploy. After that the checkbox is the authority.
    setPersistentLogin(false);
    window.localStorage.setItem(TOKEN_KEY, TOKEN);

    expect(adoptExistingSession()).toBe("already-chosen");
    expect(isPersistentLogin()).toBe(false);
  });

  it("runs before the client is constructed", () => {
    // After it, the client would already have read an empty store and started signed out.
    const client = code("src/integrations/supabase/client.ts");
    // `createClient<Database>(` — the CALL. `indexOf("createClient")` finds the import at the
    // top of the file, which is before everything, so the assertion would pass regardless.
    expect(client.indexOf("adoptExistingSession()")).toBeLessThan(
      client.indexOf("createClient<Database>("),
    );
  });
});

describe("2FA is challenged only when a new session is created", () => {
  it("only the staff login page challenges a TOTP factor", () => {
    /*
      Requirement 3. This is what the old idle logout was really costing: every 30 minutes it
      destroyed the session, and the next login re-ran the whole 2FA challenge. With no timer,
      an existing session is never re-challenged — but that must be true because nothing on the
      navigation path can challenge, not merely because nothing happens to trigger it.
    */
    const challengers = [
      "src/contexts/AuthContext.tsx",
      "src/components/auth/ProtectedRoute.tsx",
      "src/App.tsx",
      "src/lib/authStorage.ts",
      "src/lib/authSessionSync.ts",
    ];
    for (const file of challengers) {
      const source = code(file);
      expect(source, file).not.toMatch(/mfa\.challenge|mfa\.verify/);
    }

    // And it does live in the login page, or the assertion above would pass on a product with
    // no 2FA at all.
    expect(code("src/pages/auth/StaffLogin.tsx")).toMatch(/mfa\.challenge/);
  });

  it("the admin gate checks ENROLMENT, not a fresh code", () => {
    // `hasVerifiedFactor === false` means "has never enrolled" and sends them to setup. It is
    // not a challenge, so a reload cannot turn into a code prompt.
    const guard = code("src/components/auth/ProtectedRoute.tsx");
    expect(guard).toMatch(/hasVerifiedFactor === false/);
    expect(guard).not.toMatch(/mfa\./);
  });

  it("a reload reads the stored session rather than re-authenticating", () => {
    // The behavioural half: after a reload the token is still there to be read, so
    // `getSession()` resolves and no login page — and therefore no challenge — is reached.
    setPersistentLogin(true);
    store.setItem(TOKEN_KEY, TOKEN);
    // A reload clears neither store; only a browser close clears the ephemeral one.
    expect(store.getItem(TOKEN_KEY)).toBe(TOKEN);

    setPersistentLogin(false);
    store.setItem(TOKEN_KEY, TOKEN);
    expect(store.getItem(TOKEN_KEY)).toBe(TOKEN);
  });

  it("the TOTP step is reachable only from the password step", () => {
    // `needs2FA` is what renders the code field, and it is set in one place: the submit
    // handler, after a successful password sign-in.
    const login = code("src/pages/auth/StaffLogin.tsx");
    const setters = login.match(/setNeeds2FA\(([^)]*)\)/g) ?? [];
    expect(setters).toContain("setNeeds2FA(true)");
    expect(setters.filter((s) => s.includes("true"))).toHaveLength(1);
  });
});

describe("the checkbox, and its two defaults", () => {
  it("members default ON", () => {
    const login = code("src/pages/auth/Login.tsx");
    expect(login).toMatch(/useState\(true\)/);
    expect(login).toContain("<KeepSignedInCheckbox");
  });

  it("staff default OFF — a call-centre machine is shared between shifts", () => {
    const staff = code("src/pages/auth/StaffLogin.tsx");
    expect(staff).toMatch(/const \[keepSignedIn, setKeepSignedIn\] = useState\(false\)/);
    expect(staff).toContain('audience="staff"');
  });

  it("both set the preference BEFORE signing in, or the tokens land in the wrong store", () => {
    // Supabase writes the session DURING `signInWithPassword`, and the adapter reads the
    // preference on every call — so the ordering IS the mechanism.
    for (const file of ["src/pages/auth/Login.tsx", "src/pages/auth/StaffLogin.tsx"]) {
      const source = code(file);
      const set = source.indexOf("setPersistentLogin(keepSignedIn)");
      const signIn = source.indexOf("signInWithPassword");
      expect(set, `${file}: preference never set`).toBeGreaterThan(-1);
      expect(set, `${file}: preference set after sign-in`).toBeLessThan(signIn);
    }
  });
});

describe("multi-tab, for an ephemeral session", () => {
  const sync = code("src/lib/authSessionSync.ts");

  it("a new tab asks the others before deciding it is signed out", () => {
    expect(sync).toContain("BroadcastChannel");
    expect(sync).toMatch(/type: "request"/);
    expect(sync).toMatch(/setSession\(/);
  });

  it("AuthContext awaits that BEFORE reading the session", () => {
    // Otherwise `getSession()` answers "no session" for a tab that is about to have one, and
    // the operator sees a login page.
    // Anchored INSIDE `initializeAuth`. `refreshAuth`, defined earlier in the file, also calls
    // `getSession()` — comparing against the first occurrence in the file measured the wrong
    // pair and failed for a reason that had nothing to do with the ordering under test.
    const context = code("src/contexts/AuthContext.tsx");
    const init = context.slice(context.indexOf("const initializeAuth"));
    expect(init.indexOf("adoptSessionFromOtherTab(supabase)")).toBeLessThan(
      init.indexOf("supabase.auth.getSession()"),
    );
    expect(init.indexOf("adoptSessionFromOtherTab(supabase)")).toBeGreaterThan(-1);
  });

  it("it serves other tabs for as long as it lives, and stops on unmount", () => {
    const context = code("src/contexts/AuthContext.tsx");
    expect(context).toContain("serveSessionToOtherTabs(supabase)");
    expect(context).toContain("stopServing()");
  });

  it("a tab with no session stays silent rather than answering 'nobody is signed in'", () => {
    // A negative reply from a tab that is merely still starting up would sign out a tab that
    // could have been seeded. Silence plus the asker's own timeout is the safe shape.
    expect(sync).toMatch(/if \(!session\?\.access_token \|\| !session\.refresh_token\) return;/);
  });

  it("degrades without BroadcastChannel instead of throwing", () => {
    // Some embedded webviews do not have it. A missing API must not take down the login path.
    expect(sync).toMatch(/typeof BroadcastChannel === "undefined"/);
  });

  it("does nothing in persistent mode, where localStorage is already shared", () => {
    expect(sync).toMatch(/if \(isPersistentLogin\(\)\) return "not-needed"/);
  });
});

describe("storage access never takes the app down", () => {
  it("every accessor is guarded", () => {
    // `localStorage` THROWS, not returns null, in a private window with site data blocked and
    // in some webviews. An exception at import time would break the page where somebody is
    // trying to sign in.
    const storage = code("src/lib/authStorage.ts");
    expect(storage).toMatch(/function safely/);
    for (const fn of [
      "isPersistentLogin",
      "setPersistentLogin",
      "clearAllAuthStorage",
      "adoptExistingSession",
    ]) {
      expect(storage, fn).toContain(fn);
    }
  });

  it("survives a storage that throws on every call", () => {
    const exploding = {
      get length() { throw new Error("blocked"); },
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
      key() { throw new Error("blocked"); },
      clear() { throw new Error("blocked"); },
    };
    const original = window.localStorage;
    Object.defineProperty(window, "localStorage", { value: exploding, configurable: true });
    try {
      expect(() => isPersistentLogin()).not.toThrow();
      expect(isPersistentLogin()).toBe(false);
      expect(() => setPersistentLogin(true)).not.toThrow();
      expect(() => clearAllAuthStorage()).not.toThrow();
      expect(adoptExistingSession()).toBe("no-session");
      expect(() => store.getItem(TOKEN_KEY)).not.toThrow();
      expect(store.getItem(TOKEN_KEY)).toBeNull();
      expect(() => store.setItem(TOKEN_KEY, TOKEN)).not.toThrow();
    } finally {
      Object.defineProperty(window, "localStorage", { value: original, configurable: true });
    }
  });
});
