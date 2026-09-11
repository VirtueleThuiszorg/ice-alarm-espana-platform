/**
 * Types for `merge-gate-rules.mjs`.
 *
 * The module itself stays JavaScript because `check-merge-gate.mjs` imports it at runtime in CI,
 * where nothing compiles TypeScript — the same reason `scripts/wiring/*.mjs` are `.mjs`. So the
 * types live beside it rather than in it.
 *
 * This file exists because the test that imports the module was merged while `tsc -p
 * tsconfig.app.json` had never been run against it: a bare `.mjs` import is an implicit `any`,
 * which `noImplicitAny` refuses, and every callback destructuring its exports then failed too.
 */

/** One entry of GET /repos/{owner}/{repo}/rules/branches/{branch}. */
export interface BranchRule {
  type: string;
  parameters?: {
    required_status_checks?: Array<{ context?: string } | string>;
    allowed_merge_methods?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface MergeGateVerdict {
  /** True only when every rule below is in place. */
  ok: boolean;
  /** One short sentence per defect, for the `::error::` line. */
  problems: string[];
  /** Markdown bullets for the job summary, one per rule checked. */
  report: string[];
}

/** The check contexts that must be required before a merge. */
export const REQUIRED_CHECKS: string[];

/**
 * `rules` is deliberately `unknown`: the checker is handed whatever the API returned, including a
 * GitHub error body, and treating "I could not tell" as "protected" is the one answer it must
 * never give.
 */
export function evaluateMergeGate(rules: unknown): MergeGateVerdict;
