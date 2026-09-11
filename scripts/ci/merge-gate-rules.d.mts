/**
 * Types for scripts/ci/merge-gate-rules.mjs.
 *
 * Plain JS for the same reason as scripts/migrationDrift.mjs and scripts/ci/migration-manifest.mjs:
 * `check-merge-gate.mjs` runs under Node on a GitHub runner, which cannot import a .ts file.
 *
 * `tsconfig.app.json` does not set `allowJs`, so WITHOUT this file the import in
 * src/test/mergeGateEnforced.test.ts is an `any` — and the eighteen assertions in that suite become
 * claims about `any`, which is the failure mode both sibling declarations were written to prevent.
 * Here it did not even get that far: `REQUIRED_CHECKS` as `any` makes `it.each(REQUIRED_CHECKS)`
 * unresolvable and the whole file fails to type-check, which is how main went red.
 *
 * Keep it in step with the .mjs. The suite reads both exports, so a declaration that drifts from the
 * implementation surfaces as a failing test rather than as a quietly wrong type.
 */

/**
 * One entry of a `required_status_checks` rule. GitHub has returned BOTH the bare string and the
 * `{ context }` object for this list, so the checker accepts either and so must this type.
 */
export type StatusCheck = string | { context?: string | null } | null | undefined;

/** The `parameters` bag of a branch rule. Open, because each rule type carries its own keys. */
export interface BranchRuleParameters {
  required_status_checks?: readonly StatusCheck[];
  [key: string]: unknown;
}

/** One element of GET /repos/{owner}/{repo}/rules/branches/{branch}. */
export interface BranchRule {
  type: string;
  parameters?: BranchRuleParameters;
}

export interface MergeGateVerdict {
  /** True only when there are no problems at all. */
  ok: boolean;
  /** Machine-ish reasons, one per defect. Empty when ok. */
  problems: string[];
  /** The same findings as markdown lines, for the job summary. */
  report: string[];
}

/**
 * The check contexts that must be required before a merge.
 *
 * `Manifest matches production` is deliberately absent and must stay absent — see the .mjs.
 */
export const REQUIRED_CHECKS: string[];

/**
 * Pure verdict over what GitHub reports applies to the branch. A non-array (an error body, say) is
 * treated as unprotected rather than as unknown.
 */
export function evaluateMergeGate(rules: readonly BranchRule[]): MergeGateVerdict;
