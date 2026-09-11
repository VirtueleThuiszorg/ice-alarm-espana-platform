// @vitest-environment node
//
// THE CHECKER THAT WATCHES THE MERGE GATE, DRIVEN AGAINST EVERY WAY THE GATE CAN BE WRONG.
//
// A branch ruleset named `main` was created on 2026-07-16 and left `enforcement: disabled`. It
// stayed off through the outages of 23 and 25 July and the broken main of 11 September — all three
// a red guard test merged past. Nothing anywhere went red to say the protection was off, because
// an unprotected branch behaves exactly like a branch whose protection nobody switched on.
//
// `scripts/ci/check-merge-gate.mjs` turns that silence into a CI failure. This suite is what makes
// the checker itself trustworthy: it is exercised against the shapes GitHub actually returns,
// including the one that really happened (an empty array), rather than only against a correct
// configuration. A checker only ever run against a healthy repo has never been seen to refuse
// anything, which is the argument ciJobIsolation.test.ts makes about checks that cannot fail.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evaluateMergeGate, REQUIRED_CHECKS } from "../../scripts/ci/merge-gate-rules.mjs";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** A ruleset response with every rule correct — the state we want the repository to be in. */
const healthy = () => [
  { type: "deletion" },
  { type: "non_fast_forward" },
  { type: "pull_request", parameters: { allowed_merge_methods: ["merge", "squash", "rebase"] } },
  {
    type: "required_status_checks",
    parameters: { required_status_checks: REQUIRED_CHECKS.map((context) => ({ context })) },
  },
];

describe("the merge gate checker", () => {
  it("passes only when every rule is in place", () => {
    const v = evaluateMergeGate(healthy());
    expect(v.problems).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("THE CASE THAT ACTUALLY HAPPENED: an empty array is 'unprotected', not 'fine'", () => {
    // A disabled ruleset, or one whose target list does not include this branch, returns []. Both
    // were true of ruleset 19055263. A checker that read the ruleset DEFINITION would have seen a
    // well-formed object and said nothing; this endpoint answers what actually applies.
    const v = evaluateMergeGate([]);
    expect(v.ok).toBe(false);
    expect(v.problems.join(" ")).toContain("no rules apply");
  });

  it("a non-array (a GitHub error body, say) is treated as unprotected", () => {
    // Not knowing is not the same as being fine, and must never read as being fine.
    expect(evaluateMergeGate(undefined as never).ok).toBe(false);
    expect(evaluateMergeGate({ message: "Not Found" } as never).ok).toBe(false);
  });

  it("rules present but NO required-status-checks rule fails — that is the whole point", () => {
    // Exactly the shape of ruleset 19055263: deletion, non_fast_forward and pull_request, and
    // nothing that makes a red check matter.
    const v = evaluateMergeGate(healthy().filter((r) => r.type !== "required_status_checks"));
    expect(v.ok).toBe(false);
    expect(v.problems.join(" ")).toContain("no required_status_checks");
  });

  it.each(REQUIRED_CHECKS)("fails when %s is dropped from the required list", (dropped) => {
    const rules = healthy().map((r) =>
      r.type === "required_status_checks"
        ? {
            ...r,
            parameters: {
              required_status_checks: REQUIRED_CHECKS.filter((c) => c !== dropped).map((context) => ({
                context,
              })),
            },
          }
        : r
    );
    const v = evaluateMergeGate(rules);
    expect(v.ok).toBe(false);
    expect(v.problems.join(" ")).toContain(dropped);
  });

  it.each(["pull_request", "non_fast_forward", "deletion"])(
    "fails when the %s rule is removed",
    (type) => {
      const v = evaluateMergeGate(healthy().filter((r) => r.type !== type));
      expect(v.ok).toBe(false);
      expect(v.problems.join(" ")).toContain(type);
    }
  );

  it("REFUSES `Manifest matches production` as a required check — it would stop ALL merging", () => {
    // It is `if: github.event_name == 'push'`, so it reports `skipped` on a pull request, and a
    // required check that never reports leaves every PR pending for ever. Adding it looks helpful
    // and would lock the repository solid, so the checker names it rather than waiting for
    // somebody to discover it with a PR that cannot merge.
    const rules = healthy().map((r) =>
      r.type === "required_status_checks"
        ? {
            ...r,
            parameters: {
              required_status_checks: [
                ...REQUIRED_CHECKS.map((context) => ({ context })),
                { context: "Manifest matches production" },
              ],
            },
          }
        : r
    );
    const v = evaluateMergeGate(rules);
    expect(v.ok).toBe(false);
    expect(v.problems.join(" ")).toContain("push-only");
  });

  it("accepts the string form of a context, because GitHub has returned both", () => {
    const rules = healthy().map((r) =>
      r.type === "required_status_checks"
        ? { ...r, parameters: { required_status_checks: REQUIRED_CHECKS } }
        : r
    );
    expect(evaluateMergeGate(rules).ok).toBe(true);
  });
});

describe("the checker is wired in, and cannot pass by doing nothing", () => {
  it("has its own CI job, not a step inside another", () => {
    // CLAUDE.md: each gate gets its own job, because a failing step marks every later step
    // `skipped`, and `skipped` is not red.
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain("scripts/ci/check-merge-gate.mjs");
    expect(ci).toMatch(/merge-gate:\s*\n\s*name:/);
  });

  it("fails when it cannot read the answer, rather than passing", () => {
    const src = read("scripts/ci/check-merge-gate.mjs");
    // No token, a non-200, or an unreadable body must all exit non-zero.
    expect(src).toContain("GITHUB_TOKEN is not set");
    expect(src).toContain("if (!res.ok)");
    expect(src).not.toMatch(/continue-on-error/);
    // It reads the rules that APPLY, not the ruleset definition — the distinction the disabled
    // ruleset turned into two months of false safety.
    expect(src).toContain("/rules/branches/");
  });

  it("every required name is produced by a job in SOME workflow", () => {
    // If a job is renamed, the ruleset silently stops requiring it — GitHub matches the check by
    // its string name, and a required check that nothing produces never reports, which blocks
    // every merge. This pins the two together in both directions.
    //
    // ALL workflows, not just ci.yml: `Cross-tenant isolation` is defined in rls-isolation.yml,
    // and an assertion against ci.yml alone would have been wrong about the one gate that proves
    // RLS holds. Found by running it.
    const dir = ".github/workflows";
    const all = readdirSync(join(ROOT, dir))
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => read(join(dir, f)))
      .join("\n");
    for (const name of REQUIRED_CHECKS) {
      expect(all, `no workflow job produces the check "${name}"`).toContain(`name: ${name}`);
    }
  });
});
