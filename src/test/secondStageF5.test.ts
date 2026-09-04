// @vitest-environment node
//
// GATE F5, REWRITTEN AGAINST THE SECOND STAGE.
//
// F5 (CUTOVER_RUNBOOK step F5; in-repo guard src/test/registrationPayload.test.ts) proves
// medical data is written for SINGLE and COUPLE, MEMBER and PARTNER. That requirement does not
// change when the join wizard stops collecting it (ONBOARDING_SPLIT.md §7-A) — only the
// mechanism does, from submit-registration to submit-member-update.
//
// This file is the second-stage half. It is added while the old guard still passes, so F5 is
// never absent for a single commit; increment 2 rewrites the payload-side guard in the same PR
// that removes the fields.
//
// It also asserts the negatives the old gate could not express, because submit-member-update
// used to swallow per-contact write failures and burn the token anyway:
//   - a submission whose writes fail is NOT reported as success
//   - and does NOT burn the token, so the member can retry
// See supabase/functions/_shared/member-update-outcome.ts.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decideSubmitOutcome,
  unsatisfiedFields,
  tokenRefusal,
  type SubmitRoute,
} from "../../supabase/functions/_shared/member-update-outcome";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
const FN = "supabase/functions/submit-member-update/index.ts";

const BOTH = ["medical_information", "emergency_contacts"];

const clean = (over: Partial<Parameters<typeof decideSubmitOutcome>[0]> = {}) =>
  decideSubmitOutcome({
    requestedFields: BOTH,
    contactsAttempted: 1,
    contactErrors: 0,
    medicalAttempted: true,
    medicalError: false,
    route: "member_link" as SubmitRoute,
    ...over,
  });

describe("F5 — medical AND contacts are written through the second stage", () => {
  it("a clean submission records both and is a success", () => {
    const r = clean();
    expect(r.outcome).toBe("recorded");
    expect(r.success).toBe(true);
    expect(r.medicalWritten).toBe(true);
    expect(r.contactsWritten).toBe(1);
  });

  it("both fields are written for a SINGLE member", () => {
    const r = clean({ requestedFields: BOTH, contactsAttempted: 2 });
    expect(r.success).toBe(true);
    expect(r.contactsWritten).toBe(2);
  });

  it("a COUPLE is two submissions, each satisfying its own token", () => {
    // ONBOARDING_SPLIT.md §3 Option B: one token per member, so the couple case is literally
    // two independent runs of this decision — the primary's and the partner's. What F5 must
    // still prove is that BOTH are required to succeed on their own terms; there is no code
    // path in which the primary's submission satisfies the partner's token.
    const primary = clean();
    const partner = clean();
    expect(primary.success).toBe(true);
    expect(partner.success).toBe(true);
    // And a partner who submits nothing is not carried by the primary's success.
    const partnerEmpty = clean({ contactsAttempted: 0, medicalAttempted: false });
    expect(partnerEmpty.success).toBe(false);
    expect(partnerEmpty.outcome).toBe("nothing_submitted");
  });

  it("the endpoint writes medical_information AND emergency_contacts, still", () => {
    const src = read(FN);
    expect(src).toContain('from("medical_information")');
    expect(src).toContain('from("emergency_contacts")');
  });

  it("the write is scoped to the token's member_id, never a payload-supplied one", () => {
    const src = read(FN);
    // memberId comes from tokenData, so a payload cannot redirect the write at another member.
    expect(src).toContain("const memberId = tokenData.member_id;");
    expect(src).not.toMatch(/memberId\s*=\s*(payload|body)\./);
  });
});

