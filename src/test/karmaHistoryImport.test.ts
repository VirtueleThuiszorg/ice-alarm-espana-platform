// @vitest-environment node
//
// The karmaCRM history parser, against the shapes the real 9,630-record file actually
// contains. Every fixture below is a real record with the text replaced — the field
// names, the nesting and the id relationships are exactly as the API returns them.
//
// The two assertions that matter most:
//
//   * A todo is ONE task, not two. karmaCRM emits a history record when a todo is created
//     and a second when it is updated; 1,517 of the 1,604 todos in Lee's file have both.
//     Counting records rather than todos would put every courtesy call on the member's
//     file twice, and the dedupe key would not catch it because both records are real and
//     distinct.
//
//   * Dates survive. The whole reason for importing six years of notes is that they are
//     dated. A parser that quietly stamped today on everything would pass every other
//     test in this file and destroy the thing being migrated.
import { describe, it, expect } from "vitest";
import {
  contactIdOf,
  parseKarmaHistory,
  summariseHistory,
} from "@/lib/karmaHistoryImport";

const note = (id: number, contactId: number, body: string, at: string) => ({
  id,
  name: "Note",
  history_category_id: 4,
  history_type_id: 3,
  history_record_id: contactId,
  history_record_type: "Contact",
  history_record_label: "Someone",
  occurred_at: at,
  created_at: at,
  external: { body, contact_type_id: 3 },
  participants: [],
});

const todoRecord = (
  id: number,
  todoId: number,
  contactId: number,
  label: string,
  at: string,
  typeId: number
) => ({
  id,
  name: "Todo",
  history_category_id: 8,
  history_type_id: typeId,
  history_record_id: todoId,
  history_record_type: "Todo",
  history_record_label: label,
  occurred_at: at,
  created_at: at,
  external: { label },
  participants: [
    { id: 1, participater_id: contactId, participater_type: "Contact", label: "Someone" },
  ],
});

describe("finding the contact a record belongs to", () => {
  it("reads it straight off a Note", () => {
    expect(contactIdOf(note(1, 11269870, "hello", "2024-01-01T00:00:00Z"))).toBe("11269870");
  });

  it("reads it out of the participants on a Todo, where history_record_id is the todo", () => {
    const record = todoRecord(1, 3954861, 11269870, "Courtesy call", "2024-01-01T00:00:00Z", 3);
    // The trap: history_record_id here is 3954861, which is a todo, not a contact.
    expect(contactIdOf(record)).toBe("11269870");
  });

  it("ignores the User participant, which is the staff member", () => {
    const record = {
      name: "Event",
      history_record_type: "Event",
      history_record_id: 8229816,
      participants: [
        { participater_id: 37659, participater_type: "User", label: "ICE" },
        { participater_id: 11269870, participater_type: "Contact", label: "Someone" },
      ],
    };
    expect(contactIdOf(record)).toBe("11269870");
  });

  it("returns null rather than guessing when there is no contact", () => {
    expect(contactIdOf({ name: "Todo", history_record_type: "Todo", history_record_id: 1 })).toBeNull();
  });
});

describe("notes", () => {
  it("keeps the text, the date and the id", () => {
    const plan = parseKarmaHistory({
      histories: [note(34253876, 11736564, "  She rang about the pendant.  ", "2020-07-15T09:58:28Z")],
    });
    expect(plan.notes).toHaveLength(1);
    expect(plan.notes[0]).toEqual({
      sourceId: "34253876",
      crmContactId: "11736564",
      occurredAt: "2020-07-15T09:58:28Z",
      content: "She rang about the pendant.",
      noteType: "general",
    });
  });

  it("does not stamp today on a note from 2020", () => {
    const plan = parseKarmaHistory({
      histories: [note(1, 2, "old", "2020-07-15T09:58:28Z")],
    });
    expect(plan.notes[0].occurredAt.slice(0, 4)).toBe("2020");
  });

  it("marks a Phone Call as a call, not a general note", () => {
    const record = { ...note(2, 3, "Rang by accident", "2025-09-10T17:47:01Z"), name: "Phone Call" };
    expect(parseKarmaHistory({ histories: [record] }).notes[0].noteType).toBe("call");
  });

  it("drops an empty note and says so, rather than writing a blank one", () => {
    const plan = parseKarmaHistory({ histories: [note(1, 2, "   ", "2024-01-01T00:00:00Z")] });
    expect(plan.notes).toHaveLength(0);
    expect(plan.problems.join(" ")).toMatch(/1 note\(s\) have no text/);
  });

  it("never emits the same history id twice", () => {
    const one = note(99, 2, "same id", "2024-01-01T00:00:00Z");
    const plan = parseKarmaHistory({ histories: [one, { ...one }] });
    expect(plan.notes).toHaveLength(1);
  });
});

describe("todos become one task each, not one per history record", () => {
  const created = todoRecord(34196773, 3952019, 11269870, "Courtesy call ", "2026-08-18T08:47:59Z", 3);
  const updated = todoRecord(34251823, 3952019, 11269870, "Courtesy call ", "2026-09-10T07:50:39Z", 4);

  it("collapses the create and the update into one task", () => {
    const plan = parseKarmaHistory({ histories: [created, updated] });
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].sourceId).toBe("3952019");
  });

  it("takes created_at from the create and completed_at from the update", () => {
    const plan = parseKarmaHistory({ histories: [updated, created] }); // order must not matter
    expect(plan.tasks[0].createdAt).toBe("2026-08-18T08:47:59Z");
    expect(plan.tasks[0].completedAt).toBe("2026-09-10T07:50:39Z");
    expect(plan.tasks[0].status).toBe("completed");
  });

  it("leaves a todo with only a create record pending", () => {
    const plan = parseKarmaHistory({ histories: [created] });
    expect(plan.tasks[0].status).toBe("pending");
    expect(plan.tasks[0].completedAt).toBeNull();
  });

  it("keeps the latest update when there are several", () => {
    const later = todoRecord(9, 3952019, 11269870, "Courtesy call ", "2026-09-11T07:50:39Z", 4);
    const plan = parseKarmaHistory({ histories: [created, updated, later] });
    expect(plan.tasks[0].completedAt).toBe("2026-09-11T07:50:39Z");
  });
});

