#!/usr/bin/env node
/**
 * CLI wrapper for the migration-drift gate. See scripts/migrationDrift.ts for the rule and why
 * it is "not while an earlier one is unapplied" rather than "never".
 *
 * Usage:  node scripts/check-migration-drift.mjs [baseRef]
 *   baseRef defaults to origin/main. Locally on main with nothing added, this is a no-op.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";
const MANIFEST = join(MIGRATIONS_DIR, "APPLIED_TO_PROD.txt");
const base = process.argv[2] || "origin/main";

const parseManifest = (contents) =>
  contents.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

if (!existsSync(MANIFEST)) {
  console.error(`✗ ${MANIFEST} is missing. It is the only record of what production has.`);
  process.exit(1);
}

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
  addedByPr = out.split("\n").map((l) => l.trim()).filter((l) => l.endsWith(".sql"))
    .map((l) => l.split("/").pop());
} catch {
  // No base ref (a shallow clone, or a fresh repo). Treat nothing as added, which makes the
  // gate STRICTER, never laxer: any pending migration then counts as pre-existing.
  console.warn(`! could not diff against ${base}; treating this PR as adding nothing (strict).`);
}

const appliedSet = new Set(applied);
const repoSet = new Set(repoMigrations);
const addedSet = new Set(addedByPr);
const pending = repoMigrations.filter((m) => !appliedSet.has(m)).sort();
const preExisting = pending.filter((m) => !addedSet.has(m));
const phantom = applied.filter((m) => !repoSet.has(m)).sort();

console.log(`repo: ${repoMigrations.length} migrations · manifest: ${applied.length} applied`);
console.log(`this PR adds: ${addedByPr.length ? addedByPr.join(", ") : "(none)"}`);
console.log(`pending: ${pending.length ? pending.join(", ") : "(none)"}`);

if (phantom.length) {
  console.error(`\n✗ MANIFEST/REPO MISMATCH — listed as applied but absent from the repo:`);
  for (const m of phantom) console.error(`    - ${m}`);
  console.error(`\n  Production may hold a change no file describes.`);
  process.exit(1);
}

if (preExisting.length) {
  console.error(`\n✗ MIGRATION DRIFT — ${preExisting.length} migration(s) in main are NOT applied to production:`);
  for (const m of preExisting) console.error(`    - ${m}`);
  console.error(`\n  This PR adds ${addedByPr.length} more on top of them.`);
  console.error(`  Run \`supabase db push\`, record the filenames in ${MANIFEST}, merge that first.`);
  console.error(`  Stacking a second unapplied migration is how production fell 24 behind.`);
  process.exit(1);
}

console.log(pending.length ? `\n✓ ${pending.length} pending, all added by this PR — allowed.`
                           : `\n✓ production is level with the repo.`);
