/**
 * Call-centre portal night-batch audit fixes — source contracts.
 *
 * 1. False all-clears: the four dashboard device cards must destructure
 *    isError and render an explicit load-error state instead of the green
 *    "no alerts / no issues / no devices / zero counters" all-clear when the
 *    query failed.
 * 2. Admin-link gating: non-admin operators get /unauthorized from /admin/*
 *    routes, so the admin-navigating affordances (View All, eye button, stat
 *    boxes) render only for admins (isStaff && checkAdminRole(staffRole)).
 * 3. Header cleanup: the dead search Input is gone (GlobalSearch Cmd+K is the
 *    real search), sign-out no longer discards the end-of-shift update error,
 *    strings are localized under callCentreHeader.*.
 * 4. Dashboard: the mute toggle was a false affordance (useAlerts plays sound
 *    unconditionally) — soundEnabled is gone; the clock follows i18n.language.
 * 5. ShiftHistory: staff-lookup failure clears isLoading (no infinite
 *    "Loading history…") and the phantom bg-alert-claimed token is dead.
 * 6. Deep links: MemberDetailPage initialises its tab from ?tab=; MessagesPage
 *    only renders the member action bar when the conversation has a member_id.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const CARD_DIR = "src/components/call-centre";
const offlineCard = read(`${CARD_DIR}/DeviceOfflineAlertsCard.tsx`);
const issuesQueue = read(`${CARD_DIR}/DeviceIssuesQueue.tsx`);
const liveStatus = read(`${CARD_DIR}/EV07BLiveStatusCard.tsx`);
const pendantModal = read(`${CARD_DIR}/PendantLiveStatusModal.tsx`);
const header = read("src/components/layout/CallCentreHeader.tsx");
const dashboard = read("src/pages/call-centre/CallCentreDashboard.tsx");
const shiftHistory = read("src/pages/call-centre/ShiftHistoryPage.tsx");
const memberDetail = read("src/pages/admin/MemberDetailPage.tsx");
const messages = read("src/pages/call-centre/MessagesPage.tsx");
const preferences = read("src/pages/call-centre/StaffPreferencesPage.tsx");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

describe("phantom design token", () => {
  it("bg-alert-claimed (never defined in the theme) is absent from src/pages and src/components", () => {
    // Comment lines may name the token to explain the fix; only real usage counts.
    const offenders = [...walk("src/pages"), ...walk("src/components")].filter((rel) =>
      read(rel)
        .split("\n")
        .some((line) => line.includes("bg-alert-claimed") && !/^\s*(\/\/|\/?\*)/.test(line)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("false all-clears — failed queries render an error state, not green", () => {
  it.each([
    ["DeviceOfflineAlertsCard", offlineCard],
    ["DeviceIssuesQueue", issuesQueue],
    ["EV07BLiveStatusCard", liveStatus],
    ["PendantLiveStatusModal", pendantModal],
  ])("%s destructures isError and branches on it with the shared loadError copy", (_name, src) => {
    expect(src).toMatch(/isError\s*\}\s*=\s*useQuery|isLoading,\s*isError/);
    expect(src).toMatch(/isError\s*\?/);
    expect(src).toContain('t("callCentre.loadError"');
  });
});

describe("admin-link gating — operators never see /admin/* affordances", () => {
  it.each([
    ["DeviceOfflineAlertsCard", offlineCard],
    ["DeviceIssuesQueue", issuesQueue],
    ["EV07BLiveStatusCard", liveStatus],
  ])("%s computes isAdmin from checkAdminRole and gates admin navigation on it", (_name, src) => {
    expect(src).toContain('import { isAdminRole as checkAdminRole } from "@/config/constants"');
    expect(src).toMatch(/const isAdmin = isStaff && checkAdminRole\(staffRole\)/);
    // Every admin-route affordance sits behind the isAdmin flag.
    expect(src).toMatch(/isAdmin && [\s\S]*?\/admin\/|isAdmin \? \(\) => navigate\("\/admin\//);
  });

  it("EV07B stat boxes only navigate for admins (onClick is conditional)", () => {
    expect(liveStatus).not.toMatch(/onClick=\{\(\) => navigate\("\/admin\//);
    expect(liveStatus).toMatch(/onClick=\{isAdmin \? \(\) => navigate\("\/admin\//);
  });
});

describe("CallCentreHeader", () => {
  it("has no dead search Input (GlobalSearch Cmd+K is the real search)", () => {
    expect(header).not.toContain("Search members, alerts");
    expect(header).not.toMatch(/import \{ Input \}/);
  });

  it("sign-out checks the end-of-shift update result and warns without blocking logout", () => {
    expect(header).toMatch(/const \{ error \} = await supabase\s*\n\s*\.from\("staff"\)/);
    expect(header).toContain("toast.warning(");
    expect(header).toContain('"callCentreHeader.shiftUpdateFailed"');
    // signOut still runs after the guarded block — logout is never blocked.
    expect(header).toMatch(/toast\.warning\([\s\S]*await signOut\(\)/);
  });

  it("user-visible strings are localized under callCentreHeader.* and green badges use the resolved token", () => {
    for (const key of ["onDuty", "startShift", "scheduled", "staffOnShift", "role", "shiftHistory", "preferences", "endShift", "logOut"]) {
      expect(header).toContain(`t("callCentreHeader.${key}"`);
    }
    expect(header).not.toContain("bg-green-600");
    expect(header).toContain("bg-alert-resolved text-alert-resolved-foreground");
  });
});

describe("CallCentreDashboard", () => {
  it("the sound mute false-affordance is gone (useAlerts plays sound unconditionally)", () => {
    expect(dashboard).not.toContain("soundEnabled");
    expect(dashboard).not.toMatch(/Volume2|VolumeX/);
  });

  it("the status-bar clock follows the active i18n language, not hardcoded en-GB", () => {
    expect(dashboard).toMatch(/i18n\.language === "es" \? "es-ES" : i18n\.language === "nl" \? "nl-NL" : "en-GB"/);
  });
});

describe("ShiftHistoryPage — staff-lookup failure can't strand the loading state", () => {
  it("sets isLoading false and toasts in the staff fetch error branch", () => {
    const errorBranch = shiftHistory.match(/Error fetching staff[\s\S]{0,400}?return;/)?.[0] ?? "";
    expect(errorBranch).toContain("setIsLoading(false)");
    expect(errorBranch).toContain('t("shiftHistory.loadFailed"');
  });
});

describe("deep links and null-member guards", () => {
  it("MemberDetailPage initialises activeTab from ?tab= validated against its tab values", () => {
    expect(memberDetail).toContain("useSearchParams");
    expect(memberDetail).toMatch(/searchParams\.get\("tab"\)/);
    expect(memberDetail).toMatch(/TAB_VALUES/);
  });

  it("MessagesPage renders the member action bar only when the conversation has a member_id", () => {
    expect(messages).toMatch(/\{selectedConversation\.member_id && \(\s*\n\s*<div className="flex items-center gap-2">\s*\n\s*<a href=\{`tel:/);
    expect(messages).toMatch(/\{selectedConversation\.member_id && \(\s*\n\s*<Button variant="ghost" size="icon" asChild>/);
  });
});

describe("StaffPreferencesPage — unwired notification switches removed", () => {
  it("has no phantom notification preference state and keeps the reinstate note", () => {
    expect(preferences).not.toContain("alertSounds");
    expect(preferences).not.toContain("desktopNotifications");
    expect(preferences).not.toContain("emailSummary");
    expect(preferences).toContain("notification preferences card removed");
  });
});

describe("locale coverage for the new keys", () => {
  it.each(["en", "es", "nl"])("%s.json carries callCentre.loadError, callCentreHeader.*, shiftHistory.loadFailed", (locale) => {
    const table = JSON.parse(read(`src/i18n/locales/${locale}.json`));
    expect(table.callCentre.loadError).toBeTruthy();
    expect(table.shiftHistory.loadFailed).toBeTruthy();
    for (const key of ["operator", "onDuty", "startShift", "scheduled", "onShift", "staffOnShift", "role", "shiftHistory", "preferences", "endShift", "logOut", "dutyUpdateFailed", "nowOnDuty", "shiftEnded", "shiftUpdateFailed"]) {
      expect(table.callCentreHeader[key], `${locale}: callCentreHeader.${key}`).toBeTruthy();
    }
  });
});
