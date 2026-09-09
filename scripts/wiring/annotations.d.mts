/**
 * Types for scripts/wiring/annotations.mjs.
 *
 * WHY A HAND-WRITTEN DECLARATION. The annotations are plain JS because the generator runs under
 * Node in CI, which cannot import TypeScript. `tsconfig.app.json` does not set `allowJs`, so a
 * test importing this module sees `any` and every assertion in it becomes decorative —
 * `src/test/absentAdminEvents.test.ts` reads `ABSENT_ADMIN_EVENTS` field by field, and an `any`
 * there would let a missing field pass type-checking and fail only at runtime.
 *
 * Keep it in step with the JSDoc in the .mjs. The test reads every field below, so a declaration
 * that drifts from the data shows up as a failing test rather than as a quietly wrong type.
 */

/** A machine-checkable claim that something appears NOWHERE in the scanned trees. */
export interface AbsentEverywhere {
  kind: "absentEverywhere";
  /** Regex source. */
  pattern: string;
  /** Repo-relative files or directories to scan. */
  scan: string[];
  /** Prefixes to skip — the thing's own directory, usually. */
  exclude?: string[];
  /** What finding it would mean, in words. Printed in the register. */
  why: string;
}

/** A claim that two patterns never appear near each other in the same file. */
export interface AbsentPair {
  kind: "absentPair";
  /** Regex source: the event. */
  a: string;
  /** Regex source: somebody being told. */
  b: string;
  /** How close counts as "near", in characters, measured both ways. */
  window: number;
  scan: string[];
  exclude?: string[];
  why: string;
}

/** One admin-audience event that writes nowhere (item 3). */
export interface AbsentAdminEvent {
  /** A1, A2, … — stable, so a PR or a note can cite one. */
  id: string;
  event: string;
  audience: string;
  /** What a human expects to happen, and why they expect it. */
  expectation: string;
  /** What happens instead, today, with the evidence. */
  today: string;
  /** Who fixes it. Item 3: the wiring session, not this goal. */
  owner: string;
  absence: AbsentEverywhere | AbsentPair;
}

export const ABSENT_ADMIN_EVENTS: AbsentAdminEvent[];

/** The human half of the register: one entry per family of wires. */
export const FAMILIES: Array<{ wires: string[] } & Record<string, unknown>>;
