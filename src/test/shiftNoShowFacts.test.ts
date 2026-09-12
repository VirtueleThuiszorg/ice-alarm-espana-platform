/**
 * THE FACTS QUERY MAY ONLY READ, AND MAY NOT PRINT PII.
 *
 * `scripts/ops/shift-noshow-facts.sql` runs against PRODUCTION as the database superuser, from a
 * job whose log everybody with repository access can read. Two properties make that acceptable,
 * and neither is self-evident from a diff six months from now:
 *
 *   1. it cannot write — the whole file runs inside `SET TRANSACTION READ ONLY`, so a write that
 *      ever reached it would be refused by Postgres rather than trusted not to be there;
 *   2. it cannot leak — `staff.personal_mobile` sits on the same row as the columns it wants.
 *
 * Asserted against the SOURCE, because running it needs production. That is enough for the
 * failure being prevented: somebody adding an UPDATE or a `SELECT *` in a hurry.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SQL = readFileSync(join(ROOT, "scripts/ops/shift-noshow-facts.sql"), "utf8");
const WORKFLOW = readFileSync(join(ROOT, ".github/workflows/shift-noshow-facts.yml"), "utf8");
/** The workflow's instructions, without the prose explaining them. */
const WORKFLOW_STEPS = WORKFLOW.split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

/** Comments explain the rules; they are not the statements the rules are about. */
const STATEMENTS = SQL.split("\n")
  .filter((line) => !line.trimStart().startsWith("--") && !line.trimStart().startsWith("\\echo"))
  .join("\n");

describe("the facts query can only read", () => {
  it("declares the transaction READ ONLY before any statement", () => {
    const readOnly = STATEMENTS.indexOf("SET TRANSACTION READ ONLY");
    const firstSelect = STATEMENTS.indexOf("SELECT");
    expect(readOnly).toBeGreaterThan(-1);
    expect(readOnly).toBeLessThan(firstSelect);
    // Without ON_ERROR_STOP a refused statement is a warning scrolled past, not a failed job.
    expect(SQL).toContain("ON_ERROR_STOP on");
  });

  it("contains no writing statement of any kind", () => {
    for (const verb of [
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "DROP",
      "ALTER",
      "CREATE",
      "GRANT",
      "REVOKE",
      "COPY",
    ]) {
      expect(STATEMENTS.toUpperCase(), `${verb} must not appear`).not.toContain(`${verb} `);
    }
  });

  it("bounds itself so it cannot sit on a lock or scan forever", () => {
    expect(STATEMENTS).toContain("statement_timeout");
  });
});

describe("the facts query prints no PII", () => {
  it("selects explicit columns, never a star", () => {
    expect(STATEMENTS).not.toMatch(/SELECT\s+\*/i);
  });

  it("never selects a phone number, an email or an address", () => {
    for (const column of ["personal_mobile", "phone", "email", "address", "whatsapp"]) {
      expect(STATEMENTS.toLowerCase(), `${column} must not be selected`).not.toContain(column);
    }
  });

  it("takes the name as a bound parameter rather than pasting it into SQL", () => {
    // `:'staff_name'` is psql's quoted-literal substitution. String-building the name into the
    // query would make a workflow input a SQL injection point, manual trigger or not.
    expect(SQL).toContain(":'staff_name'");
    expect(STATEMENTS).not.toMatch(/'\s*\|\|\s*:staff_name/);
  });
});

describe("the workflow around it", () => {
  it("runs only when a human asks — never on a push", () => {
    expect(WORKFLOW).toContain("workflow_dispatch:");
    expect(WORKFLOW).not.toMatch(/^\s{2}(push|pull_request|schedule):/m);
  });

  it("fails when a secret is missing rather than skipping green", () => {
    expect(WORKFLOW).toContain("scripts/ci/require-secrets.mjs");
    expect(WORKFLOW).not.toMatch(/if:.*secrets\./);
  });

  it("names the secrets that exist, not the two that do not", () => {
    /*
      Run #1 of this job failed on `require-secrets`: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
      are NOT set in this repository, so the PostgREST version of this script could never have
      run. `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` are set — `migrate.yml` applies
      migrations with them daily.
    */
    expect(WORKFLOW_STEPS).toContain("SUPABASE_DB_PASSWORD");
    expect(WORKFLOW_STEPS).toContain("SUPABASE_PROJECT_REF");
    // Checked against the STEPS, not the file: the header explains why the other two are not
    // used, and a comment naming a secret must not read as the job asking for it.
    expect(WORKFLOW_STEPS).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(WORKFLOW_STEPS).not.toContain("SUPABASE_URL");
  });

  it("keeps the password out of argv", () => {
    // libpq's environment carries it. A password in a command line reaches the process list and
    // any `set -x` — the rule `migrate.yml` and `reach-production.sh` both follow.
    expect(WORKFLOW).toContain('export PGPASSWORD="$SUPABASE_DB_PASSWORD"');
    expect(WORKFLOW).not.toMatch(/psql\s+"postgresql:\/\//);
    expect(WORKFLOW).not.toMatch(/--password|-W\b/);
  });

  it("asks for read-only repository permission", () => {
    expect(WORKFLOW).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });
});
