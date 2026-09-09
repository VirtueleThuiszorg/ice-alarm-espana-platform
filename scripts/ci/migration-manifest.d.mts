/**
 * Types for scripts/ci/migration-manifest.mjs.
 *
 * Plain JS for the same reason as scripts/migrationDrift.mjs: `migrate.yml` runs this under Node
 * on a GitHub runner, which cannot import a .ts file, and the alternative — a .ts rule for the
 * tests plus a hand-written copy for the thing that actually runs — is how the drift CLI ended up
 * with a second implementation no test ever saw.
 *
 * `tsconfig.app.json` does not set `allowJs`, so without this file every assertion in
 * src/test/migrationManifestRecording.test.ts would be a claim about `any` — the tests would
 * still pass while proving considerably less than they appear to.
 *
 * Keep it in step with the .mjs. The tests read every field on RecordResult, so a declaration
 * that drifts from the implementation surfaces as a failing test rather than a quiet wrong type.
 */

/** The two columns of `supabase migration list --linked`, as 14-digit versions. */
export interface MigrationList {
  /** Versions of the migration FILES in the repo, per the CLI's LOCAL column. */
  local: string[];
  /** Versions the DATABASE has, per the REMOTE column. The authoritative half. */
  remote: string[];
}

export interface RecordInput {
  /** Captured stdout of `supabase migration list --linked` from BEFORE the push. */
  beforeStdout: string;
  /** The same command AFTER the push. The diff of the two is the only evidence used. */
  afterStdout: string;
  /** Every `*.sql` filename in supabase/migrations. */
  repoFiles: string[];
  /** Current contents of APPLIED_TO_PROD.txt. */
  manifestText: string;
}

export interface RecordResult {
  /** False when a human must look. The manifest is still written — see the module header. */
  ok: boolean;
  /** Why it is not ok. Empty when it is. */
  problems: string[];
  /** Versions production gained, ascending. */
  appliedVersions: string[];
  /** The filenames for those versions, minus any the manifest already had. What gets appended. */
  appliedFiles: string[];
  /** Applied in production with no matching file here — impossible to record, so never recorded. */
  unknownVersions: string[];
  /** Present before the push and absent after. Migrations do not un-apply; this means trouble. */
  vanished: string[];
  /** Repo migrations production still does not have, after the push. */
  pending: string[];
  /** The remote version list after the push, for the job summary. */
  remoteAfter: string[];
  /** The new contents of APPLIED_TO_PROD.txt. Identical to the old one when nothing applied. */
  manifestText: string;
}

export function parseMigrationList(stdout: string | null | undefined): MigrationList;

/** The 14-digit version prefix of a migration filename, or null if it is not named version-first. */
export function versionOf(filename: string): string | null;

export function diffRemote(
  before: readonly string[],
  after: readonly string[],
): { applied: string[]; vanished: string[] };

/** Manifest entries with comments and blank lines stripped. */
export function manifestEntries(text: string | null | undefined): string[];

export function recordApplied(input: RecordInput): RecordResult;

/** Append-only, newline-safe. Returns the input unchanged when there is nothing to add. */
export function appendEntries(
  manifestText: string | null | undefined,
  entries: readonly string[],
): string;

export function summaryMarkdown(result: RecordResult, options?: { runUrl?: string }): string;
