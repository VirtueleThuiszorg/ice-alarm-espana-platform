#!/usr/bin/env node
/**
 * Asks PRODUCTION what it has, and fails if APPLIED_TO_PROD.txt disagrees in either direction.
 *
 * The file-based drift gate compares the repo against the manifest. It cannot tell whether the
 * manifest is TRUE, because it has nothing to check it against. On 2026-09-09 it was not:
 * production had three migrations applied by hand that the manifest did not name, and the first
 * automated migrate run failed because of it — `supabase db push` refuses to run when an
 * unapplied migration sits behind the newest applied one, which is precisely the state that
 * unrecorded hand-push created.
 *
 * Runs on main only, where the secrets exist. A pull request has no database to ask, and the
 * file-based gate is the right check there.
 *
 * Requires SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD in env, and a
 * linked project. It reads; it changes nothing.
 */
import { readFileSync, readdirSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { compareManifestToRemote } from "./migration-manifest.mjs";

const MIGRATIONS_DIR = "supabase/migrations";
const MANIFEST = join(MIGRATIONS_DIR, "APPLIED_TO_PROD.txt");

let remoteStdout;
try {
  // Not `shell: true` and no interpolation: the project ref comes from a secret, and building a
  // command string out of it is how a secret ends up in a shell trace.
  remoteStdout = execFileSync("supabase", ["migration", "list", "--linked"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (e) {
  const err = e;
  // Print the CLI's own message but NEVER the env. A failure here is a real failure: this check
  // only runs where the credentials are supposed to exist.
  console.error(`::error title=Could not read production's migration list::${err.stderr || err.message}`);
  process.exit(1);
}

const repoFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
const result = compareManifestToRemote({
  remoteStdout,
  repoFiles,
  manifestText: readFileSync(MANIFEST, "utf8"),
});

const lines = [
  "## Is the manifest telling the truth?",
  "",
  `production: **${result.remoteCount}** applied · manifest: **${result.recordedCount}** recorded`,
  "",
];

const list = (label, items) => {
  if (items.length === 0) return;
  lines.push(`### ${label}`, ...items.map((i) => `- \`${i}\``), "");
};

list("Applied in production, NOT in the manifest", result.unrecorded);
list("In the manifest, NOT applied in production", result.phantom);
list("Applied in production with no file in this repo", result.unknownRemote);
list("Merged but not yet applied (the drift gate's business, not this check's)", result.pending);

if (result.ok) lines.push("The manifest matches production.", "");

const summary = lines.join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

for (const p of result.problems) console.error(`::error title=Manifest disagrees with production::${p}`);

process.exit(result.ok ? 0 : 1);
