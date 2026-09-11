#!/usr/bin/env node
/**
 * IS THE MERGE GATE ACTUALLY ON?
 *
 * WHY THIS EXISTS. A branch ruleset named `main` was created on 2026-07-16 and left
 * `enforcement: disabled`. Nobody noticed for nearly two months — through the outages of 23 and
 * 25 July and the broken main of 11 September, all three of which were a red guard merged past.
 * A protection that can be switched off silently is a protection nobody can rely on, and the
 * repository gives no signal at all when it is off: `main` simply behaves as though it were never
 * protected.
 *
 * So the state of the gate becomes a CI check, for the same reason `check-manifest-truth.mjs`
 * exists: a fact nobody is looking at is a fact that drifts. If somebody disables the ruleset,
 * narrows its target, drops a required check or removes the Actions bypass, this goes red on the
 * next push instead of in two months' time.
 *
 * WHAT IT READS. `GET /repos/{owner}/{repo}/rules/branches/main` — the endpoint that answers
 * "what rules actually apply to this branch right now", which is the question that matters. It is
 * not the ruleset definition: a ruleset that exists but is disabled, or whose target list does not
 * include the default branch, contributes NOTHING here and returns an empty array. Both of those
 * were true of ruleset 19055263, which is exactly why reading the definition would have been the
 * wrong check.
 *
 * READ-ONLY. It never writes, and it needs no more than the `GITHUB_TOKEN` the workflow already
 * has.
 */

import { evaluateMergeGate, REQUIRED_CHECKS } from "./merge-gate-rules.mjs";

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const branch = process.env.MERGE_GATE_BRANCH || "main";

if (!repo) {
  console.error("::error title=No repository::GITHUB_REPOSITORY is not set.");
  process.exit(1);
}
if (!token) {
  // Per CLAUDE.md: a required secret that is absent FAILS its job. It never skips the work and
  // reports green — that hole is how a syntax error and a dropped security fix both landed.
  console.error(
    "::error title=No token::GITHUB_TOKEN is not set, so the merge gate cannot be read. " +
      "This job fails rather than passing having checked nothing."
  );
  process.exit(1);
}

const res = await fetch(`https://api.github.com/repos/${repo}/rules/branches/${branch}`, {
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  },
});

if (!res.ok) {
  console.error(
    `::error title=Could not read the branch rules::GitHub answered ${res.status} for ` +
      `/repos/${repo}/rules/branches/${branch}. Not knowing whether the gate is on is treated as ` +
      `the gate being off.`
  );
  process.exit(1);
}

const rules = await res.json();
const verdict = evaluateMergeGate(rules);

console.log(`## Is the merge gate on?\n`);
console.log(`Branch: \`${branch}\` · rules applying: **${rules.length}**\n`);

for (const line of verdict.report) console.log(line);

if (verdict.ok) {
  console.log(`\nThe merge gate is enforced. A red required check cannot be merged past.`);
  process.exit(0);
}

console.log("");
console.error(
  "::error title=The merge gate is NOT enforced::" +
    verdict.problems.join(" · ") +
    " — see PENDING_FOR_LEE.md section 2, S16. Until this passes, 'never merge red' is enforced " +
    "by discipline alone, and that has failed three times: 23 July, 25 July and 11 September."
);
console.error(
  `Required checks expected: ${REQUIRED_CHECKS.join(", ")}`
);
process.exit(1);
