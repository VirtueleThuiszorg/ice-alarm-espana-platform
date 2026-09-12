/**
 * THE FACTS SCRIPT MAY ONLY READ, AND MAY NOT PRINT PII.
 *
 * `scripts/ops/shift-noshow-facts.mjs` runs in CI with the SERVICE ROLE KEY, which is the key that
 * ignores every RLS policy in the project. Two properties make that acceptable, and neither is
 * self-evident from reading a diff six months from now:
 *
 *   1. it cannot write — its only `fetch` is a GET, and PostgREST maps GET to SELECT;
 *   2. it cannot leak — a workflow run's log is readable by everybody with repository access, and
 *      this reads the `staff` table, which carries `personal_mobile` beside the columns it wants.
 *
 * Both are asserted against the SOURCE rather than by running it, because running it needs
 * production. A test that reads the file is the only kind that can hold here, and it is enough:
 * the failure it prevents is somebody adding a POST or a `select=*` in a hurry.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCRIPT = readFileSync(join(ROOT, "scripts/ops/shift-noshow-facts.mjs"), "utf8");
const WORKFLOW = readFileSync(join(ROOT, ".github/workflows/shift-noshow-facts.yml"), "utf8");

/** Comments explain the rules; they are not the code the rules are about. */
const CODE = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the facts script can only read", () => {
  it("calls fetch exactly once, and that call is a GET", () => {
    const fetches = CODE.match(/fetch\(/g) ?? [];
    expect(fetches).toHaveLength(1);
    expect(CODE).toMatch(/method:\s*"GET"/);
  });

  it("names no writing method anywhere", () => {
    for (const verb of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(CODE, `${verb} must not appear`).not.toContain(verb);
    }
    // PostgREST's own write affordances, which are not HTTP verbs.
    expect(CODE).not.toMatch(/\bupsert\b|\bPrefer\b|\brpc\//);
  });
});

describe("the facts script prints no PII", () => {
  /*
    `select=*` is the failure mode rather than a deliberate leak: `staff` and `staff_presence` both
    carry columns nobody needs here, and a star would print all of them into a public log.
  */
  it("asks for explicit columns, never a star", () => {
    expect(CODE).not.toContain("select=*");
    const selects = CODE.match(/select=[a-z_,]+/g) ?? [];
    expect(selects.length).toBeGreaterThan(4);
  });

  it("never asks for a phone number, an email or an address", () => {
    for (const column of ["personal_mobile", "phone", "email", "address", "whatsapp"]) {
      expect(CODE.toLowerCase(), `${column} must not be selected`).not.toContain(column);
    }
  });
});

describe("the workflow around it", () => {
  it("runs only when a human asks — never on a push", () => {
    expect(WORKFLOW).toContain("workflow_dispatch:");
    expect(WORKFLOW).not.toMatch(/^\s{2}(push|pull_request|schedule):/m);
  });

  it("fails when a secret is missing rather than skipping green", () => {
    // The repo's one implementation of that rule. A conditional instead would be the defect
    // `require-secrets.mjs` exists to prevent.
    expect(WORKFLOW).toContain("scripts/ci/require-secrets.mjs");
    expect(WORKFLOW).not.toMatch(/if:.*secrets\./);
  });

  it("asks for read-only repository permission", () => {
    expect(WORKFLOW).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });
});
