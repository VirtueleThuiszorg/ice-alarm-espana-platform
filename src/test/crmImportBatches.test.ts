// @vitest-environment node
//
// Importing a few at a time (Lee, 18 Sep 2026: "I wanted to be able to add 10 uploading at a
// time so I can watch them and make sure they all imported good").
//
// The batching itself lives in the two import screens, which hold the cursor. What is testable
// without a browser — and is where a batched import actually goes wrong — is the SLICING: that
// the batches together are exactly the file and nothing more, that no record is in two of them,
// and above all that a person's history is never split across a stop. That last one is the
// whole point: a batch that came back clean has to mean a file that is complete, or checking
// the batch proves nothing.
import { describe, it, expect } from "vitest";
import {
  parseKarmaHistory,
  planForContacts,
  volumeByContact,
  type HistoryPlan,
} from "@/lib/karmaHistoryImport";

const note = (id: number, contactId: number, label: string, body = "text") => ({
  id,
  name: "Note",
  history_record_id: contactId,
  history_record_type: "Contact",
  history_record_label: label,
  occurred_at: "2021-03-04T10:00:00Z",
  external: { body },
});

const todo = (todoId: number, contactId: number, label: string) => ({
  id: todoId * 10,
  name: "Todo",
  history_type_id: 3,
  history_record_id: todoId,
  history_record_type: "Todo",
  occurred_at: "2024-06-01T09:00:00Z",
  external: { label: "Courtesy call" },
  participants: [{ participater_id: contactId, participater_type: "Contact", label }],
});

/** Three people with deliberately uneven files, which is what the real export looks like. */
function threePeople(): HistoryPlan {
  return parseKarmaHistory({
    histories: [
      note(1, 100, "Audrey May Taylor"),
      note(2, 100, "Audrey May Taylor"),
      note(3, 100, "Audrey May Taylor"),
      todo(50, 100, "Audrey May Taylor"),
      note(4, 200, "John Murphy CANCELLED"),
      todo(51, 300, "Irene Wagner"),
    ],
  });
}

describe("the name on each contact, so a batch can be read", () => {
  it("comes off the note's own label", () => {
    expect(threePeople().crmContactNames["100"]).toBe("Audrey May Taylor");
  });

  it("comes off the Contact participant on a todo, where the record is the todo", () => {
    expect(threePeople().crmContactNames["300"]).toBe("Irene Wagner");
  });

  it("is left exactly as karmaCRM has it, CANCELLED and all", () => {
    // Tidying it here would make the name on screen disagree with the name in the CRM, which
    // is the one thing somebody checking a batch is comparing against.
    expect(threePeople().crmContactNames["200"]).toBe("John Murphy CANCELLED");
  });

  it("falls back to the id rather than showing an empty row", () => {
    const plan = parseKarmaHistory({
      histories: [{ ...note(1, 100, ""), history_record_label: "" }],
    });
    expect(plan.crmContactNames["100"]).toBe("100");
  });
});

describe("what each person brings, for the line in the batch", () => {
  it("counts notes and calls per person", () => {
    expect(volumeByContact(threePeople())).toEqual([
      { crmContactId: "100", name: "Audrey May Taylor", notes: 3, tasks: 1 },
      { crmContactId: "200", name: "John Murphy CANCELLED", notes: 1, tasks: 0 },
      { crmContactId: "300", name: "Irene Wagner", notes: 0, tasks: 1 },
    ]);
  });

  it("lists every contact in the plan, including one with only a call", () => {
    expect(volumeByContact(threePeople())).toHaveLength(3);
  });
});

describe("a batch is whole people, never half of one", () => {
  const plan = threePeople();

  it("takes everything belonging to the named contacts", () => {
    const batch = planForContacts(plan, ["100"]);
    expect(batch.notes.map((n) => n.sourceId)).toEqual(["1", "2", "3"]);
    expect(batch.tasks.map((t) => t.sourceId)).toEqual(["50"]);
  });

  it("takes nothing belonging to anyone else", () => {
    const batch = planForContacts(plan, ["200"]);
    expect(batch.notes.every((n) => n.crmContactId === "200")).toBe(true);
    expect(batch.tasks).toHaveLength(0);
  });

  it("carries the names through, so the batch can still be read by person", () => {
    expect(planForContacts(plan, ["300"]).crmContactNames["300"]).toBe("Irene Wagner");
  });

  it("does not repeat the file's own problems once per batch", () => {
    // They belong to the file. Repeating them every press would bury the ones a batch
    // actually produced, which are the ones worth stopping for.
    const withProblem = parseKarmaHistory({
      histories: [note(1, 100, "Audrey May Taylor"), { ...todo(9, 0, "nobody"), participants: [] }],
    });
    expect(withProblem.problems.length).toBeGreaterThan(0);
    expect(planForContacts(withProblem, ["100"]).problems).toEqual([]);
  });

  it("an unknown contact id yields an empty batch rather than throwing", () => {
    const batch = planForContacts(plan, ["999999"]);
    expect(batch.notes).toHaveLength(0);
    expect(batch.tasks).toHaveLength(0);
  });
});

describe("the batches together are the file, exactly once each", () => {
  const plan = threePeople();
  const people = volumeByContact(plan).map((v) => v.crmContactId);

  /** Walk the plan in batches of `size`, the way the screen's cursor does. */
  const walk = (size: number) => {
    const noteIds: string[] = [];
    const taskIds: string[] = [];
    for (let i = 0; i < people.length; i += size) {
      const batch = planForContacts(plan, people.slice(i, i + size));
      noteIds.push(...batch.notes.map((n) => n.sourceId));
      taskIds.push(...batch.tasks.map((t) => t.sourceId));
    }
    return { noteIds, taskIds };
  };

  it.each([1, 2, 3, 10])("at %i people per press", (size) => {
    const { noteIds, taskIds } = walk(size);

    // Nothing lost.
    expect([...noteIds].sort()).toEqual(plan.notes.map((n) => n.sourceId).sort());
    expect([...taskIds].sort()).toEqual(plan.tasks.map((t) => t.sourceId).sort());
    // Nothing written twice — which would be caught by the unique index in production, but
    // as a failed batch rather than as the quiet no-op it should be.
    expect(new Set(noteIds).size).toBe(noteIds.length);
    expect(new Set(taskIds).size).toBe(taskIds.length);
  });

  it("a batch size larger than the file is the whole file, not an error", () => {
    const batch = planForContacts(plan, people.slice(0, 500));
    expect(batch.notes).toHaveLength(plan.notes.length);
    expect(batch.tasks).toHaveLength(plan.tasks.length);
  });

  it("stopping half way leaves the earlier batches exactly as they were", () => {
    // The cursor is the only state a stop keeps, so the first two people written and then
    // abandoned must be the same rows as the first two people of a full run.
    const stopped = planForContacts(plan, people.slice(0, 2));
    const full = planForContacts(plan, people);
    const firstTwo = full.notes.filter((n) => people.slice(0, 2).includes(n.crmContactId));
    expect(stopped.notes.map((n) => n.sourceId)).toEqual(firstTwo.map((n) => n.sourceId));
  });
});
