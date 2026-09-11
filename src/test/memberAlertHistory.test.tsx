/**
 * ALERT HISTORY, HIDDEN FROM MEMBERS BY DEFAULT — and provably so in BOTH states.
 *
 * A member's alert history is a list of the times their alarm went off. Empty for most members
 * most of the time, which is the good outcome — and for the members it is not empty for, it is a
 * list of their own worst days on the screen they open to check the alarm still works. Whether
 * to show it is a product decision, so it is a setting; and because it is a setting, BOTH
 * settings have to be tested. A feature flag tested in one position is a feature flag that works
 * in one position.
 *
 * WHAT THIS IS NOT ABOUT. Alert creation, escalation, the operator's screens and every staff
 * view are untouched. The assertions at the end of this file are what keep that honest: the
 * setting must not appear anywhere on the SOS path or on a staff surface, because a flag that
 * could suppress an alert rather than a page would be a life-safety defect wearing a display
 * feature's clothes.
 *
 * THE THREE WAYS THIS COULD SILENTLY NOT WORK, each with a test:
 *
 *   1. The key is not in the public whitelist. A member is `authenticated` with no staff row, so
 *      the read returns nothing, "nothing" parses as off, and the admin switch appears to work
 *      while being permanently stuck. That is exactly what happened to `usePricingSettings` and
 *      four keys (20260908120000).
 *   2. `save-api-keys` renames the key on the way in. It computes
 *      `key.startsWith(`${service}_`) ? key : `${service}_${key}``, so `service: "settings"`
 *      would write `settings_member_alert_history_enabled` — a key nothing reads. TWO settings
 *      in this repo are in that state today; see the last describe block.
 *   3. The default is wrong in the "on" direction, showing a member something somebody decided
 *      not to show them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";

import {
  MEMBER_ALERT_HISTORY_KEY,
  MEMBER_SETTING_SERVICE,
  memberAlertHistoryEnabled,
  memberAlertHistorySettingValue,
} from "@/lib/memberDisplaySettings";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── doubles ─────────────────────────────────────────────────────────────────
/** `null` = the row is absent, which is what a database the migration has not reached looks like. */
let settingValue: string | null = null;
/** Make the settings read fail, as a whitelist miss or a network blip would. */
let settingReadError = false;
let navigatedTo: string | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.gte = () => Promise.resolve({ count: 0, data: [], error: null });
      chain.order = () => Promise.resolve({ data: [], error: null });
      chain.limit = () => Promise.resolve({ data: [], error: null });
      chain.maybeSingle = () =>
        settingReadError
          ? Promise.resolve({ data: null, error: new Error("no policy") })
          : Promise.resolve({
              data: settingValue === null ? null : { value: settingValue },
              error: null,
            });
      chain.single = () => Promise.resolve({ data: null, error: null });
      return chain;
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

vi.mock("react-router-dom", () => ({
  Navigate: ({ to }: { to: string }) => {
    navigatedTo = to;
    return null;
  },
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: "/dashboard/alerts" }),
  NavLink: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock("@/hooks/useMemberProfile", () => ({
  useMemberAlerts: () => ({ data: [], isLoading: false }),
  useMemberSubscriptions: () => ({ data: null }),
  useMemberDevice: () => ({ data: null, isLoading: false }),
  useMemberSubscription: () => ({ data: null, isLoading: false }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === "string" ? fallback : key),
    i18n: { language: "en" },
  }),
}));

beforeEach(() => {
  settingValue = null;
  settingReadError = false;
  navigatedTo = null;
});
afterEach(cleanup);

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

// ── 1. the parse, and which way it fails ───────────────────────────────────
describe("what an absent or unreadable setting means", () => {
  it("is OFF — an absent row is not permission to show it", () => {
    expect(memberAlertHistoryEnabled(null)).toBe(false);
    expect(memberAlertHistoryEnabled(undefined)).toBe(false);
    expect(memberAlertHistoryEnabled("")).toBe(false);
  });

  it("only the exact string 'true' turns it on", () => {
    /*
      `=== "true"` and not `!== "false"`, and the difference is the direction of the failure.
      `!== "false"` would treat a typo, a stray "0" or an empty row as ON — showing a member a
      list of their own worst days because somebody mistyped a setting.
    */
    expect(memberAlertHistoryEnabled("true")).toBe(true);
    for (const bad of ["TRUE", "1", "yes", "on", " true", "0", "false", "off"]) {
      expect(memberAlertHistoryEnabled(bad), bad).toBe(false);
    }
  });

  it("writes the strings the column stores", () => {
    expect(memberAlertHistorySettingValue(true)).toBe("true");
    expect(memberAlertHistorySettingValue(false)).toBe("false");
    // …and round-trips, so the switch cannot write a value its own reader rejects.
    expect(memberAlertHistoryEnabled(memberAlertHistorySettingValue(true))).toBe(true);
    expect(memberAlertHistoryEnabled(memberAlertHistorySettingValue(false))).toBe(false);
  });
});

