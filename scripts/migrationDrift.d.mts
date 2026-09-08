/**
 * Types for scripts/migrationDrift.mjs.
 *
 * WHY THERE IS A HAND-WRITTEN DECLARATION HERE. The rule used to live in a .ts file that only
 * the tests could load: CI runs Node 20, which cannot import TypeScript, so the CLI carried its
 * own hand-written copy of the same comparisons — the copy that actually ran, and the one no
 * test ever saw. Moving the rule to plain JS with JSDoc gives both the CLI and the tests ONE
 * implementation; this file is what keeps the tests type-checked against it, since
 * `tsconfig.app.json` does not set `allowJs` and would otherwise see `any`.
 *
 * Keep it in step with the JSDoc in the .mjs. The assertions in src/test/migrationDrift.test.ts
 * read every field on DriftResult, so a declaration that drifts from the implementation shows up
 * as a failing test rather than as a quietly wrong type.
 */

export interface DriftInput {
  /** Every migration filename present in the repo. */
  repoMigrations: string[];
  /** Filenames listed in APPLIED_TO_PROD.txt (comments and blanks already stripped). */
  applied: string[];
  /** Filenames this pull request ADDS, relative to its base. Empty on main. */
  addedByPr: string[];
  /** True when this run IS main, false for a pull request. Decides which half of the rule applies. */
  onMain: boolean;
}

export interface DriftResult {
  ok: boolean;
  /** In the repo, not in the manifest. */
  pending: string[];
  /** Pending and NOT added by this PR — i.e. somebody else's unpushed migration. */
  preExistingPending: string[];
  /** In the manifest but not in the repo. */
  phantom: string[];
  /** Why it failed, or why it passed. Always set. */
  reason: string;
  /** Set when the run PASSES but something is pending anyway; empty otherwise. */
  warning: string;
}

export function computeDrift(input: DriftInput): DriftResult;

/** Strip comments and blank lines from the manifest. */
export function parseManifest(contents: string): string[];

/** Which half of the rule applies, from the CLI arguments and the two commits. */
export function resolveContext(
  argv: readonly string[],
  revs?: { base?: string; head?: string },
): { onMain: boolean; how: string };