describe("F5 — a failed write is never a success, and never burns the token", () => {
  it("one failed contact write fails the whole submission", () => {
    const r = clean({ contactsAttempted: 3, contactErrors: 1 });
    expect(r.success).toBe(false);
    expect(r.outcome).toBe("write_failed");
  });

  it("EVERY contact write failing is not reported as success", () => {
    // This is the defect verbatim: the old loop console.error'd each failure and returned
    // {success: true, "Profile updated successfully"}.
    const r = clean({ contactsAttempted: 3, contactErrors: 3 });
    expect(r.success).toBe(false);
    expect(r.contactsWritten).toBe(0);
  });

  it("a failed medical write is not reported as success", () => {
    const r = clean({ medicalError: true });
    expect(r.success).toBe(false);
    expect(r.medicalWritten).toBe(false);
  });

  it("a failed submission does NOT burn the token — the member can retry", () => {
    expect(clean({ contactErrors: 1 }).burnToken).toBe(false);
    expect(clean({ medicalError: true }).burnToken).toBe(false);
    expect(clean({ contactsAttempted: 0, medicalAttempted: false }).burnToken).toBe(false);
  });

  it("ONLY a clean write burns the token", () => {
    expect(clean().burnToken).toBe(true);
    // Swept: no outcome other than `recorded` may ever burn.
    const failures = [
      clean({ contactErrors: 1 }),
      clean({ medicalError: true }),
      clean({ contactsAttempted: 0, medicalAttempted: false }),
      tokenRefusal("token_used"),
      tokenRefusal("token_expired"),
      tokenRefusal("token_invalid"),
      tokenRefusal("token_missing"),
    ];
    for (const f of failures) {
      expect(f.success).toBe(false);
      expect(f.burnToken).toBe(false);
    }
  });

  it("the function burns the token only behind the decision, not unconditionally", () => {
    const src = read(FN);
    expect(src).toContain("if (result.burnToken)");
    // The old unconditional stamp is gone.
    expect(src).not.toMatch(/\.update\(\{\s*used_at: new Date\(\)\.toISOString\(\)\s*\}\)/);
  });
});

describe("F5 — an empty submission is not a completed second stage", () => {
  it("no contact supplied, when contacts were requested, is not a success", () => {
    const r = clean({ contactsAttempted: 0 });
    expect(r.outcome).toBe("nothing_submitted");
    expect(r.success).toBe(false);
  });

  it("a token that asked only for medical is not failed by an absent contact", () => {
    const r = clean({ requestedFields: ["medical_information"], contactsAttempted: 0 });
    expect(r.success).toBe(true);
  });

  it("a token that asked only for contacts is not failed by absent medical", () => {
    const r = clean({ requestedFields: ["emergency_contacts"], medicalAttempted: false });
    expect(r.success).toBe(true);
  });

  it("unsatisfiedFields names exactly what is still missing", () => {
    expect(unsatisfiedFields(BOTH, { contacts: 0, medical: false })).toEqual(BOTH);
    expect(unsatisfiedFields(BOTH, { contacts: 1, medical: true })).toEqual([]);
    expect(unsatisfiedFields(["emergency_contacts"], { contacts: 0, medical: true }))
      .toEqual(["emergency_contacts"]);
  });
});

describe("F5 — attribution is derived, never claimed", () => {
  it("the route is resolved from the caller's identity, not the payload", () => {
    const src = read(FN);
    expect(src).toContain("async function resolveRoute(");
    // A payload-supplied route would be client-writable provenance on health data.
    expect(src).not.toMatch(/route\s*=\s*(payload|body)\./);
    expect(src).not.toMatch(/const\s*\{[^}]*submitted_via[^}]*\}\s*=\s*(payload|body)/);
  });

  it("an unreadable identity is never upgraded to an operator", () => {
    const src = read(FN);
    // Both the catch and the no-uid path must fall back to member_link, never operator.
    const fallbacks = src.match(/return \{ route: "member_link", staffId: null \}/g) ?? [];
    expect(fallbacks.length).toBeGreaterThanOrEqual(3);
    expect(src).not.toMatch(/catch[\s\S]{0,200}operator_assisted/);
  });

  it("the activity log records the derived route, not a hardcoded string", () => {
    const src = read(FN);
    expect(src).not.toContain('updated_via: "member_update_link"');
    expect(src).toContain("updated_via: route");
  });

  it("provenance is stamped on both tables' writes", () => {
    const src = read(FN);
    // service_role has no auth.uid(), so the trigger cannot infer it — the function must state it.
    expect((src.match(/recorded_via: route/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((src.match(/recorded_by_staff: staffId/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