// ── 2. the sidebar ─────────────────────────────────────────────────────────
describe("the sidebar, in both states", () => {
  const renderNav = async (value: string | null) => {
    settingValue = value;
    const { useMemberAlertHistory } = await import("@/hooks/useMemberAlertHistory");
    // The nav item's existence is one boolean; rendering the whole layout would drag in the
    // header, the bell, the chat button and six more queries to assert one list entry.
    function Probe() {
      const { enabled } = useMemberAlertHistory();
      return (
        <ul>
          <li>My Device</li>
          {enabled ? <li data-testid="nav-alert-history">Alert History</li> : null}
          <li>Messages</li>
        </ul>
      );
    }
    wrap(<Probe />);
  };

  it("offers no Alert History item when the setting is off", async () => {
    await renderNav("false");
    await waitFor(() => expect(screen.getByText("Messages")).toBeVisible());
    expect(screen.queryByTestId("nav-alert-history")).toBeNull();
  });

  it("offers none when the row is absent either", async () => {
    await renderNav(null);
    await waitFor(() => expect(screen.getByText("Messages")).toBeVisible());
    expect(screen.queryByTestId("nav-alert-history")).toBeNull();
  });

  it("offers it when the setting is on", async () => {
    await renderNav("true");
    expect(await screen.findByTestId("nav-alert-history")).toBeVisible();
  });

  it("the layout reads the setting rather than hard-coding the item", () => {
    /*
      The item used to be an unconditional entry in the `services` group. The source assertion
      is here because a render test can only prove the item is absent in ONE arrangement — this
      proves the layout has no second, unguarded copy of it.
    */
    const layout = read("src/components/layout/ClientLayout.tsx");
    expect(layout).toContain("useMemberAlertHistory");
    expect(layout).toContain("alertHistoryEnabled");
    // Exactly one mention of the path, and it is inside the guard.
    const mentions = layout.match(/\/dashboard\/alerts/g) ?? [];
    expect(mentions.length, "the path appears more than once — one of them is unguarded").toBe(1);
  });
});

// ── 3. the route ───────────────────────────────────────────────────────────
describe("/dashboard/alerts itself", () => {
  const renderPage = async () => {
    const Page = (await import("@/pages/client/AlertHistoryPage")).default;
    wrap(<Page />);
  };

  it("redirects to the dashboard when the setting is off", async () => {
    // The second half of hiding it: a bookmark, an old email or the browser's own history all
    // reach the URL without the nav.
    settingValue = "false";
    await renderPage();
    await waitFor(() => expect(navigatedTo).toBe("/dashboard"));
  });

  it("redirects when the row is absent", async () => {
    settingValue = null;
    await renderPage();
    await waitFor(() => expect(navigatedTo).toBe("/dashboard"));
  });

  it("redirects when the read FAILS, rather than spinning for ever", async () => {
    /*
      `settled` is true on an error as well as on success, and it has to be: a whitelist
      regression would otherwise leave this page on a spinner permanently — a worse outcome than
      the redirect, because a member cannot tell it from a page that is loading slowly.
    */
    settingReadError = true;
    await renderPage();
    await waitFor(() => expect(navigatedTo).toBe("/dashboard"));
  });

  it("renders when the setting is on, and does NOT redirect", async () => {
    settingValue = "true";
    await renderPage();
    await waitFor(() => expect(screen.getByTestId("page-header")).toBeVisible());
    expect(navigatedTo).toBeNull();
  });

  it("does not redirect BEFORE the setting has been read", async () => {
    /*
      THE ONE THAT WOULD HAVE BITTEN. Redirecting on `!enabled` rather than on
      `settled && !enabled` bounces a member who HAS the feature on, making the page unreachable
      by link for as long as the read takes — and unreachable ALWAYS on a slow connection, which
      is the member most likely to be on one.

      Asserted at the first paint, before the query resolves: nothing has navigated yet.
    */
    settingValue = "true";
    await renderPage();
    expect(navigatedTo).toBeNull();
  });
});

