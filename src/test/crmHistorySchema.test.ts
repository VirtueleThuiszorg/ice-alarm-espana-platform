// @vitest-environment node
//
// The two migrations that let the karmaCRM history land. Static assertions over the SQL,
// the same house pattern as iceImportSchema.test.ts — vitest has no database, so the thing
// that can actually be pinned is the SQL that will run.
//
// What is guarded here is not the column list. It is the four properties that, if any one
// of them silently went away, would not fail anything else:
//
//   * the UNIQUE keys, without which a second import doubles 9,628 records
//   * the exactly-one-owner CHECK, without which a note can insert attached to nobody and
//     then appear on no screen at all
//   * the writer only ever using a note_type the CHECK allows, which is the bug that made
//     the September import record created members as failures
//   * both tables staying staff-only, because a note now reaches CRM contacts too
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");

function migration(prefix: string): string {
  const f = readdirSync(MIGRATIONS).find((m) => m.startsWith(prefix));
  expect(f, `migration ${prefix}* must exist`).toBeDefined();
  return readFileSync(join(MIGRATIONS, f!), "utf8");
}

const NOTES = "20260911140000_crm_history_notes";
const TASKS = "20260911140100_crm_history_tasks";

describe("both migrations document how to undo themselves", () => {
  it.each([NOTES, TASKS])("%s", (prefix) => {
    expect(migration(prefix)).toMatch(/Reverse/i);
  });
});

describe("a second import cannot double the history", () => {
  it("member_notes is unique per (source, source_id)", () => {
    expect(migration(NOTES)).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS member_notes_source_uniq[\s\S]*?ON public\.member_notes\(source, source_id\)/
    );
  });

  it("tasks are unique per (source, source_id)", () => {
    expect(migration(TASKS)).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS tasks_source_uniq[\s\S]*?ON public\.tasks\(source, source_id\)/
    );
  });

  it("both indexes are partial, so notes and tasks written in the platform stay free", () => {
    // Without the WHERE, two staff notes with no source at all would collide on (NULL, NULL)
    // in some future Postgres NULLS NOT DISTINCT world, and more immediately the index would
    // carry every row for nothing.
    for (const prefix of [NOTES, TASKS]) {
      expect(migration(prefix)).toMatch(/WHERE source_id IS NOT NULL/);
    }
  });
});

describe("every note hangs off exactly one thing", () => {
  const sql = () => migration(NOTES);

  it("member_id becomes nullable and crm_contact_id joins it", () => {
    expect(sql()).toMatch(/ADD COLUMN IF NOT EXISTS crm_contact_id\s+uuid REFERENCES public\.crm_contacts\(id\) ON DELETE CASCADE/);
    expect(sql()).toMatch(/ALTER COLUMN member_id DROP NOT NULL/);
  });

  it("and a CHECK refuses both and neither", () => {
    expect(sql()).toMatch(
      /CHECK \(\(member_id IS NULL\) <> \(crm_contact_id IS NULL\)\)/
    );
  });

  it("a deleted CRM contact takes its notes with it rather than orphaning them", () => {
    expect(sql()).toMatch(/crm_contact_id\s+uuid REFERENCES public\.crm_contacts\(id\) ON DELETE CASCADE/);
  });
});

describe("note_type can describe a call now, and still refuses crm_import", () => {
  const allowed = () => {
    const m = migration(NOTES).match(/CHECK \(note_type IN \(([^)]+)\)\)/);
    expect(m, "the widened CHECK list must be findable").toBeTruthy();
    return m![1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
  };

  it("keeps every value that was already allowed", () => {
    for (const value of ["general", "medical", "payment", "support", "followup", "complaint"]) {
      expect(allowed(), `${value} was allowed before and must still be`).toContain(value);
    }
  });

  it("adds call and courtesy_call", () => {
    expect(allowed()).toContain("call");
    expect(allowed()).toContain("courtesy_call");
  });

  it("still refuses crm_import — it describes how a row arrived, not what it is", () => {
    expect(allowed()).not.toContain("crm_import");
  });

  it("drops the old constraint by what it constrains, not by a guessed name", () => {
    // The original is an inline column CHECK from the base migration, so its name is
    // whatever Postgres generated. Looking it up in pg_constraint is the only safe way.
    expect(migration(NOTES)).toMatch(/FROM pg_constraint/);
  });
});

describe("the history writer writes only values the schema accepts", () => {
  const writer = readFileSync(join(process.cwd(), "src/lib/karmaHistoryImport.ts"), "utf8");
  const allowedNoteTypes = migration(NOTES)
    .match(/CHECK \(note_type IN \(([^)]+)\)\)/)![1]
    .split(",")
    .map((v) => v.trim().replace(/^'|'$/g, ""));

  it("every note type the parser can emit is in the CHECK list", () => {
    // The parser's union type is the complete set of what can reach the column.
    const union = writer.match(/export type HistoryNoteType = ([^;]+);/);
    expect(union, "HistoryNoteType must be findable").toBeTruthy();
    for (const value of union![1].split("|").map((v) => v.trim().replace(/"/g, ""))) {
      expect(allowedNoteTypes, `note_type "${value}" is not in the CHECK list`).toContain(value);
    }
  });
});

describe("the history stays staff-only", () => {
  it("neither migration adds a policy, so both tables keep the ones they have", () => {
    // member_notes and tasks are is_staff-only from 20260121153611, and crm_contacts from
    // 20260122132354. Attaching a note to a CRM contact must not be a way to widen that.
    for (const prefix of [NOTES, TASKS]) {
      expect(migration(prefix)).not.toMatch(/CREATE POLICY/);
      expect(migration(prefix)).not.toMatch(/DISABLE ROW LEVEL SECURITY/);
    }
  });
});

describe("the notes tab can survive the volume it is about to be handed", () => {
  it("member_notes is indexed for one member, newest first", () => {
    expect(migration(NOTES)).toMatch(
      /CREATE INDEX IF NOT EXISTS member_notes_member_created_idx[\s\S]*?ON public\.member_notes\(member_id, created_at DESC\)/
    );
  });

  it("and for one CRM contact", () => {
    expect(migration(NOTES)).toMatch(/member_notes_crm_contact_created_idx/);
  });

  it("the notes tab asks the database to paginate rather than fetching everything", () => {
    const tab = readFileSync(
      join(process.cwd(), "src/components/admin/member-detail/NotesTab.tsx"),
      "utf8"
    );
    expect(tab, "must page with .range()").toMatch(/\.range\(/);
    expect(tab, "must search in Postgres, not in JS").toMatch(/\.ilike\("content"/);
    // The old client-side filter over every note is the thing being replaced; if it comes
    // back, pagination is decorative.
    expect(tab).not.toMatch(/notes\.filter\(\(note\)/);
  });
});
