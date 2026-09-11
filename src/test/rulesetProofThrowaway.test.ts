/**
 * THROWAWAY. Exists only to make the "Tests" job red, so that the repository ruleset on main can
 * be observed refusing (or failing to refuse) the merge of a pull request with a red required
 * check. Delete this file and close its pull request as soon as the observation is recorded —
 * it must never reach main.
 */
import { describe, it, expect } from "vitest";

describe("ruleset proof — deliberately red", () => {
  it("fails on purpose so one required check goes red", () => {
    expect("this check is red on purpose").toBe("and must never be merged");
  });
});
