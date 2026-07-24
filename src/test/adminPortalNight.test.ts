/**
 * Admin-portal night-audit source contracts (2026-07-24).
 *
 * Each test pins a specific audited fix so a refactor can't silently
 * reintroduce the bug class (mostly: unchecked supabase writes followed by an
 * unconditional success toast, and broken deep-links). Mirrors the static
 * readFileSync+regex style of i18nKeyCoverage.test.ts — no rendering, no DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("admin portal night-audit source contracts", () => {
  it("ProtectedRoute admits admin-role staff through the requireMember gate", () => {
    const src = read("src/components/auth/ProtectedRoute.tsx");
    // The shared helper, not a re-inlined role check
    expect(src).toMatch(/import\s*{\s*isAdminRole[^}]*}\s*from\s*["']@\/config\/constants["']/);
    // requireMember must not bounce staff admins to /complete-registration
    expect(src).toMatch(/requireMember\s*&&\s*!memberId\s*&&\s*!isAdminRole/);
  });

  it("ClientLayout resolves the effective member id from ?memberId= for admin-view mode", () => {
    const src = read("src/components/layout/ClientLayout.tsx");
    expect(src).toMatch(/searchParams\.get\(\s*["']memberId["']\s*\)\s*\?\?\s*authMemberId/);
    // staff notifications stay off in the client shell
    expect(src).toMatch(/<NotificationBell\s+staffId=\{null\}/);
  });

  it("OutreachLeadDetailDialog checks both DNC writes before the success toast", () => {
    const src = read("src/components/admin/outreach/OutreachLeadDetailDialog.tsx");
    const dnc = src.slice(src.indexOf("const handleMarkDNC"), src.indexOf("const handleApproveSend"));
    const leadCheck = dnc.indexOf("if (leadError)");
    const suppressionCheck = dnc.indexOf("if (suppressionError)");
    const successToast = dnc.indexOf("outreach.leadDetail.markedDNC");
    expect(leadCheck).toBeGreaterThan(-1);
    expect(suppressionCheck).toBeGreaterThan(leadCheck);
    expect(successToast).toBeGreaterThan(suppressionCheck);
    // both error paths bail out before the success toast
    expect(dnc.slice(0, successToast).match(/return;/g)?.length).toBeGreaterThanOrEqual(2);
    // drafts fetch no longer discards errors and surfaces a loading state
    expect(src).toMatch(/\.then\(\s*\(\s*{\s*data\s*,\s*error\s*}\s*\)/);
    expect(src).toMatch(/isLoadingDrafts/);
  });

  it("useOutreachCaps throws on both the usage update and the fallback insert", () => {
    const src = read("src/hooks/useOutreachCaps.ts");
    const fn = src.slice(src.indexOf("const incrementUsageMutation"), src.indexOf("// Check if a cap is reached"));
    const throws = fn.match(/if\s*\(error\)\s*throw error;/g) ?? [];
    expect(throws.length).toBeGreaterThanOrEqual(2);
  });

  it("useOutreachRawLeads checks the outreach_queued_tasks insert", () => {
    const src = read("src/hooks/useOutreachRawLeads.ts");
    expect(src).toMatch(/{\s*error:\s*queueError\s*}[\s\S]{0,200}?outreach_queued_tasks/);
    expect(src).toMatch(/if\s*\(queueError\)\s*throw queueError;/);
  });

  it("useFailedActions media and outreach retry branches throw on write errors", () => {
    const src = read("src/hooks/useFailedActions.ts");
    const media = src.slice(src.indexOf('case "media"'), src.indexOf('case "video"'));
    const outreach = src.slice(src.indexOf('case "outreach"'), src.indexOf("queryClient.invalidateQueries"));
    expect(media).toMatch(/const\s*{\s*error\s*}\s*=/);
    expect(media).toMatch(/if\s*\(error\)\s*throw error;/);
    expect(outreach).toMatch(/const\s*{\s*error\s*}\s*=/);
    expect(outreach).toMatch(/if\s*\(error\)\s*throw error;/);
  });

  it("OutreachControlPanel surfaces updateSetting failures and skips refetch", () => {
    const src = read("src/components/admin/outreach/OutreachControlPanel.tsx");
    const fn = src.slice(src.indexOf("const updateSetting"), src.indexOf("const handleSendNow"));
    expect(fn).toMatch(/const\s*{\s*error\s*}\s*=\s*await supabase/);
    expect(fn).toContain("Could not update outreach settings");
    // error path returns before refetch()
    expect(fn.indexOf("return;")).toBeGreaterThan(-1);
    expect(fn.indexOf("return;")).toBeLessThan(fn.indexOf("refetch()"));
  });

  it("CRMContactDetailPage checks the post-member CRM writes and does not navigate on failure", () => {
    const src = read("src/pages/admin/CRMContactDetailPage.tsx");
    expect(src).toMatch(/if\s*\(profileError\)/);
    expect(src).toMatch(/if\s*\(linkError\)/);
    expect(src).toContain("Member created but CRM link failed");
    const convert = src.slice(src.indexOf("const handleConvertToMember"));
    // both bail-outs happen before the navigate() at the end of the happy path
    expect(convert.indexOf("if (profileError)")).toBeLessThan(convert.indexOf("navigate(`/admin/members/"));
    expect(convert.indexOf("if (linkError)")).toBeLessThan(convert.indexOf("navigate(`/admin/members/"));
  });

  it("DeviceTab warns on every has_pendant subscription sync failure", () => {
    const src = read("src/components/admin/member-detail/DeviceTab.tsx");
    const syncs = src.match(/update\(\s*{\s*has_pendant:/g) ?? [];
    const warnings = src.match(/toast\.warning\("Device updated but subscription flag failed to sync"\)/g) ?? [];
    expect(syncs.length).toBe(3);
    expect(warnings.length).toBe(3);
  });

  it("AISalesDesk mutation reports errors instead of silently rejecting", () => {
    const src = read("src/components/admin/dashboard/AISalesDesk.tsx");
    expect(src).toMatch(/onError:[\s\S]{0,200}?toast\.error/);
    // no unhandled awaited mutateAsync left in the handlers
    expect(src).not.toMatch(/await updateActionMutation\.mutateAsync/);
  });

  it("FalseAlarmMonitor gives feedback on the follow-up task insert", () => {
    const src = read("src/components/admin/FalseAlarmMonitor.tsx");
    const fn = src.slice(src.indexOf("const handleScheduleFollowUp"));
    expect(fn).toMatch(/const\s*{\s*error\s*}\s*=\s*await supabase\.from\("tasks"\)\.insert/);
    expect(fn).toMatch(/toast\.error/);
    expect(fn).toMatch(/toast\.success/);
  });

  it("EmailTemplatesTab preview forces readable text on its white background", () => {
    const src = read("src/components/admin/settings/EmailTemplatesTab.tsx");
    expect(src).toMatch(/bg-white text-black/);
  });

  it("SalesCommandStrip renders loading and error states instead of authoritative zeros", () => {
    const src = read("src/components/admin/dashboard/SalesCommandStrip.tsx");
    expect(src).toMatch(/const\s*{\s*data:\s*stats\s*,\s*isLoading\s*,\s*isError\s*}/);
    expect(src).toMatch(/if\s*\(isLoading\)/);
    expect(src).toMatch(/if\s*\(isError\)/);
    expect(src).toContain("Sales stats failed to load");
  });

  it("SettingsPage tabs deep-link via a validated ?tab= param", () => {
    const src = read("src/pages/admin/SettingsPage.tsx");
    expect(src).toMatch(/searchParams\.get\(\s*["']tab["']\s*\)/);
    expect(src).toMatch(/<Tabs\s+value=\{activeTab\}\s+onValueChange=\{handleTabChange\}/);
    expect(src).toMatch(/replace:\s*true/);
    // validated against the TabsList values, falling back to company
    expect(src).toMatch(/SETTINGS_TABS\.includes/);
    expect(src).toContain('"company", "pricing", "payments", "communications", "devices", "images", "documentation"');
  });

  it("TicketsPage opens a prefilled create dialog from ?action=create and clears the params", () => {
    const src = read("src/pages/admin/TicketsPage.tsx");
    expect(src).toMatch(/searchParams\.get\(\s*["']action["']\s*\)\s*!==\s*["']create["']/);
    expect(src).toMatch(/searchParams\.get\(\s*["']member_id["']\s*\)/);
    expect(src).toMatch(/searchParams\.get\(\s*["']title["']\s*\)/);
    expect(src).toMatch(/setIsDialogOpen\(true\)/);
    expect(src).toMatch(/next\.delete\("action"\)/);
    expect(src).toMatch(/replace:\s*true/);
  });
});