// ── 4. the dashboard ───────────────────────────────────────────────────────
describe("the dashboard's alerts tile and recent-activity card", () => {
  it("both are behind the setting, and the tile grid reflows with them", () => {
    /*
      SOURCE-ASSERTED. `ClientDashboard` needs an authenticated member, a readiness view, a
      subscription, unread counts and a last thread before it renders at all, and mocking six
      queries to count tiles would test the mocks. What matters and is checkable here is that
      neither block is unconditional and that the COLUMN COUNT moves with them: `md:grid-cols-4`
      with three children leaves an empty quarter, which reads as a tile that failed to load on
      a page whose whole subject is whether something is working.
    */
    const dash = read("src/pages/client/ClientDashboard.tsx");
    expect(dash).toContain("useMemberAlertHistory");
    // The recent-activity card and the tile are both guarded.
    expect(dash).toMatch(/\{alertHistoryEnabled && \(\s*<Card data-testid="recent-activity">/);
    expect(dash).toMatch(/\{alertHistoryEnabled && \(\s*<Card>\s*<CardContent className="p-4 text-center">\s*<p className="text-2xl font-bold text-primary">\{displayAlertsCount/);
    // The grid is told how many columns to be, and the skeleton row agrees with it.
    expect(dash).toContain("statColumns");
    expect(dash).toMatch(/md:grid-cols-4.*:.*md:grid-cols-3/);
    expect(dash).not.toMatch(/className="grid gap-4 grid-cols-2 md:grid-cols-4"/);
    // …and the reads are disabled with the display, so a hidden feature costs no round trips.
    expect(dash).toMatch(/enabled: !!effectiveMemberId && !isTemplatePreview && alertHistoryEnabled/);
  });
});

// ── 5. the migration ───────────────────────────────────────────────────────
describe("the migration", () => {
  const migration = () => {
    const dir = join(ROOT, "supabase/migrations");
    const f = readdirSync(dir).find((m) => m.includes("member_alert_history_setting"));
    expect(f, "the migration must exist").toBeDefined();
    return readFileSync(join(dir, f!), "utf8");
  };

  it("seeds the setting as FALSE", () => {
    expect(migration()).toMatch(
      new RegExp(`'${MEMBER_ALERT_HISTORY_KEY}',\\s*'false'`),
    );
  });

  it("does not overwrite a value an admin has since turned on", () => {
    // A migration that silently un-does an admin's decision on re-apply is worse than one that
    // fails loudly. The RLS harness re-executes migrations against a fresh database.
    expect(migration()).toContain("ON CONFLICT (key) DO NOTHING");
  });

  it("adds the key to the PUBLIC whitelist, or a member could never read it", () => {
    /*
      The failure this prevents is silent and total: a member is `authenticated` with no staff
      row, so without the whitelist the read returns nothing, "nothing" parses as off, and the
      admin switch appears to work while being permanently stuck. Four pricing keys were in
      exactly that state until 20260908120000.
    */
    const sql = migration();
    expect(sql).toMatch(/CREATE POLICY "Anyone can read the public settings whitelist"/);
    expect(sql).toContain(`'${MEMBER_ALERT_HISTORY_KEY}'`);
    expect(sql).toMatch(/TO anon, authenticated/);
  });

  it("keeps every key the previous whitelist had — this policy is replaced, not patched", () => {
    // A policy cannot be altered in place, so it is recreated whole; dropping one of the seven
    // existing keys would silently break the anonymous join flow.
    const sql = migration();
    for (const key of [
      "settings_company_name",
      "settings_emergency_phone",
      "settings_support_email",
      "settings_address",
      "settings_active_payment_gateway",
      "registration_fee_enabled",
      "registration_fee_discount",
    ]) {
      expect(sql, `${key} must survive the replacement`).toContain(`'${key}'`);
    }
  });

  it("grants no WRITE — the switch goes through the super-admin function", () => {
    const sql = migration();
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|ALL)/i);
  });
});

// ── 6. the admin switch, and the rename that would silence it ──────────────
describe("the admin switch writes where the readers look", () => {
  it("sends `service: \"member\"`, so the key is not renamed on the way in", () => {
    /*
      THE INVISIBLE FAILURE. `save-api-keys` computes
      `key.startsWith(`${service}_`) ? key : `${service}_${key}``. Sending this key with
      `service: "settings"` writes `settings_member_alert_history_enabled` — which nothing
      reads — and the switch would move on screen while changing nothing a member sees.
    */
    const tab = read("src/components/admin/settings/MemberPortalSettingsTab.tsx");
    expect(tab).toContain("MEMBER_SETTING_SERVICE");
    expect(MEMBER_SETTING_SERVICE).toBe("member");
    expect(
      MEMBER_ALERT_HISTORY_KEY.startsWith(`${MEMBER_SETTING_SERVICE}_`),
      "the key must already start with the service, or save-api-keys renames it",
    ).toBe(true);
  });

  it("the tab is reachable — a switch on a tab nobody can open is not a switch", () => {
    const page = read("src/pages/admin/SettingsPage.tsx");
    expect(page).toContain("MemberPortalSettingsTab");
    expect(page).toMatch(/SETTINGS_TABS = \[[^\]]*"members"/);
    expect(page).toMatch(/<TabsTrigger value="members">/);
    expect(page).toMatch(/<TabsContent value="members"/);
  });

  it("renders both positions of the switch", async () => {
    settingValue = "true";
    const { MemberPortalSettingsTab } = await import(
      "@/components/admin/settings/MemberPortalSettingsTab"
    );
    wrap(<MemberPortalSettingsTab />);
    const on = await screen.findByTestId("member-alert-history-switch");
    expect(on).toHaveAttribute("data-state", "checked");

    cleanup();
    settingValue = "false";
    wrap(<MemberPortalSettingsTab />);
    const off = await screen.findByTestId("member-alert-history-switch");
    expect(off).toHaveAttribute("data-state", "unchecked");
  });
});

// ── 7. what this setting must NEVER touch ──────────────────────────────────
describe("display only — the SOS path and the staff views cannot see this setting", () => {
  it("no edge function reads it", () => {
    /*
      THE LOAD-BEARING ASSERTION OF THIS WHOLE FEATURE. A flag that could suppress an ALERT
      rather than a PAGE would be a life-safety defect wearing a display feature's clothes.
      Golden rule 8: the SOS path is never mocked, and nothing here may gate it.
    */
    const dir = join(ROOT, "supabase/functions");
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, name.name);
        if (name.isDirectory()) walk(full);
        else if (/\.ts$/.test(name.name) && readFileSync(full, "utf8").includes(MEMBER_ALERT_HISTORY_KEY)) {
          offenders.push(full.replace(ROOT + "/", ""));
        }
      }
    };
    walk(dir);
    expect(offenders, `server code reads a member DISPLAY setting: ${offenders.join(", ")}`).toEqual([]);
  });

  it("only the member portal and the one admin switch read it in the client", () => {
    const allowed = new Set([
      "src/lib/memberDisplaySettings.ts",
      "src/hooks/useMemberAlertHistory.ts",
      "src/components/admin/settings/MemberPortalSettingsTab.tsx",
    ]);
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, name.name);
        const rel = full.replace(ROOT + "/", "");
        if (name.isDirectory()) {
          if (name.name === "test") continue;
          walk(full);
        } else if (
          /\.tsx?$/.test(name.name) &&
          !allowed.has(rel) &&
          readFileSync(full, "utf8").includes(MEMBER_ALERT_HISTORY_KEY)
        ) {
          offenders.push(rel);
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(
      offenders,
      `the key itself should only appear in its module, its hook and its switch — everything ` +
        `else goes through useMemberAlertHistory: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("no staff or operator alert view is gated on it", () => {
    for (const file of [
      "src/pages/admin/AlertsPage.tsx",
      "src/components/admin/member-detail/AlertsTab.tsx",
    ]) {
      const src = read(file);
      expect(src, `${file} must not read a member display setting`).not.toContain(
        "useMemberAlertHistory",
      );
      expect(src).not.toContain(MEMBER_ALERT_HISTORY_KEY);
    }
  });
});
