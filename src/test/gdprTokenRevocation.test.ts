/**
 * A GDPR erasure must not leave a live access path behind.
 *
 * `member_update_tokens` rows carry a bearer token granting read AND write access
 * to a member's profile, medical information and emergency contacts, with no
 * second factor — whoever holds the email holds the data.
 *
 * The table declares `member_id ... ON DELETE CASCADE`, which looks like it covers
 * this. It does not: `gdpr-delete-member` ANONYMISES the member row rather than
 * deleting it ("keep for referential integrity"), so the cascade never fires. An
 * unexpired token issued shortly before an erasure request stayed valid
 * afterwards and still resolved to that member.
 *
 * These are source-level assertions in the style this repo already uses for edge
 * functions (see partnerStatusAllowlist / auth). The behaviour itself is not
 * unit-testable without a live GoTrue + PostgREST; what IS testable, and what
 * actually regressed, is whether the deletion sequence touches the table at all.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const FN = "supabase/functions/gdpr-delete-member/index.ts";
const TOKEN_MIGRATION = "supabase/migrations/20260127152647_def78f3b-d82c-4c3d-8e4b-95875ce69235.sql";

describe("GDPR erasure revokes outstanding update tokens", () => {
  it("touches member_update_tokens at all — the regression being pinned", () => {
    expect(read(FN)).toMatch(/from\("member_update_tokens"\)/);
  });

  it("deletes them, scoped to the erased member", () => {
    const src = read(FN);
    const block = src.slice(src.indexOf('from("member_update_tokens")'));
    expect(block.slice(0, 200)).toMatch(/\.delete\(/);
    expect(block.slice(0, 300)).toMatch(/\.eq\("member_id", memberId\)/);
  });

  it("fails loudly rather than continuing with a live token", () => {
    // Silent catch-and-continue on this step would leave the exact access path
    // the step exists to close (GOALS.md G2).
    const src = read(FN);
    expect(src).toMatch(/GDPR deletion aborted: update tokens could not be revoked/);
  });

  it("does not log the token value", () => {
    // The row holds the bearer secret. Logging it would move the leak rather
    // than close it.
    const src = read(FN);
    const block = src.slice(src.indexOf('from("member_update_tokens")'));
    expect(block.slice(0, 800)).not.toMatch(/\btoken\s*[,:)]|\$\{token\}/);
  });
});

describe("why the cascade does not cover this", () => {
  it("the table does declare ON DELETE CASCADE", () => {
    expect(read(TOKEN_MIGRATION)).toMatch(
      /member_id UUID NOT NULL REFERENCES public\.members\(id\) ON DELETE CASCADE/
    );
  });

  it("but the function anonymises the member instead of deleting it", () => {
    // Both halves matter. If erasure ever switches to a real DELETE the cascade
    // would cover tokens — but it does not today, and this test records why the
    // explicit revocation is required rather than redundant.
    const src = read(FN);
    expect(src).toMatch(/from\("members"\)\s*\n\s*\.update\(/);
    expect(src).not.toMatch(/from\("members"\)\s*\n\s*\.delete\(/);
  });
});