describe("what counts as a courtesy call", () => {
  const label = (text: string) =>
    parseKarmaHistory({
      histories: [todoRecord(1, 2, 3, text, "2024-01-01T00:00:00Z", 3)],
    }).tasks[0];

  // Every one of these spellings is in the real file.
  it.each([
    "Courtesy call",
    "courtesy call",
    "COURTESY CALL",
    "Courtesy Call",
    "Courtesy  call",
    "Courtesy call  HAPPY BIRTHDAY CALL",
    "Courtesy call - Happy Birthday call",
    "cc",
    "CC",
  ])("%s is a courtesy call", (text) => {
    expect(label(text).taskType).toBe("courtesy_call");
  });

  it("leaves a real task alone", () => {
    expect(label("organise him a key safe").taskType).toBe("general");
  });

  it("keeps the whole label as the title, not just the matched part", () => {
    expect(label("Courtesy call - apparently they will be back for June").title).toBe(
      "Courtesy call - apparently they will be back for June"
    );
  });

  it("moves an over-long label into the description rather than truncating it away", () => {
    const long = `Courtesy call ${"x".repeat(200)}`;
    const task = label(long);
    expect(task.title.length).toBeLessThan(long.length);
    expect(task.description).toBe(long);
  });
});

describe("records that are deliberately not imported", () => {
  it("skips contact-created markers and birthday events, with a reason", () => {
    const plan = parseKarmaHistory({
      histories: [
        { id: 1, name: "Contact", history_record_type: "Contact", history_record_id: 5, external: { label: "Someone" }, occurred_at: "2026-08-28T23:31:14Z" },
        { id: 2, name: "Event", history_record_type: "Event", history_record_id: 6, external: { label: "Neil's Birthday" }, occurred_at: "2024-05-22T15:49:37Z", participants: [{ participater_id: 7, participater_type: "Contact" }] },
      ],
    });
    expect(plan.notes).toHaveLength(0);
    expect(plan.tasks).toHaveLength(0);
    expect(plan.skipped.map((s) => s.kind).sort()).toEqual(["Contact", "Event"]);
    expect(plan.skipped.every((s) => s.reason.length > 0)).toBe(true);
  });
});

describe("records that cannot be placed are reported, never guessed at", () => {
  it("counts a todo with no contact instead of attaching it to someone", () => {
    const orphan = { ...todoRecord(1, 2, 3, "Courtesy call", "2024-01-01T00:00:00Z", 3), participants: [] };
    const plan = parseKarmaHistory({ histories: [orphan] });
    expect(plan.tasks).toHaveLength(0);
    expect(plan.problems.join(" ")).toMatch(/1 todo\(s\) name no contact/);
  });
});

describe("file handling", () => {
  it("accepts the { histories } wrapper, a bare array, and a JSON string", () => {
    const record = note(1, 2, "hello", "2024-01-01T00:00:00Z");
    expect(parseKarmaHistory({ histories: [record] }).notes).toHaveLength(1);
    expect(parseKarmaHistory([record]).notes).toHaveLength(1);
    expect(parseKarmaHistory(JSON.stringify({ histories: [record] })).notes).toHaveLength(1);
  });

  it("reports bad JSON rather than throwing into the click handler", () => {
    const plan = parseKarmaHistory("{not json");
    expect(plan.notes).toHaveLength(0);
    expect(plan.problems[0]).toMatch(/not valid JSON/);
  });

  it("says so when there is nothing in the file", () => {
    expect(parseKarmaHistory({ histories: [] }).problems[0]).toMatch(/no history records/);
  });

  it("ignores `activities`, which is the same todos again with no text or dates", () => {
    const plan = parseKarmaHistory({
      histories: [todoRecord(1, 3952019, 11269870, "Courtesy call", "2024-01-01T00:00:00Z", 3)],
      activities: [{ id: 3952019, all_day: false, contact: { id: 11269870, name: "Someone" } }],
    });
    expect(plan.tasks).toHaveLength(1);
  });
});

describe("the summary an admin reads before pressing Import", () => {
  it("counts what will be written and the span it covers", () => {
    const plan = parseKarmaHistory({
      histories: [
        note(1, 100, "first", "2020-07-15T09:58:28Z"),
        { ...note(2, 100, "a call", "2025-09-10T17:47:01Z"), name: "Phone Call" },
        todoRecord(3, 500, 101, "Courtesy call", "2026-09-10T07:50:39Z", 3),
        todoRecord(4, 501, 101, "organise a key safe", "2023-01-01T00:00:00Z", 3),
      ],
    });
    expect(summariseHistory(plan)).toEqual({
      notes: 2,
      calls: 1,
      tasks: 2,
      courtesyCalls: 1,
      contacts: 2,
      earliest: "2020-07-15T09:58:28Z",
      latest: "2026-09-10T07:50:39Z",
      skipped: 0,
    });
  });
});
