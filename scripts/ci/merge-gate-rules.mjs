/**
 * The rule the merge gate has to satisfy, as a PURE FUNCTION over what GitHub reports.
 *
 * Separated from `check-merge-gate.mjs` so it can be tested without a network call, against
 * fixtures for every way the gate can be wrong. A checker that is only ever exercised against a
 * correctly-configured repository is a checker nobody has watched refuse anything — the same
 * argument `ciJobIsolation.test.ts` makes about `continue-on-error`.
 */

/**
 * The six jobs that must pass before a merge. Exactly the names GitHub reports as check contexts,
 * copied from a real pull request's check runs (#375).
 *
 * `Manifest matches production` is DELIBERATELY ABSENT and must stay absent. It is
 * `if: github.event_name == 'push'`, so on a pull request it reports `skipped` — and a required
 * check that never reports leaves every PR pending for ever, which would stop all merging rather
 * than stopping bad merging.
 *
 * The Vercel checks are absent too: they are red on every PR today because the account is at its
 * free-tier deploy cap, and a gate that is always red is a gate that gets bypassed.
 */
export const REQUIRED_CHECKS = [
  "Tests",
  "Lint, Type Check & Build",
  "Wiring register",
  "Cross-tenant isolation",
  "Security Audit",
  "Migration drift gate",
];

/**
 * @param {Array<{type: string, parameters?: any}>} rules  the body of
 *        GET /repos/{owner}/{repo}/rules/branches/{branch}
 * @returns {{ok: boolean, problems: string[], report: string[]}}
 */
export function evaluateMergeGate(rules) {
  const problems = [];
  const report = [];
  const list = Array.isArray(rules) ? rules : [];
  const has = (type) => list.some((r) => r && r.type === type);

  // THE EMPTY CASE IS THE ONE THAT ACTUALLY HAPPENED, and it is worth its own message: a ruleset
  // that exists but is disabled — or whose target list does not include this branch — produces
  // exactly this. "There is a ruleset" and "the branch is protected" are different claims.
  if (list.length === 0) {
    problems.push("no rules apply to this branch at all");
    report.push(
      "- ❌ **Nothing applies to this branch.** A ruleset may exist and be disabled, or may target " +
        "no branch — either way the branch is unprotected."
    );
    return { ok: false, problems, report };
  }

  for (const [type, label] of [
    ["pull_request", "a pull request is required before merging"],
    ["non_fast_forward", "force pushes are blocked"],
    ["deletion", "deletion is blocked"],
  ]) {
    if (has(type)) report.push(`- ✅ ${label}`);
    else {
      problems.push(`missing rule: ${type}`);
      report.push(`- ❌ **${label}** — no \`${type}\` rule`);
    }
  }

  const statusRule = list.find((r) => r && r.type === "required_status_checks");
  if (!statusRule) {
    problems.push("no required_status_checks rule — a red check blocks nothing");
    report.push(
      "- ❌ **No required status checks.** This is the rule that makes a red check block a merge; " +
        "without it the others only shape *how* a merge happens, never *whether*."
    );
    return { ok: false, problems, report };
  }

  const configured = (statusRule.parameters?.required_status_checks ?? [])
    .map((c) => (typeof c === "string" ? c : c?.context))
    .filter(Boolean);

  const missing = REQUIRED_CHECKS.filter((c) => !configured.includes(c));
  if (missing.length) {
    problems.push(`required checks not enforced: ${missing.join(", ")}`);
    report.push(`- ❌ **Not enforced:** ${missing.map((m) => `\`${m}\``).join(", ")}`);
  } else {
    report.push(`- ✅ all ${REQUIRED_CHECKS.length} required checks are enforced`);
  }

  // A check that is required but never reports would stop every merge. Named explicitly so that
  // "helpfully" adding it is caught here rather than discovered by a PR that can never merge.
  if (configured.includes("Manifest matches production")) {
    problems.push(
      "`Manifest matches production` is required, but it is push-only and reports `skipped` on " +
        "every PR — no pull request can ever merge while it is in this list"
    );
    report.push(
      "- ❌ **`Manifest matches production` must not be required.** It is `push`-only, so it " +
        "reports `skipped` on a PR, and nothing can merge."
    );
  }

  return { ok: problems.length === 0, problems, report };
}
