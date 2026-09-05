/**
 * Admin conversion of applications — KEPT ON PURPOSE after the public application
 * path was retired.
 *
 * `partner-apply` wrote an APPLICATION: `status='pending'`, no `user_id`, no
 * credentials, so that partner can never log in (`PARTNER_JOURNEY.md` §1). The
 * public site no longer offers that path — partners have one way in, full
 * registration at `/partner/join` — but PRODUCTION MAY STILL HOLD PENDING
 * APPLICATIONS, and an admin must be able to convert each of them into a real
 * account. So the decision, the function and the admin dialog all stay until Lee
 * confirms the count is zero (PENDING_FOR_LEE.md S6).
 *
 * These assertions are therefore load-bearing in the other direction now: they are
 * what stops the conversion path being deleted as "dead code" alongside the page
 * that fed it.
 *
 * The blocker this removes: `partner-admin-invite` rejected EVERY existing row whose
 * status was not already `invited`. An application is `pending`, so the admin got
 * "A partner with this email already exists" and had no way forward — the
 * conversion Option C depends on was impossible.
 *
 * The gate is tested by execution via the extracted pure decision, and the
 * resulting state transition was verified against real PostgreSQL 16.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  decidePartnerInvite,
  type PartnerStatus,
} from "../../supabase/functions/_shared/partnerInviteDecision";

const ROOT = process.cwd();
const resolve = (p: string) => path.resolve(ROOT, p);
const read = (p: string) => readFileSync(resolve(p), "utf8");
const INVITE_FN = "supabase/functions/partner-admin-invite/index.ts";

// ── the decision ───────────────────────────────────────────────────────────

describe("decidePartnerInvite", () => {
  it("converts a pending application — the case Option C turns on", () => {
    expect(decidePartnerInvite("pending")).toEqual({ action: "convert" });
  });

  it("creates a row when no partner exists for the email", () => {
    expect(decidePartnerInvite(null)).toEqual({ action: "create" });
    expect(decidePartnerInvite(undefined)).toEqual({ action: "create" });
  });

  it("re-invites one that was invited and never completed", () => {
    expect(decidePartnerInvite("invited")).toEqual({ action: "reinvite" });
  });

  it("REFUSES an active partner — converting would break a working account", () => {
    const decision = decidePartnerInvite("active");
    expect(decision.action).toBe("reject");
    // Setting an active partner back to `invited` would strip its ability to log
    // in: get_user_role_info grants is_partner only on status='active'.
    if (decision.action === "reject") {
      expect(decision.reason).toMatch(/already has an active account/i);
    }
  });

  it("REFUSES a suspended partner rather than laundering the suspension", () => {
    const decision = decidePartnerInvite("suspended");
    expect(decision.action).toBe("reject");
    if (decision.action === "reject") {
      expect(decision.reason).toMatch(/suspended/i);
      expect(decision.reason).toMatch(/reinstate/i);
    }
  });

  it("refuses an unrecognised status instead of falling through to a write", () => {
    // partner_status gained a fourth value once already (`invited`, 20260303160000).
    // A silent fall-through is how the next addition becomes a bug.
    const decision = decidePartnerInvite("something_new" as PartnerStatus);
    expect(decision.action).toBe("reject");
  });

  it("only ever writes for create / reinvite / convert", () => {
    const writeActions = (["invited", "pending", null] as const).map(
      (s) => decidePartnerInvite(s).action
    );
    expect(writeActions).toEqual(["reinvite", "convert", "create"]);

    for (const status of ["active", "suspended"] as const) {
      expect(decidePartnerInvite(status).action).toBe("reject");
    }
  });
});

// ── the function uses it, and stamps the review ─────────────────────────────

describe("partner-admin-invite conversion", () => {
  const src = read(INVITE_FN);

  it("uses the shared decision rather than its own status check", () => {
    expect(src).toMatch(/decidePartnerInvite/);
    // The old gate, which is the bug being removed.
    expect(src).not.toMatch(/existingPartner\.status !== "invited"/);
  });

  it("stamps reviewed_by from the authenticated caller's staff id", () => {
    expect(src).toMatch(/reviewed_by = callerStaff\.id/);
    // Never from the request body — that would let a caller name someone else as
    // the reviewer of a partner they let in.
    expect(src).not.toMatch(/reviewed_by = .*validated|reviewed_by = .*body/);
  });

  it("stamps reviewed_at server-side", () => {
    expect(src).toMatch(/reviewed_at = new Date\(\)\.toISOString\(\)/);
  });

  it("only stamps the review when converting, not on every invite", () => {
    // A fresh invite has no application to review; stamping it would fabricate a
    // review that never happened.
    expect(src).toMatch(/if \(decision\.action === "convert"\)/);
  });

  it("sets the row to invited so partner-complete-invite can finish it", () => {
    expect(src).toMatch(/status: "invited"/);
  });

  it("checks the update error rather than assuming the write landed", () => {
    expect(src).toMatch(/partnerUpdateError/);
  });

  it("logs no PII when that update fails", () => {
    // Same G2 rule as partner-register: PostgREST `details` can quote the value.
    const block = src.match(/Error updating partner for invite[\s\S]{0,240}/)?.[0] ?? "";
    expect(block).not.toMatch(/details/);
    expect(block).toMatch(/code|message/);
  });

  it("is still admin-only", () => {
    // Golden rule 3: this decides who becomes a partner, so it stays gated.
    expect(src).toMatch(/\["admin", "super_admin"\]\.includes\(callerStaff\.role\)/);
  });
});

// ── review_notes is accepted and bounded ───────────────────────────────────

describe("review_notes", () => {
  // Asserted against the schema source rather than by importing it: the import
  // needs the vitest alias for the edge functions' Deno `npm:zod` specifier, which
  // arrives on the validation-parity branch. Keeping this branch off that shared
  // config avoids a second PR editing vitest.config.ts (CLAUDE.md, Merging).
  const validation = read("supabase/functions/_shared/validation.ts");
  const schema =
    validation.match(/export const partnerAdminInviteSchema = z\.object\(\{[\s\S]*?\n\}\);/)?.[0] ?? "";

  it("the invite schema was found (not a vacuous match)", () => {
    expect(schema).toMatch(/contact_name/);
  });

  it("accepts review_notes", () => {
    expect(schema).toMatch(/review_notes/);
  });

  it("keeps it optional, so an ordinary invite is unaffected", () => {
    expect(schema).toMatch(/review_notes:\s*z\.string\(\)\.max\(\d+\)\.optional\(\)/);
  });

  it("bounds it, like every other free-text field the server takes", () => {
    expect(schema).toMatch(/review_notes:\s*z\.string\(\)\.max\(1000\)/);
  });
});

// ── the conversion path is not collateral damage ───────────────────────────

describe("retiring the public application path did not remove the way to convert one", () => {
  it("the admin dialog still exists", () => {
    expect(existsSync(resolve("src/components/admin/ConvertApplicationDialog.tsx"))).toBe(
      true
    );
  });

  it("the edge function still exists and is still wired to the shared decision", () => {
    expect(existsSync(resolve(INVITE_FN))).toBe(true);
    expect(read(INVITE_FN)).toMatch(/decidePartnerInvite/);
  });

  it("`convert` is still a reachable outcome — a pending row is not orphaned", () => {
    expect(decidePartnerInvite("pending")).toEqual({ action: "convert" });
  });
});
