/**
 * A refusal must describe what actually happened.
 *
 * `partner-register` refused every duplicate email with "A partner with this email
 * already exists" — true, and useless. The largest group who hit it are people who
 * applied at /partner minutes earlier: PARTNER_JOURNEY.md §6 records the flow where
 * the thank-you page used to send them straight into this 409 after 23 more fields,
 * an IBAN and a password. That link has been relocated, but anyone who reaches
 * /partner/join by URL, bookmark or memory still lands here — and being told their
 * email is "taken" reads as a rejection of something they just did successfully.
 *
 * The row already carries everything needed to tell the cases apart:
 *   partner-apply  (/partner)      → status='pending', NO user_id  (an application)
 *   partner-register (/partner/join) → status='pending', WITH user_id (a registration)
 *
 * the same distinction `decidePartnerInvite` depends on. This is a wording change
 * only — `partner-register` still refuses, per Lee's decision not to let it complete
 * existing applications.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const FN = "supabase/functions/partner-register/index.ts";

describe("the refusal distinguishes an applicant from an account holder", () => {
  it("reads user_id and status, without which the cases are identical", () => {
    expect(read(FN)).toMatch(/\.select\("id, status, user_id"\)/);
  });

  it("recognises an unclaimed application: pending AND no user_id", () => {
    expect(read(FN)).toMatch(
      /status === "pending" && !existingPartner\.user_id/
    );
  });

  it("tells an applicant their application is in hand, not that they are rejected", () => {
    const src = read(FN);
    expect(src).toMatch(/already applied/i);
    expect(src).toMatch(/invitation/i);
    // The actionable part: they should stop trying, not retry with another email.
    expect(src).toMatch(/nothing more you need to do/i);
  });

  it("tells an existing account holder to sign in instead", () => {
    const src = read(FN);
    expect(src).toMatch(/sign in instead/i);
    expect(src).toMatch(/password reset/i);
  });

  it("handles a suspended partner separately from both", () => {
    expect(read(FN)).toMatch(/suspended partner account/i);
  });

  it("no longer sends the bare email-exists message to everyone", () => {
    // The exact string that was previously returned for all three cases.
    expect(read(FN)).not.toMatch(/"A partner with this email already exists"/);
  });

  it("still refuses — this is wording, not a flow change", () => {
    // Lee's decision: do NOT make partner-register complete existing applications.
    // The status code must stay 409 and no partner row may be written here.
    const src = read(FN);
    const block = src.slice(src.indexOf("if (existingPartner)"));
    expect(block.slice(0, 1400)).toMatch(/status: 409/);
    expect(block.slice(0, 1400)).not.toMatch(/\.update\(|\.insert\(/);
  });

  it("flags the applicant case in the payload, not only in prose", () => {
    // So the client can branch without string-matching a human sentence.
    expect(read(FN)).toMatch(/already_applied: isUnclaimedApplication/);
  });
});
