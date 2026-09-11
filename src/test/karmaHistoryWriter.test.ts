// @vitest-environment node
//
// Where each history record lands, against a fake database. Same division as the contacts
// import: every decision is in the writer and is tested here, and the Supabase adapter has
// no judgement in it to test.
//
// The three behaviours these tests exist to hold:
//
//   1. Cancelled and deceased files keep their history. 310 of Lee's 431 contacts never
//      become members; roughly 3,600 of the 9,628 records belong to them. Attaching those
//      to a CRM contact rather than dropping them is the whole reason member_notes gained
//      a crm_contact_id.
//
//   2. A second run writes nothing. The import will be run more than once — the first time
//      before every contact is in, and again afterwards — and the dedupe is on the source
//      id, which is the only key that survives a note being edited afterwards.
//
//   3. One failing batch does not lose the other fifty. 9,628 records go in over dozens of
//      round trips, and "start again" is not an acceptable answer to the fortieth failing.
import { describe, it, expect } from "vitest";
import { parseKarmaHistory, type HistoryPlan } from "@/lib/karmaHistoryImport";
import {
  applyHistoryPlan,
  HISTORY_SOURCE,
  type HistoryDb,
  type HistoryOwner,
  type NoteRow,
  type TaskRow,
} from "@/lib/karmaHistoryWriter";

interface FakeOptions {
  members?: Record<string, string>;
  crmContacts?: Record<string, string>;
  existingNotes?: string[];
  existingTasks?: string[];
  failNotesOnce?: boolean;
}

function fakeDb(options: FakeOptions = {}) {
  const notes: NoteRow[] = [];
  const tasks: TaskRow[] = [];
  const calls: string[] = [];
  let failed = false;

  const db: HistoryDb = {
    async resolveOwners(ids) {
      calls.push(`resolveOwners(${ids.length})`);
      const out = new Map<string, HistoryOwner>();
      for (const id of ids) {
        const contact = options.crmContacts?.[id];
        if (contact) out.set(id, { kind: "crm_contact", id: contact });
        const member = options.members?.[id];
        if (member) out.set(id, { kind: "member", id: member });
      }
      return out;
    },
    async existingNoteSourceIds(ids) {
      calls.push(`existingNoteSourceIds(${ids.length})`);
      return new Set(ids.filter((id) => options.existingNotes?.includes(id)));
    },
    async existingTaskSourceIds(ids) {
      return new Set(ids.filter((id) => options.existingTasks?.includes(id)));
    },
    async insertNotes(rows) {
      if (options.failNotesOnce && !failed) {
        failed = true;
        throw new Error("duplicate key value violates unique constraint");
      }
      notes.push(...rows);
    },
    async insertTasks(rows) {
      tasks.push(...rows);
    },
  };

  return { db, notes, tasks, calls };
}

const plan = (histories: unknown[]): HistoryPlan => parseKarmaHistory({ histories });

const note = (id: number, contactId: number, body = "text", at = "2021-03-04T10:00:00Z") => ({
  id,
  name: "Note",
  history_record_id: contactId,
  history_record_type: "Contact",
  occurred_at: at,
  external: { body },
});

const todo = (todoId: number, contactId: number, label = "Courtesy call") => ({
  id: todoId * 10,
  name: "Todo",
  history_type_id: 3,
  history_record_id: todoId,
  history_record_type: "Todo",
  occurred_at: "2024-06-01T09:00:00Z",
  external: { label },
  participants: [{ participater_id: contactId, participater_type: "Contact" }],
});

describe("a note lands on the member when there is one", () => {
  it("writes member_id and leaves crm_contact_id null", async () => {
    const { db, notes } = fakeDb({ members: { "11269870": "member-uuid" } });
    const result = await applyHistoryPlan(db, plan([note(1, 11269870, "she called")]));

    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({
      member_id: "member-uuid",
      crm_contact_id: null,
      content: "she called",
      note_type: "general",
      created_at: "2021-03-04T10:00:00Z",
      source: HISTORY_SOURCE,
      source_id: "1",
    });
    expect(result.notesCreated).toBe(1);
    expect(result.toMembers).toBe(1);
  });

  it("carries the original date through, which is the point of the exercise", async () => {
    const { db, notes } = fakeDb({ members: { "1": "m" } });
    await applyHistoryPlan(db, plan([note(1, 1, "old", "2020-07-15T09:58:28Z")]));
    expect(notes[0].created_at).toBe("2020-07-15T09:58:28Z");
  });
});

