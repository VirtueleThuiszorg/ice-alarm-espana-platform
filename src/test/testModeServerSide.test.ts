/**
 * Free-membership guard.
 *
 * The bug this pins: `submit-registration` took `testMode` straight from the
 * request body and handed it to `submit_registration_atomic`, which acts on it
 * by marking the payment completed, the order completed, the subscription
 * active with `registration_fee_paid = true`, and the member(s) active. A fully
 * paid-up membership, with a monitored device allocation, and no money taken.
 *
 * The function runs with `verify_jwt = false`. So once the site was public,
 * anyone who could read its JavaScript could POST that flag and mint one for
 * themselves — golden rule #4 (payments activate via webhook only), defeated by
 * a boolean.
 *
 * These are source-contract tests on the edge function, because the behaviour
 * they protect cannot be exercised from vitest: the decision happens inside a
 * Deno function talking to Postgres. A source contract that fails loudly on the
 * next edit is worth more here than no test at all.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const fn = readFileSync(join(ROOT, "supabase/functions/submit-registration/index.ts"), "utf8");

/** The `rpcPayload` object literal handed to submit_registration_atomic. */
function rpcPayload(): string {
  const start = fn.indexOf("const rpcPayload = {");
  expect(start, "submit-registration must build an rpcPayload").toBeGreaterThan(-1);
  const end = fn.indexOf("\n    };", start);
  expect(end, "rpcPayload literal must terminate").toBeGreaterThan(start);
  return fn.slice(start, end);
}

describe("test mode is decided by the server, never by the caller", () => {
  it("reads registration_test_mode_enabled from system_settings", () => {
    expect(
      fn,
      "the settings query must fetch the test-mode row alongside the pricing rows",
    ).toMatch(/registration_test_mode_enabled/);
    expect(fn).toMatch(/from\(\s*["']system_settings["']\s*\)/);
  });

  it("derives testMode from that row and nothing else", () => {
    expect(fn).toMatch(
      /const\s+testMode\s*=\s*settingsMap\.registration_test_mode_enabled\s*===\s*"true"/,
    );
  });

  it("FAILS CLOSED — anything but the exact string \"true\" means live mode", () => {
    // A strict === against "true" is what makes a missing row, a null, an empty
    // string or a failed query resolve to false, i.e. take the money. A truthy
    // check would make a missing row ambiguous and a typo'd row a giveaway.
    const line = fn.match(/const\s+testMode\s*=\s*[^;]+;/)?.[0] ?? "";
    expect(line, "test mode must be a strict string comparison").toContain('=== "true"');
    expect(line, "test mode must not fall back to the request body").not.toMatch(/body\./);
    expect(line, "test mode must not be a loose/truthy check").not.toMatch(/\|\||!!|Boolean\(/);
  });

  it("never passes the client's flag to the RPC that grants the membership", () => {
    const payload = rpcPayload();
    expect(payload, "rpcPayload must carry a testMode key").toMatch(/testMode/);
    expect(
      payload,
      "rpcPayload.testMode must be the server-derived value, not body.testMode",
    ).not.toMatch(/testMode:\s*body\.testMode/);
    expect(payload).not.toMatch(/testMode:\s*[^,\n]*body\./);
  });

  it("reads body.testMode only to log that it was ignored", () => {
    // The field stays accepted so an older client does not fail validation, but
    // every remaining mention must sit in the interface, a comment, or the
    // warning log — never in an assignment or a branch that changes behaviour.
    const offenders = fn
      .split("\n")
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /body\.testMode/.test(line))
      .filter(([, line]) => !/^\s*(\*|\/\/)/.test(line))
      .filter(([, line]) => !/console\.warn|`|!==\s*undefined|!==\s*testMode/.test(line));

    expect(
      offenders.map(([n, l]) => `${n}: ${l.trim()}`),
      "body.testMode must not be used for any decision",
    ).toEqual([]);
  });
});

describe("the RPC still treats test mode as the giveaway it is", () => {
  it("submit_registration_atomic activates on test mode — which is why the flag must be server-side", () => {
    // Not a regression guard on the RPC: a statement of why the guard above
    // matters. If this ever stops being true, the tests above can relax.
    const sql = readFileSync(
      join(ROOT, "supabase/migrations/20260302120000_submit_registration_atomic.sql"),
      "utf8",
    );
    expect(sql).toMatch(/IF\s+v_test_mode\s+THEN/);
    expect(sql).toMatch(/UPDATE members SET status = 'active'/);
    expect(sql).toMatch(/registration_fee_paid = true/);
  });
});

describe("the schema fails safe too", () => {
  it("members.status defaults to inactive, so an INSERT that forgets the column cannot activate", () => {
    // The application enforced golden rule #4 while the schema disagreed with
    // it: the column had defaulted to 'active' since the first migration, so
    // any insert that simply omitted it minted a monitored, billable member.
    const sql = readFileSync(
      join(ROOT, "supabase/migrations/20260902140000_members_default_inactive.sql"),
      "utf8",
    );
    expect(sql).toMatch(/ALTER COLUMN status SET DEFAULT 'inactive'/);
  });

  it("no client-side insert into members names status at all", () => {
    // Naming it is how the old default got laundered past review. If a surface
    // needs a state other than the default, it belongs in an edge function.
    const dash = readFileSync(
      join(ROOT, "src/components/partner/ResidentialDashboard.tsx"),
      "utf8",
    );
    expect(dash, "ResidentialDashboard must not set members.status").not.toMatch(
      /status:\s*["']active["']/,
    );
  });
});
