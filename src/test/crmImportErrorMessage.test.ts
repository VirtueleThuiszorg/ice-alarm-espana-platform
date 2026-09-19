// @vitest-environment node
//
// A FAILED IMPORT ROW MUST SAY WHY IT FAILED.
//
// Three rows of the 19 September live import failed and all three reported "Unknown error", on
// the screen and in `crm_import_rows.error_message` alike. That was not a property of the rows.
// The page tested `error instanceof Error`, and a PostgREST error is a plain object with no
// prototype, so the test was false for EVERY database failure — the reason was discarded on
// exactly the rows that had one. It is not recoverable after the fact, which is why re-running
// the same file is the only way to learn the cause, and why this has to work first.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describeImportError } from "@/lib/crmImportDb";
import { stripComments } from "./helpers/stripComments";

describe("describeImportError", () => {
  it("THE CASE THAT ACTUALLY HAPPENED: a PostgREST error is a plain object, not an Error", () => {
    // Exactly the shape supabase-js throws. `instanceof Error` is false for this.
    const pgError = {
      message: 'duplicate key value violates unique constraint "crm_contacts_source_id_key"',
      code: "23505",
      details: "Key (source_id)=(12130119) already exists.",
      hint: null,
    };
    expect(pgError instanceof Error, "the premise of the old test").toBe(false);

    const described = describeImportError(pgError);
    expect(described).toContain("duplicate key value");
    expect(described).toContain("23505");
    expect(described).toContain("crm_contacts_source_id_key");
    expect(described).not.toBe("Unknown error");
  });

  it.each([
    ["23502", "null value in column \"last_name\" violates not-null constraint"],
    ["22001", "value too long for type character varying(20)"],
    ["22P02", "invalid input syntax for type date"],
    ["42501", "new row violates row-level security policy for table \"member_bank_details\""],
  ])("keeps the code %s, which is the half that names the fault", (code, message) => {
    const out = describeImportError({ message, code });
    expect(out).toContain(code);
    expect(out).toContain(message);
  });

  it("still handles a real Error, which the old code did get right", () => {
    expect(describeImportError(new Error("network down"))).toBe("network down");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
    ["a number", 42],
  ])("says what arrived rather than inventing a reason for %s", (_label, thrown) => {
    const out = describeImportError(thrown);
    expect(out).toMatch(/^Unknown error \(/);
  });

  it("WITHHOLDS a message that quotes a payment card back at us", () => {
    // Postgres quotes the offending value: `Key (source_text)=(...) already exists`.
    // `crm_import_rows` keeps restricted columns out of `raw` on purpose, and an error string is
    // not a way to put one back. 4111111111111111 is a published test number, never issued.
    const out = describeImportError({
      message: "duplicate key value violates unique constraint",
      code: "23505",
      details: "Key (source_text)=(4111 1111 1111 1111 exp 05/27) already exists.",
    });
    expect(out).not.toContain("4111");
    expect(out).toContain("23505");
    expect(out).toContain("withheld");
  });
});

describe("the import page uses it", () => {
  it("does not test `instanceof Error` on a database failure any more", () => {
    // Comments stripped first: the page now carries a comment SAYING `instanceof Error`, to
    // explain why it is wrong, and a raw substring search would match that and pass for ever.
    const page = stripComments(
      readFileSync(join(process.cwd(), "src/pages/admin/CRMImportPage.tsx"), "utf8"),
    );
    expect(page).toContain("describeImportError(error)");
    expect(page, "the discarding test is back").not.toMatch(/error instanceof Error/);
    expect(page, 'the literal fallback is back').not.toMatch(/"Unknown error"/);
  });
});