describe("a cancelled or deceased file keeps its history", () => {
  it("writes the note against the CRM contact instead of dropping it", async () => {
    const { db, notes } = fakeDb({ crmContacts: { "11269960": "contact-uuid" } });
    const result = await applyHistoryPlan(db, plan([note(1, 11269960, "why they left")]));

    expect(notes[0].member_id).toBeNull();
    expect(notes[0].crm_contact_id).toBe("contact-uuid");
    expect(result.toCrmContacts).toBe(1);
    expect(result.unplaced).toBe(0);
  });

  it("prefers the member when a contact has been converted to one", async () => {
    const { db, notes } = fakeDb({
      members: { "500": "member-uuid" },
      crmContacts: { "500": "contact-uuid" },
    });
    await applyHistoryPlan(db, plan([note(1, 500)]));
    expect(notes[0].member_id).toBe("member-uuid");
    expect(notes[0].crm_contact_id).toBeNull();
  });
});

describe("a record whose contact is not in the platform at all", () => {
  it("is counted and named, never written against a guess", async () => {
    const { db, notes } = fakeDb({ members: { "1": "m" } });
    const result = await applyHistoryPlan(db, plan([note(1, 1), note(2, 99999)]));

    expect(notes).toHaveLength(1);
    expect(result.unplaced).toBe(1);
    expect(result.unplacedContactIds).toEqual(["99999"]);
  });

  it("names each missing contact once, however many records it has", async () => {
    const { db } = fakeDb();
    const result = await applyHistoryPlan(db, plan([note(1, 7), note(2, 7), note(3, 7)]));
    expect(result.unplaced).toBe(3);
    expect(result.unplacedContactIds).toEqual(["7"]);
  });
});

describe("running it twice writes nothing the second time", () => {
  it("skips notes whose source id is already there", async () => {
    const { db, notes } = fakeDb({ members: { "1": "m" }, existingNotes: ["1", "2"] });
    const result = await applyHistoryPlan(db, plan([note(1, 1), note(2, 1), note(3, 1)]));

    expect(notes.map((n) => n.source_id)).toEqual(["3"]);
    expect(result.notesAlreadyPresent).toBe(2);
    expect(result.notesCreated).toBe(1);
  });

  it("skips tasks by the TODO id, which is what makes a re-run safe", async () => {
    const { db, tasks } = fakeDb({ members: { "1": "m" }, existingTasks: ["3952019"] });
    const result = await applyHistoryPlan(db, plan([todo(3952019, 1), todo(3952020, 1)]));

    expect(tasks.map((t) => t.source_id)).toEqual(["3952020"]);
    expect(result.tasksAlreadyPresent).toBe(1);
  });
});

describe("tasks", () => {
  it("carry the type the courtesy-call card reads", async () => {
    const { db, tasks } = fakeDb({ members: { "1": "m" } });
    await applyHistoryPlan(db, plan([todo(1, 1, "Courtesy call"), todo(2, 1, "fit a key safe")]));

    expect(tasks.map((t) => t.task_type)).toEqual(["courtesy_call", "general"]);
    expect(tasks[0].source).toBe(HISTORY_SOURCE);
  });
});

describe("a failing batch does not lose the run", () => {
  it("reports the batch and keeps writing the rest", async () => {
    const { db, notes, tasks } = fakeDb({ members: { "1": "m" }, failNotesOnce: true });
    const result = await applyHistoryPlan(
      db,
      plan([note(1, 1), note(2, 1), note(3, 1), note(4, 1), todo(9, 1)]),
      { chunkSize: 2 }
    );

    // First batch of two rejected; the second batch of two still written.
    expect(notes).toHaveLength(2);
    expect(result.notesCreated).toBe(2);
    expect(result.problems.some((p) => /2 note\(s\) failed to write/.test(p))).toBe(true);
    // And the tasks, which come after the notes, are unaffected.
    expect(tasks).toHaveLength(1);
    expect(result.tasksCreated).toBe(1);
  });
});

describe("dry run", () => {
  it("resolves and counts without writing", async () => {
    const { db, notes, tasks } = fakeDb({ members: { "1": "m" } });
    const result = await applyHistoryPlan(db, plan([note(1, 1), todo(2, 1)]), { dryRun: true });

    expect(notes).toHaveLength(0);
    expect(tasks).toHaveLength(0);
    expect(result.toMembers).toBe(2);
    expect(result.notesCreated).toBe(0);
  });
});

describe("the round trips are batched, not one per record", () => {
  it("asks about 300 notes in two lookups, not three hundred", async () => {
    const histories = Array.from({ length: 300 }, (_, i) => note(i + 1, 1));
    const { db, calls } = fakeDb({ members: { "1": "m" } });
    await applyHistoryPlan(db, plan(histories), { chunkSize: 200 });

    const lookups = calls.filter((c) => c.startsWith("existingNoteSourceIds"));
    expect(lookups).toEqual(["existingNoteSourceIds(200)", "existingNoteSourceIds(100)"]);
  });
});

describe("problems found while parsing survive into the result", () => {
  it("carries them through rather than losing them at the writer boundary", async () => {
    const { db } = fakeDb();
    const parsed = parseKarmaHistory("{not json");
    const result = await applyHistoryPlan(db, parsed);
    expect(result.problems[0]).toMatch(/not valid JSON/);
  });
});
