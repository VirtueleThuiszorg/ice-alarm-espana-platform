// @vitest-environment node
//
// `submit_registration_atomic` is ~500 lines of PL/pgSQL and it is the whole registration
// transaction: members, medical rows, contacts, subscription, order, order items, payment,
// attribution. 20260908120500 replaces it to fix one expression (REVIEW_JOIN_PATH.md F17, the
// order-number collision) and to pin `search_path` on a SECURITY DEFINER function.
//
// You cannot patch a line of a function body — a replacement is the whole statement. So the new
// migration was GENERATED from the old one, and this is the test that says so: the only
// differences between the two definitions are the two intended ones. Without it, "I copied 500
// lines and changed two" is a claim nobody can check, and a dropped INSERT in the middle of a
// registration transaction is exactly the kind of defect that would ship green.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase/migrations");

const OLD = "20260302120000_submit_registration_atomic.sql";
const NEW = "20260908120500_order_number_sequence.sql";

/** The `CREATE OR REPLACE FUNCTION … $$ … $$;` statement, from the first line to the last. */
function functionStatement(file: string): string {
  const sql = readFileSync(join(MIGRATIONS, file), "utf8");
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION");
  expect(start, `no CREATE OR REPLACE FUNCTION in ${file}`).toBeGreaterThan(-1);
  const body = sql.slice(start);
  expect(body.trimEnd().endsWith("$$;"), `${file} does not end with the function`).toBe(true);
  return body.trimEnd();
}

/** Non-empty, non-comment lines — the code, without the prose that explains it. */
function codeLines(statement: string): string[] {
  return statement
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "" && !l.trim().startsWith("--"));
}

describe("20260908120500 replaces submit_registration_atomic with SEVEN edits and no others", () => {
  const before = codeLines(functionStatement(OLD));
  const after = codeLines(functionStatement(NEW));

  it("both definitions were found and are substantial", () => {
    // Guards against a slice that silently matched almost nothing, which would make every
    // assertion below vacuous.
    expect(before.length).toBeGreaterThan(300);
    expect(after.length).toBeGreaterThan(300);
  });

  it("the ONLY removed lines are the seven the header names", () => {
    const removed = before.filter((l) => !after.includes(l));
    // In file order. Each one is an edit the migration header names, and there is nothing else.
    expect(removed).toEqual([
      // the unqualified header
      "CREATE OR REPLACE FUNCTION submit_registration_atomic(payload JSONB)",
      // text into an enum column: members.preferred_language, primary and partner
      "    v_primary->>'preferredLanguage',",
      "      v_partner->>'preferredLanguage',",
      // subscriptions.plan_type / billing_frequency / payment_method, primary and partner
      "    v_primary_member_id, v_membership_type, v_billing_frequency,",
      "    v_include_pendant, false, 'pending', v_active_gateway",
      "      v_partner_member_id, v_membership_type, v_billing_frequency,",
      "      v_include_pendant, false, 'pending', v_active_gateway",
      // the colliding order number
      "  v_order_number := 'ICE-' || UPPER(TO_HEX(EXTRACT(EPOCH FROM v_now)::BIGINT));",
      // payments.payment_method
      "    v_total, 'order', v_active_gateway, 'pending'",
    ]);
  });

  it("the ONLY added lines are their replacements", () => {
    const added = after.filter((l) => !before.includes(l));
    // `v_primary_member_id,` and `v_partner_member_id,` are NOT here, and that is correct:
    // those exact lines already appear elsewhere in the original, so splitting the VALUES list
    // across lines did not introduce a new one. This is set membership, deliberately — the
    // ORDER assertion below is what catches a line that moved.
    expect(added).toEqual([
      "CREATE OR REPLACE FUNCTION public.submit_registration_atomic(payload JSONB)",
      "SET search_path = public",
      "    COALESCE(NULLIF(v_primary->>'preferredLanguage', ''), 'en')::public.preferred_language,",
      "      COALESCE(NULLIF(v_partner->>'preferredLanguage', ''), 'en')::public.preferred_language,",
      "    v_membership_type::public.plan_type,",
      "    v_billing_frequency::public.billing_frequency,",
      "    v_include_pendant, false, 'pending',",
      "    v_active_gateway::public.payment_method",
      "      v_membership_type::public.plan_type,",
      "      v_billing_frequency::public.billing_frequency,",
      "      v_include_pendant, false, 'pending',",
      "      v_active_gateway::public.payment_method",
      "  v_order_number := 'ICE-' || TO_CHAR(v_now, 'YYYYMMDD') || '-'",
      "                    || LPAD(nextval('public.order_number_seq')::TEXT, 5, '0');",
      "    v_total, 'order', v_active_gateway::public.payment_method, 'pending'",
    ]);
  });

  it("every other line is in the same ORDER, not merely present", () => {
    // A set comparison would pass if two INSERTs had swapped places — which in this function
    // means writing a child row before its parent, or the payment before the order.
    const touched = (l: string) =>
      l.includes("CREATE OR REPLACE FUNCTION") ||
      l.includes("SET search_path") ||
      l.includes("v_order_number := ") ||
      l.includes("LPAD(nextval") ||
      l.includes("preferredLanguage") ||
      l.includes("v_membership_type") ||
      l.includes("v_billing_frequency") ||
      l.includes("v_active_gateway") ||
      l.includes("v_include_pendant, false, 'pending'") ||
      l.includes("v_primary_member_id,") ||
      l.includes("v_partner_member_id,") ||
      l.includes("'order', v_active_gateway");
    expect(after.filter((l) => !touched(l))).toEqual(before.filter((l) => !touched(l)));
  });

  it("every enum column fed from a variable is CAST — none was missed", () => {
    // The five that raised, one at a time, when the harness first called this function. Named
    // rather than counted, so a sixth added later is a failure here and not a runtime error in
    // front of a customer.
    const sql = functionStatement(NEW);
    for (const cast of [
      "::public.preferred_language",
      "::public.plan_type",
      "::public.billing_frequency",
      "::public.payment_method",
    ]) {
      expect(sql, `${cast} is missing`).toContain(cast);
    }
    // payment_method is fed in three places: two subscriptions inserts and the payments insert.
    expect(sql.split("::public.payment_method").length - 1).toBe(3);
    // preferred_language in two: primary and partner.
    expect(sql.split("::public.preferred_language").length - 1).toBe(2);
  });

  it("no bare text variable is left feeding an enum column", () => {
    const code = codeLines(functionStatement(NEW)).join("\n");
    expect(code).not.toContain("'pending', v_active_gateway\n");
    expect(code).not.toMatch(/v_membership_type, v_billing_frequency/);
    expect(code).not.toMatch(/v_primary->>'preferredLanguage',\s*$/m);
  });

  it("the whole registration transaction is still in there", () => {
    // Named, not counted. If the generation ever drops a statement, this says which.
    const sql = functionStatement(NEW);
    for (const fragment of [
      "INSERT INTO members",
      "INSERT INTO medical_information",
      "INSERT INTO emergency_contacts",
      "INSERT INTO subscriptions",
      "INSERT INTO orders",
      "INSERT INTO order_items",
      "INSERT INTO payments",
      "RETURN jsonb_build_object",
    ]) {
      expect(sql, `${fragment} is missing from the replacement`).toContain(fragment);
    }
  });
});

