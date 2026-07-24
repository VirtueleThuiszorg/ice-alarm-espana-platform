/**
 * Staff creation + invite honesty (Lee, 2026-07-24).
 *
 * Diagnosis first: staff CREATION was already server-side (`staff-register`,
 * service-role, caller-role-checked, admin AND super_admin allowed) — the
 * broken link was the INVITE EMAIL step: `staff-send-invite` swallowed email
 * failures and returned "Invitation sent successfully" anyway, so with the
 * Gmail secret unset on prod the admin saw success while no email ever went
 * out (never-silent violation — the same class the holiday-workflow fix
 * killed elsewhere).
 *
 * This suite pins:
 *  1. the existing server-side creation contract (no client-side staff
 *     INSERT anywhere in src/, function role-gate includes plain admin);
 *  2. the invite fn now REPORTS email outcome (email_sent / email_error)
 *     and never claims "sent successfully" unconditionally;
 *  3. the UI surfaces the failure (warning toast) instead of celebrating.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const register = read("supabase/functions/staff-register/index.ts");
const invite = read("supabase/functions/staff-send-invite/index.ts");
const hook = read("src/hooks/useStaffInvites.ts");

describe("staff creation is server-side (pre-existing, pinned)", () => {
  it("no client-side INSERT into staff anywhere in src/", () => {
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !p.includes("/test/")) {
          if (/\.from\(["']staff["']\)\s*\.insert/.test(readFileSync(p, "utf8"))) {
            offenders.push(p.replace(ROOT + "/", ""));
          }
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(offenders, "staff rows are created ONLY via staff-register").toEqual([]);
  });

  it("staff-register verifies the caller and allows admin, not just super_admin", () => {
    expect(register).toMatch(/getClaims/);
    expect(register).toMatch(/\["admin", "super_admin"\]\.includes\(staffData\.role\)/);
    expect(register).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("staff-register rolls back the auth user if the staff insert fails", () => {
    expect(register).toMatch(/auth\.admin\.deleteUser\(authUser\.user\.id\)/);
  });
});

describe("invite email outcome is reported, never faked", () => {
  it("staff-send-invite returns email_sent + email_error in its response", () => {
    expect(invite).toMatch(/email_sent: emailSent/);
    expect(invite).toMatch(/email_error: emailErrorReason/);
  });

  it("the success message is conditional on the email actually sending", () => {
    expect(invite).not.toMatch(/message: "Invitation sent successfully",/);
    expect(invite).toMatch(/Invitation created, but the email could NOT be sent/);
  });

  it("email failure reasons are captured from both the result and thrown errors", () => {
    expect(invite).toMatch(/emailErrorReason = emailResult\.error/);
    expect(invite).toMatch(/emailErrorReason = emailError instanceof Error/);
  });

  it("the UI warns on email_sent === false instead of toasting success", () => {
    expect(hook).toMatch(/data\?\.email_sent === false/);
    expect(hook).toMatch(/toast\.warning\(/);
    // and the happy toast is inside the else branch, not unconditional
    expect(hook).toMatch(/} else {\s*\n\s*toast\.success\("Invitation sent successfully!"\);/);
  });

  it("the shared transport fail-fast reason surfaces (GMAIL_APP_PASSWORD)", () => {
    const email = read("supabase/functions/_shared/email.ts");
    expect(email).toMatch(/GMAIL_APP_PASSWORD not configured/);
  });
});
