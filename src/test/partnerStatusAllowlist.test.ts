/**
 * `partner_status` handling must be an ALLOWLIST on `active`, everywhere.
 *
 * The asymmetry this closes: `PartnerLogin` denied only `pending` and `suspended`,
 * while `get_user_role_info` grants `is_partner` **only** for `active`. So `invited`
 * passed the login check and was then refused by `ProtectedRoute requirePartner` —
 * a successful sign-in followed by /unauthorized with no explanation.
 *
 * It was filed as latent on the grounds that an `invited` row has no `user_id`, so
 * the login lookup fails first. That was wrong twice over:
 *
 *  1. `invited` IS a real fourth status (`20260303160000`), not a hypothetical.
 *  2. The conversion added in #112 could REACH the broken state. `partner-register`
 *     writes `pending` WITH a `user_id` and a password the partner chose;
 *     `partner-apply` writes `pending` WITHOUT one. Both looked identical to
 *     `decidePartnerInvite`, so converting a self-registered partner would set
 *     `invited` while keeping their `user_id` — precisely the combination that
 *     passes login and is then refused.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  decidePartnerInvite,
  type PartnerStatus,
} from "../../supabase/functions/_shared/partnerInviteDecision";
import { partnerLoginRefusal } from "@/lib/partnerLoginRefusal";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const ALL_STATUSES: PartnerStatus[] = ["invited", "pending", "active", "suspended"];

// ── the two kinds of `pending` ──────────────────────────────────────────────

describe("decidePartnerInvite distinguishes the two pending rows", () => {
  it("converts a true application — pending with NO user_id", () => {
    expect(decidePartnerInvite("pending", false)).toEqual({ action: "convert" });
  });

  it("REFUSES a self-registered partner — pending WITH a user_id", () => {
    const decision = decidePartnerInvite("pending", true);
    expect(decision.action).toBe("reject");
    if (decision.action === "reject") {
      expect(decision.reason).toMatch(/registered themselves/i);
      // The admin is told what to do instead, not just "no".
      expect(decision.reason).toMatch(/resend/i);
    }
  });

  it("would otherwise have broken a login that already worked", () => {
    // The concrete harm: convert sets `invited` and KEEPS user_id. An invited row
    // with a user_id passes PartnerLogin's lookup and is refused by the RPC.
    // Asserting the refusal is what prevents that state being createable.
    expect(decidePartnerInvite("pending", true).action).not.toBe("convert");
  });

  it("defaults hasUserId to false, so an un-updated caller cannot silently convert", () => {
    // If a caller forgets the second argument it behaves as the application case,
    // which is the pre-existing behaviour — but partner-admin-invite passes it.
    expect(decidePartnerInvite("pending")).toEqual({ action: "convert" });
    expect(read("supabase/functions/partner-admin-invite/index.ts")).toMatch(
      /Boolean\(existingPartner\?\.user_id\)/
    );
  });

  it("still reads user_id, without which the distinction is impossible", () => {
    expect(read("supabase/functions/partner-admin-invite/index.ts")).toMatch(
      /\.select\("id, status, user_id"\)/
    );
  });

  it("never converts anything but a userless pending row", () => {
    for (const status of ALL_STATUSES) {
      for (const hasUserId of [true, false]) {
        const converts = decidePartnerInvite(status, hasUserId).action === "convert";
        expect(converts, `${status} / hasUserId=${hasUserId}`).toBe(
          status === "pending" && !hasUserId
        );
      }
    }
  });
});

// ── the login allowlist ────────────────────────────────────────────────────

describe("PartnerLogin refuses every non-active status", () => {
  it("gives `invited` its own actionable message — the status that used to slip through", () => {
    const message = partnerLoginRefusal("invited");
    expect(message).toMatch(/invitation/i);
    expect(message).toMatch(/set your password/i);
  });

  it("keeps the existing pending and suspended messages", () => {
    expect(partnerLoginRefusal("pending")).toMatch(/verification/i);
    expect(partnerLoginRefusal("suspended")).toMatch(/suspended/i);
  });

  it("refuses an unrecognised status rather than falling through", () => {
    // A fifth value added later must not become an accidental grant.
    const message = partnerLoginRefusal("something_new");
    expect(message).toMatch(/not active/i);
    expect(message.length).toBeGreaterThan(0);
  });

  it("returns a non-empty reason for every known status except active", () => {
    for (const status of ALL_STATUSES.filter((s) => s !== "active")) {
      expect(partnerLoginRefusal(status), status).toMatch(/\S/);
    }
  });

  it("the gate is an allowlist on active, not a list of bad statuses", () => {
    const src = read("src/pages/partner/PartnerLogin.tsx");
    expect(src).toMatch(/partner\.status !== "active"/);
    // The denylist that let `invited` through must be gone.
    expect(src).not.toMatch(/partner\.status === "pending"/);
    expect(src).not.toMatch(/partner\.status === "suspended"/);
  });

  it("uses the shared helper rather than inlining its own copy of the messages", () => {
    // The helper lives in src/lib because a component module that also exports a
    // function breaks Fast Refresh (react-refresh/only-export-components). That
    // split is only safe if the component still actually calls it.
    const src = read("src/pages/partner/PartnerLogin.tsx");
    expect(src).toMatch(/from "@\/lib\/partnerLoginRefusal"/);
    expect(src).toMatch(/partnerLoginRefusal\(partner\.status\)/);
  });

  it("signs the user out when refusing, so no half-authenticated state lingers", () => {
    const src = read("src/pages/partner/PartnerLogin.tsx");
    const refusal = src.slice(src.indexOf('partner.status !== "active"'));
    expect(refusal.slice(0, 200)).toMatch(/auth\.signOut\(\)/);
  });
});

// ── the misleading not-found message ───────────────────────────────────────

describe("the not-found message describes what actually happened", () => {
  it("no longer claims no account exists for the email", () => {
    // The lookup is by user_id. An application row HAS the email and no user_id, so
    // "no account for this email" was untrue for exactly the people most likely
    // to see it.
    const src = read("src/pages/partner/PartnerLogin.tsx");
    expect(src).not.toMatch(/No partner account found for this email/);
  });

  it("tells an applicant what to expect instead", () => {
    const src = read("src/pages/partner/PartnerLogin.tsx");
    expect(src).toMatch(/applied through the partner page/i);
    expect(src).toMatch(/invitation/i);
  });
});
