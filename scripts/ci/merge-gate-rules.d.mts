/**
 * Types for scripts/ci/merge-gate-rules.mjs.
 *
 * Plain JS for the same reason as scripts/ci/migration-manifest.mjs: `ci.yml` runs the checker
 * under Node on a GitHub runner, which cannot import a .ts file, and a .ts rule for the tests
 * plus a hand-written copy for the thing that actually runs is how a second implementation no
 * test ever sees gets born.
 *
 * `tsconfig.app.json` does not set `allowJs`, so without this file every assertion in
 * src/test/mergeGateEnforced.test.ts is a claim about `any` — and the typecheck fails outright
 * under `noImplicitAny`, which is how main went red the moment #381 landed.
 *
 * Keep it in step with the .mjs. The tests read every field on MergeGateVerdict, so a
 * declaration that drifts from the implementation surfaces as a failing test rather than a
 * quiet wrong type.
 */

/**
 * The six jobs that must pass before a merge, as GitHub reports them as check contexts.
 * `Manifest matches production` is deliberately absent — see the .mjs.
 */
export const REQUIRED_CHECKS: string[];

/** One entry of GET /repos/{owner}/{repo}/rules/branches/{branch}. */
export interface BranchRule {
  type: string;
  parameters?: {
    required_status_checks?: Array<string | { context?: string } | null>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface MergeGateVerdict {
  /** False when the gate would not stop a red merge. */
  ok: boolean;
  /** Why, one line each. Empty when ok. */
  problems: string[];
  /** The markdown the job prints, one bullet per rule checked. */
  report: string[];
}

export function evaluateMergeGate(
  rules: readonly BranchRule[] | null | undefined,
): MergeGateVerdict;
