// @vitest-environment node
//
// ═══ "THE SECRET IS MISSING" IS THREE DIFFERENT PROBLEMS ══════════════════════
//
// Three dispatched rehearsal runs reported `STRIPE_TEST_KEY` unset. True, and useless: the same
// symptom is produced by a different NAME (one rename fixes it), an ORGANISATION secret whose
// repository-access list omits this repo, or an ENVIRONMENT secret — which no repository-level
// lookup can EVER see, because a job only gets those once it declares `environment:`.
//
// Only the first is visible from inside a job. This is what makes it visible, and what stops the
// report claiming to have looked everywhere when it cannot.
//
// THE PROPERTY THAT MATTERS MOST HERE IS A NEGATIVE ONE: no value, or any part of one, ever
// reaches the output. Not a prefix, not a length, not `sk_test` vs `sk_live` — a length narrows a
// brute force and a prefix names the account about to be charged. A CI log is public to anyone
// who can read the repository, and an uploaded artifact is not even masked.
import { describe, it, expect } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
const MOD = "../../scripts/ci/which-secrets.mjs";
const { presentNames, describe: report } = (await import(/* @vite-ignore */ MOD)) as any;

const NAMES = ["STRIPE_TEST_KEY", "STRIPE_SECRET_KEY_TEST", "STRIPE_SK_TEST"];
const SECRET = "sk_test_51abcdefghijklmnop";

describe("which names are set", () => {
  it("finds the ones with a value", () => {
    expect(presentNames(NAMES, { STRIPE_SK_TEST: SECRET })).toEqual(["STRIPE_SK_TEST"]);
  });

  // An unset secret mapped into env arrives as "", and a secret of spaces is a paste accident.
  it("treats empty and whitespace as not set, the way a mapped-but-unset secret arrives", () => {
    expect(presentNames(NAMES, { STRIPE_TEST_KEY: "", STRIPE_SK_TEST: "   " })).toEqual([]);
  });

  it("reports every name that is set, not just the first", () => {
    const present = presentNames(NAMES, { STRIPE_SECRET_KEY_TEST: SECRET, STRIPE_SK_TEST: SECRET });
    expect(present).toHaveLength(2);
  });
});

describe("the three answers are three different sentences", () => {
  it("says the expected name is set, and points at the step rather than the secret", () => {
    const msg = report(NAMES, ["STRIPE_TEST_KEY"], "STRIPE_TEST_KEY");
    expect(msg).toMatch(/is set/);
    expect(msg).toMatch(/the fault is in that step/);
  });

  // THE USEFUL CASE: it exists, under another name. That is a rename, not an investigation.
  it("names the alternative when the expected one is absent but another is set", () => {
    const msg = report(NAMES, ["STRIPE_SECRET_KEY_TEST"], "STRIPE_TEST_KEY");
    expect(msg).toMatch(/STRIPE_TEST_KEY is NOT set/);
    expect(msg).toMatch(/STRIPE_SECRET_KEY_TEST/);
    expect(msg).toMatch(/rename it/);
  });

  /* AND WHEN IT FINDS NOTHING IT MUST NOT CLAIM TO HAVE SEARCHED. A workflow cannot enumerate its
     own secrets, so a spelled-out candidate list proves only that those names are unset — and the
     two cases it is blind to are exactly the two that need a different screen. */
  it("admits what it cannot see rather than concluding the secret does not exist", () => {
    const msg = report(NAMES, [], "STRIPE_TEST_KEY");
    expect(msg).toMatch(/not a search/);
    expect(msg).toMatch(/may still exist under a name not on it/);
    expect(msg).toMatch(/ORGANISATION secret/);
    expect(msg).toMatch(/ENVIRONMENT secret/);
  });
});

describe("no value, or any part of one, ever reaches the output", () => {
  const cases: Array<[string, string[]]> = [
    ["expected set", ["STRIPE_TEST_KEY"]],
    ["another set", ["STRIPE_SECRET_KEY_TEST"]],
    ["none set", []],
  ];

  for (const [label, present] of cases) {
    it(`prints no part of the secret when ${label}`, () => {
      const msg = report(NAMES, present, "STRIPE_TEST_KEY");
      expect(msg).not.toContain(SECRET);
      // Not a prefix either: `sk_test_` says which account, `sk_live_` says it is the real one.
      expect(msg).not.toMatch(/sk_test_/);
      expect(msg).not.toMatch(/sk_live_/);
      // And not a length, which narrows a brute force.
      expect(msg).not.toContain(String(SECRET.length));
    });
  }

  it("returns names, never values, from the lookup itself", () => {
    const present = presentNames(NAMES, { STRIPE_TEST_KEY: SECRET });
    expect(present).toEqual(["STRIPE_TEST_KEY"]);
    expect(JSON.stringify(present)).not.toContain(SECRET);
  });
});
