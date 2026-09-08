#!/usr/bin/env node
/**
 * CLI wrapper for the migration-drift gate. See scripts/migrationDrift.mjs for the rule, which
 * has two halves: any pending migration FAILS main, while on a PR only STACKING one on top of a
 * pending one fails — a PR that adds none passes with a warning.
 *
 * Usage:  node scripts/check-migration-drift.mjs [baseRef] [--main|--pr]
 *   baseRef defaults to origin/main.
 *   --main / --pr says which half applies. CI passes it from `github.event_name`; without it,
 *   the base and head commits decide (see resolveContext).
 *
 * The rule itself lives in migrationDrift.mjs and is IMPORTED here, not re-implemented. It used
 * to be both: a .ts module the unit tests exercised, and a hand-written copy of the same
 * comparisons in this file, which is two places to change and one of them untested. The module is
 * plain JS with JSDoc types for exactly this reason — CI runs Node 20, which cannot import a .ts
 * file, and a rule that can only be tested where it is not executed is not tested.
 */
import { readFileSync, readdirSync, existsSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { computeDrift, parseManifest, resolveContext } from "./migrationDrift.mjs";

const MIGRATIONS_DIR = "supabase/migrations";
const MANIFEST = join(MIGRATIONS_DIR, "APPLIED_TO_PROD.txt");
const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--")) || "origin/main";

if (!existsSync(MANIFEST)) {
  console.error(`✗ ${MANIFEST} is missing. It is the only record of what production has.`);
  process.exit(1);
}

const rev = (ref) => {
  try {
    return execSync(`git rev-parse ${ref}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};

const repoMigrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
const applied = parseManifest(readFileSync(MANIFEST, "utf8"));

let addedByPr = [];
try {
  // Three-dot: only files this branch added relative to the merge base, so a migration that
  // landed on main after the branch was cut is not miscounted as ours.
  const out = execSync(`git diff --name-only --diff-filter=A ${base}...HEAD -- ${MIGRATIONS_DIR}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  addedByPr = out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".sql"))
    .map((l) => l.split("/").pop());
} catch {
  // No base ref (a shallow clone, or a fresh repo). Treat nothing as added, which makes the
  // gate STRICTER, never laxer: any pending migration then counts as pre-existing.
  console.warn(`! could not diff against ${base}; treating this branch as adding nothing (strict).`);
}

const { onMain, how } = resolveContext(args, { base: rev(base), head: rev("HEAD") });
const result = computeDrift({ repoMigrations, applied, addedByPr, onMain });

console.log(`repo: ${repoMigrations.length} migrations · manifest: ${applied.length} applied`);
console.log(`context: ${onMain ? "main" : "pull request"} (${how})`);
console.log(`this branch adds: ${addedByPr.length ? addedByPr.join(", ") : "(none)"}`);
console.log(`pending: ${result.pending.length ? result.pending.join(", ") : "(none)"}`);

/** GitHub Actions annotation + job summary, so a warning is not just a line in 600 of log. */
const annotate = (level, title, body) => {
  if (process.env.GITHUB_ACTIONS) {
    // One line, per the annotation format; the multi-line detail goes to the summary instead.
    console.log(`::${level} title=${title}::${body.split("\n")[0]}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const icon = level === "warning" ? "🟠" : "🔴";
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## ${icon} ${title}\n\n\`\`\`\n${body}\n\`\`\`\n`,
    );
  }
};

if (!result.ok) {
  const title = result.phantom.length
    ? "MANIFEST/REPO MISMATCH"
    : onMain
      ? "MIGRATION DRIFT on main"
      : "MIGRATION STACKING";
  console.error(`\n✗ ${title}\n`);
  console.error(result.reason);
  annotate("error", title, result.reason);
  process.exit(1);
}

if (result.warning) {
  // PASSES. Loudly: the pending migration is real and somebody has to push it — it is just not
  // this PR's to fix, and failing every unrelated PR is what made the gate a merge freeze.
  console.warn(`\n⚠ MIGRATION PENDING — not this PR's, so this gate PASSES\n`);
  console.warn(result.warning);
  annotate("warning", "Migration pending on main (this PR adds none)", result.warning);
  process.exit(0);
}

console.log(`\n✓ ${result.reason}`);
