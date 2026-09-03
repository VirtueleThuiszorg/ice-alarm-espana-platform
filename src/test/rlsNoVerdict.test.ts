/**
 * The isolation job has two ways to go red, and they mean opposite things.
 *
 * PR #136 (2026-09-02) merged with "Cross-tenant isolation" red. The red meant
 * "the migrations would not apply, so no cross-tenant check ran" — the harness
 * refusing to certify an incomplete schema. In the PR UI that is the same red X
 * you get when a tenant CAN read another tenant's rows. It was read as noise.
 * Establishing which of the two it had been took a repro on a throwaway
 * Postgres the following day; it was the former, and nothing was exposed.
 *
 * `scripts/rls/run.sh` now labels the two exits and gives them different codes.
 * This test exists so that distinction cannot quietly collapse back into one
 * anonymous `exit 1` — which is exactly how the ambiguity arose the first time.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const run = readFileSync(join(process.cwd(), "scripts/rls/run.sh"), "utf8");

describe("run.sh distinguishes 'no verdict' from 'breach suspected'", () => {
  it("defines both exit paths as named functions", () => {
    expect(run).toMatch(/^no_verdict\(\)/m);
    expect(run).toMatch(/^breach_suspected\(\)/m);
  });

  it("a migration failure routes to no_verdict, never a bare exit", () => {
    // The guard block that fires when migrations did not apply.
    const guard = run.match(/if \[\[ \$failed -gt 0 \]\]; then([\s\S]*?)\nfi/);
    expect(guard, "the migration-failure guard is gone").not.toBeNull();
    expect(guard![1]).toMatch(/no_verdict/);
    expect(
      guard![1],
      "an unlabelled `exit` here is the #136 ambiguity returning",
    ).not.toMatch(/^\s*exit\s/m);
  });

  it("a failing suite routes to breach_suspected", () => {
    expect(run).toMatch(/if ! psql_db -f "\$ISOLATION"; then\s*\n\s*breach_suspected/);
  });

  it("the two exits carry DIFFERENT codes, so callers can tell them apart", () => {
    const codeIn = (fnName: string) => {
      const body = run.match(new RegExp(`^${fnName}\\(\\) \\{([\\s\\S]*?)^\\}`, "m"));
      expect(body, `${fnName} not found`).not.toBeNull();
      const m = body![1].match(/exit (\d+)/);
      expect(m, `${fnName} does not exit with an explicit code`).not.toBeNull();
      return m![1];
    };
    const noVerdict = codeIn("no_verdict");
    const breach = codeIn("breach_suspected");
    expect(noVerdict).not.toBe(breach);
    // Pinned so the meanings stay stable for anything that reads the code.
    expect(noVerdict).toBe("3");
    expect(breach).toBe("1");
  });

  it("the no-verdict banner says plainly that it is NOT an isolation failure", () => {
    const body = run.match(/^no_verdict\(\) \{([\s\S]*?)^\}/m)![1];
    expect(body).toMatch(/NO VERDICT/);
    expect(body).toMatch(/NOT an isolation failure/i);
    // A reviewer must be told isolation is unknown, not that it passed.
    expect(body).toMatch(/UNKNOWN/);
  });

  it("both paths write to the GitHub job summary, not just the log", () => {
    expect(run).toMatch(/GITHUB_STEP_SUMMARY/);
    for (const fn of ["no_verdict", "breach_suspected"]) {
      const body = run.match(new RegExp(`^${fn}\\(\\) \\{([\\s\\S]*?)^\\}`, "m"))![1];
      expect(body, `${fn} does not reach the job summary`).toMatch(/emit_summary/);
      expect(body, `${fn} does not annotate the Checks tab`).toMatch(/::error title=/);
    }
  });
});
