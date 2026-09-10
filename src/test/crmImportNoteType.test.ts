// @vitest-environment node
//
// The import writes member notes. `member_notes.note_type` is CHECK-constrained, and the value
// the import used — 'crm_import' — was not in the list.
//
// So every note it tried to write was refused by Postgres. And because the writer throws on a
// refused insert, the whole row was then recorded as `failed` in `crm_import_rows` even though
// the member row had already been created: a member on the roster, reported as a failure, with
// the note missing. On Lee's file the lost notes are the ones that matter most — an IMEI with no
// SIM, a contact with a name and no number, a spouse — because they exist precisely for data
// that could not be represented anywhere else.
//
// Found by running the item-1 backfill against a real PostgreSQL 16: the seeded notes would not
// insert either, with the same constraint name.
//
// This test reads the allowed values OUT OF THE MIGRATION rather than restating them, so the
// next invented value fails here instead of in production.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const ADAPTER = readFileSync(join(process.cwd(), "src/lib/crmImportDb.ts"), "utf8");

/** The CHECK list, parsed from whichever migration last defined it. */
function allowedNoteTypes(): string[] {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let found: string[] | null = null;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    // Matches both the base column definition and any later ADD CONSTRAINT.
    const m = sql.match(/note_type[^;]*?CHECK\s*\(\s*note_type\s+IN\s*\(([^)]+)\)/i);
    if (m) found = m[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
  }
  return found ?? [];
}

describe("member_notes.note_type", () => {
  const allowed = allowedNoteTypes();

  it("has a CHECK list the tests can read", () => {
    // Guards every assertion below from passing over an empty list.
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed).toContain("general");
  });

  it("does not allow 'crm_import', which is why this test exists", () => {
    expect(allowed).not.toContain("crm_import");
  });

  it("is written by the import with a value the constraint allows", () => {
    const m = ADAPTER.match(/from\("member_notes"\)[\s\S]*?note_type:\s*"([^"]+)"/);
    expect(m, "could not find the note_type the import writes").toBeTruthy();
    expect(allowed).toContain(m![1]);
  });

  it("writes no note_type the constraint would refuse, anywhere in the adapter", () => {
    // Every literal, not just the first — a second insert added later is the same bug again.
    for (const [, value] of ADAPTER.matchAll(/note_type:\s*"([^"]+)"/g)) {
      expect(allowed, `note_type "${value}" is not in the CHECK list`).toContain(value);
    }
  });
});
