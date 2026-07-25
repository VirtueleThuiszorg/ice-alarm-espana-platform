/**
 * Partner-portal night batch (audited fixes, 2026-07-24) — source contracts.
 *
 * Each test pins one audited fix so it cannot silently regress:
 *   1. ResidentialDashboard CSV button is honest — it previews, not "uploads"
 *   2. ResidentialDashboard CSV reader has onerror + parse guard
 *   3. PartnerJoin validates the current step's fields before advancing
 *   4. CareDashboard send-all checks the invoke response and rolls failures
 *      back to draft (invoke resolves with { error }, it never throws)
 *   5. PartnerLogin links to /forgot-password
 *   6. `x?.length === 0` (false when undefined → headers-only table) is gone
 *      from PartnerCommissionsPage and PartnerInvitesPage
 *   7. PartnerSettings saves preferences via its own mutation (no payout write)
 *   8. PartnerMarketingPage admin view mode requires an actual admin role
 *   9. PartnerHeader admin info uses maybeSingle (admins without a staff row
 *      must not throw)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const residential = read("src/components/partner/ResidentialDashboard.tsx");
const careDashboard = read("src/components/partner/CareDashboard.tsx");
const partnerJoin = read("src/pages/partner/PartnerJoin.tsx");
const partnerLogin = read("src/pages/partner/PartnerLogin.tsx");
const commissionsPage = read("src/pages/partner/PartnerCommissionsPage.tsx");
const invitesPage = read("src/pages/partner/PartnerInvitesPage.tsx");
const settingsPage = read("src/pages/partner/PartnerSettingsPage.tsx");
const marketingPage = read("src/pages/partner/PartnerMarketingPage.tsx");
const partnerHeader = read("src/components/partner/PartnerHeader.tsx");

describe("partner portal night batch — source contracts", () => {
  it("ResidentialDashboard CSV affordance says preview, never 'Upload CSV File'", () => {
    expect(residential).not.toContain("Upload CSV File");
    expect(residential).toContain('t("partner.residential.previewCsv"');
    expect(residential).toContain("Preview CSV (import coming soon)");
  });

  it("ResidentialDashboard CSV reader guards parse errors and read errors", () => {
    expect(residential).toMatch(/reader\.onerror\s*=/);
    // the onload body is wrapped in try/catch with a parse-error toast
    expect(residential).toMatch(/csvParseError/);
    expect(residential).toMatch(/csvReadError/);
  });

  it("PartnerJoin validates the current step before advancing (form.trigger)", () => {
    expect(partnerJoin).toMatch(/await\s+form\.trigger\(/);
    // final submit surfaces invalid state instead of silently no-opping
    expect(partnerJoin).toMatch(/form\.handleSubmit\(onSubmit,\s*onInvalid\)/);
    // internal navigation uses react-router, not full-page <a> reloads
    expect(partnerJoin).not.toMatch(/<a\s+href="\/partner\/login"/);
    expect(partnerJoin).toMatch(/<Link\s+to="\/partner\/login"/);
  });

  it("CareDashboard send-all checks the invoke response and rolls failures back to draft", () => {
    expect(careDashboard).toMatch(/if\s*\(response\.error\)/);
    expect(careDashboard).toMatch(/\.update\(\{\s*status:\s*"draft",\s*sent_at:\s*null\s*\}\)/);
    // the honest outcome toast reports sends AND failures
    expect(careDashboard).toContain("partner.care.sendResult");
  });

  it("PartnerLogin offers a forgot-password path", () => {
    expect(partnerLogin).toMatch(/<Link\s+to="\/forgot-password"/);
    expect(partnerLogin).toContain("Forgot password?");
  });

  it("empty-state checks handle undefined query data (no `?.length === 0`)", () => {
    expect(commissionsPage).not.toMatch(/\?\.length === 0/);
    expect(commissionsPage).toContain("!commissions?.length");
    expect(invitesPage).not.toMatch(/\?\.length === 0/);
    expect(invitesPage).toContain("!invites?.length");
  });

  it("PartnerSettings preferences form has its own mutation and never writes payout fields", () => {
    expect(settingsPage).toContain("updatePreferencesMutation");
    expect(settingsPage).toMatch(/updatePreferencesMutation\.mutate\(\)/);
    // the preferences mutation writes only preferred_language
    const prefsMutation = settingsPage.split("updatePreferencesMutation = useMutation")[1]?.split("});")[0] ?? "";
    expect(prefsMutation).toContain("preferred_language");
    expect(prefsMutation).not.toContain("payout_iban");
    expect(prefsMutation).not.toContain("payout_beneficiary_name");
  });

  it("PartnerMarketingPage admin view mode requires an admin staff role, not just the URL param", () => {
    expect(marketingPage).toMatch(
      /isAdminViewMode = isStaff && checkAdminRole\(staffRole\) && !!partnerIdParam/
    );
    expect(marketingPage).toContain('import { isAdminRole as checkAdminRole } from "@/config/constants"');
  });

  it("PartnerHeader admin info query tolerates a missing staff row (maybeSingle)", () => {
    expect(partnerHeader).not.toMatch(/\.single\(\)/);
    expect(partnerHeader).toMatch(/from\("staff"\)[\s\S]{0,200}\.maybeSingle\(\)/);
  });
});