describe("the order number itself", () => {
  const sql = functionStatement(NEW);
  // CODE only. The replacement's comment quotes the expression it replaced — deliberately, so a
  // reader sees what changed — and a `not.toContain` over the raw text therefore failed on the
  // prose rather than on the code. Seventh time this repo has taught me that lesson.
  const code = codeLines(functionStatement(NEW)).join("\n");
  const migration = readFileSync(join(MIGRATIONS, NEW), "utf8");

  it("comes from a sequence, which cannot collide", () => {
    expect(code).toContain("nextval('public.order_number_seq')");
    expect(code).not.toContain("TO_HEX(EXTRACT(EPOCH");
  });

  it("and the replaced expression is still QUOTED in a comment, for the next reader", () => {
    // Not decoration: "why is this not the obvious one-liner" is the question a future editor
    // will have, and the answer is a rolled-back registration.
    expect(sql).toContain("TO_HEX(EXTRACT(EPOCH");
  });

  it("the sequence is created by the same migration that uses it", () => {
    expect(migration).toMatch(/CREATE SEQUENCE IF NOT EXISTS public\.order_number_seq/);
  });

  it("is zero-padded, so numbers sort and read consistently", () => {
    expect(sql).toContain("LPAD(nextval('public.order_number_seq')::TEXT, 5, '0')");
  });

  it("carries the date, because somebody reads it out on the phone", () => {
    expect(sql).toContain("TO_CHAR(v_now, 'YYYYMMDD')");
  });

  it("is REVOKED from the client roles — nextval() from the browser would burn numbers", () => {
    // Supabase's default privileges grant USAGE on new sequences in `public` to anon and
    // authenticated, so creating one is not enough: it has to be taken away. The harness mirrors
    // those defaults, which is how the first version of this assertion (claiming it was already
    // unreachable) failed.
    expect(migration).toMatch(
      /REVOKE ALL ON SEQUENCE public\.order_number_seq FROM anon, authenticated;/,
    );
    expect(migration).toMatch(/GRANT USAGE ON SEQUENCE public\.order_number_seq TO service_role;/);
  });
});

describe("the SECURITY DEFINER hardening", () => {
  it("the replacement pins search_path; the original did not", () => {
    expect(functionStatement(NEW)).toContain("SET search_path = public");
    expect(functionStatement(OLD)).not.toContain("SET search_path");
  });

  it("it is still SECURITY DEFINER — the function must outrank its caller", () => {
    // It writes tables the anon role cannot touch. Dropping DEFINER would break registration
    // rather than secure it, so this pins that the hardening did not overshoot.
    expect(functionStatement(NEW)).toContain("SECURITY DEFINER");
  });
});
