/**
 * The CLI `migrate.yml` calls after `supabase db push`.
 *
 * Reads the two `supabase migration list --linked` captures, works out what production actually
 * gained, appends exactly those filenames to `APPLIED_TO_PROD.txt`, and writes the job summary.
 *
 *     node scripts/ci/record-applied-migrations.mjs \
 *       --before /tmp/before.txt --after /tmp/after.txt [--run-url URL] [--dry-run]
 *
 * EXIT CODES ARE THE POINT:
 *   0  the manifest now matches production
 *   1  something is wrong that a human must see — production applied a version this repo has no
 *      file for, or a migration present before the push is missing after it. The manifest is
 *      STILL written in this case, because a partial push really did apply migrations and
 *      leaving them unrecorded is the one direction of error that hides drift.
 *
 * It never receives a secret. The workflow keeps the token, project ref and password in env; this
 * process is handed two text files and the repo.
 */

import { readFileSync, writeFileSync, readdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { recordApplied, summaryMarkdown } from "./migration-manifest.mjs";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const MANIFEST = join(MIGRATIONS_DIR, "APPLIED_TO_PROD.txt");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const beforePath = arg("before");
const afterPath = arg("after");
const runUrl = arg("run-url");
const dryRun = process.argv.includes("--dry-run");

if (!beforePath || !afterPath) {
  console.error("::error::--before and --after are required (captured migration list output)");
  process.exit(1);
}

const repoFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const result = recordApplied({
  beforeStdout: readFileSync(beforePath, "utf8"),
  afterStdout: readFileSync(afterPath, "utf8"),
  repoFiles,
  manifestText: readFileSync(MANIFEST, "utf8"),
});

// Written BEFORE the exit-code decision, so a run that is about to fail still leaves the manifest
// telling the truth about what ran.
if (!dryRun && result.appliedFiles.length > 0) {
  writeFileSync(MANIFEST, result.manifestText);
}

const summary = summaryMarkdown(result, { runUrl });
console.log(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

// Machine-readable outputs for the workflow's later steps (whether to commit, what to say).
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `applied_count=${result.appliedFiles.length}`,
      `pending_count=${result.pending.length}`,
      `applied_files=${result.appliedFiles.join(" ")}`,
      "",
    ].join("\n"),
  );
}

for (const problem of result.problems) console.error(`::error title=Manifest mismatch::${problem}`);

process.exit(result.ok ? 0 : 1);
