/**
 * karmaCRM history → notes and tasks.
 *
 * The contacts export does not contain the timeline. karmaCRM's own documentation
 * says a backup holds "contacts, companies, deals, cases, and tasks"; the dated
 * notes, the courtesy calls and the device tests on a contact's page are not in
 * that list and are not in the 147-column CSV. They come out of the API instead,
 * as `histories` (with `activities` alongside), and this module turns that JSON
 * into rows the platform can hold.
 *
 * WHAT IS IN THE FILE (9,630 records, 14 July 2020 → 11 September 2026)
 *
 *   name           count   external      becomes
 *   Note           6,226   .body         a member note
 *   Phone Call         2   .body         a member note, note_type 'call'
 *   Todo           3,121   .label        1,604 tasks — see below
 *   Contact          218   .label        nothing: this is "contact created", and
 *                                        members.crm_created_at already has it
 *   Event             63   .label        nothing: these are birthday reminders,
 *                                        and members.date_of_birth already has it
 *
 * THE TODO COUNT IS THE ONE TO BE CAREFUL WITH. 3,121 Todo records are not 3,121
 * courtesy calls. Each todo emits one history record when it is created
 * (history_type_id 3) and a second when it is updated (4); 1,517 of the 1,604
 * distinct todos have both. Importing the records rather than the todos would put
 * every call on the file twice, which is why `sourceId` on a task is the todo's
 * id — `history_record_id` — and never the history record's own id.
 *
 * THE JOIN. Contact id is `history_record_id` when `history_record_type` is
 * "Contact", and otherwise the first Contact in `participants`. That number is the
 * same one in the contacts export's `id` column, already imported to
 * `members.crm_source_id` and `crm_contacts.source_id`, both unique. Checked
 * against the real files on 11 September 2026: all 338 contacts that appear in the
 * history appear in the 431-row export, with no orphans. Two todos out of 9,630
 * records carry no contact at all; they are reported, not guessed at.
 *
 * This module is pure. It parses and maps; `karmaHistoryWriter.ts` decides what to
 * do with the result, and only that file touches the database.
 */

/** karmaCRM's `history_type_id`: 3 when the thing was created, 4 when updated. */
const TYPE_CREATED = 3;
const TYPE_UPDATED = 4;

/**
 * Which labels are a courtesy call. The export spells it 81 different ways —
 * "Courtesy call" 2,324 times, "courtesy call" 248, "COURTESY CALL" 197,
 * "Courtesy  call" with two spaces 14, "cc" 19, "CC" 4 — so this matches the
 * opening of the label rather than the whole of it, which also catches the
 * "Courtesy call - Happy Birthday call" variants without needing to list them.
 */
const COURTESY_CALL = /^\s*(courtesy\s+call|cc)\b/i;

/** Postgres will take a longer title; a task list will not show one. The rest is kept. */
const TITLE_MAX = 120;

export type HistoryNoteType = "general" | "call";
export type HistoryTaskType = "courtesy_call" | "general";

export interface HistoryNote {
  /** The history record's own id. Unique across the file — checked: 9,630 of 9,630. */
  sourceId: string;
  /** karmaCRM's contact id, as text. Joins to members.crm_source_id / crm_contacts.source_id. */
  crmContactId: string;
  /** ISO 8601, UTC, straight from the API. The whole reason for importing these. */
  occurredAt: string;
  content: string;
  noteType: HistoryNoteType;
}

export interface HistoryTask {
  /** The TODO's id, not the history record's — see the note above about 3,121 vs 1,604. */
  sourceId: string;
  crmContactId: string;
  title: string;
  /** Set only when the label did not fit in `title`; never a summary. */
  description: string | null;
  taskType: HistoryTaskType;
  createdAt: string;
  /** When the todo was last updated, which for these is when the call was made. */
  completedAt: string | null;
  status: "completed" | "pending";
}

export interface HistoryPlan {
  notes: HistoryNote[];
  tasks: HistoryTask[];
  /** Every distinct karmaCRM contact id the plan refers to. */
  crmContactIds: string[];
  /** Records deliberately not imported, by kind, with the reason. */
  skipped: { kind: string; count: number; reason: string }[];
  /** Records that could not be imported and should have been. Never silent. */
  problems: string[];
}

interface RawHistory {
  id?: unknown;
  name?: unknown;
  history_type_id?: unknown;
  history_record_id?: unknown;
  history_record_type?: unknown;
  history_record_label?: unknown;
  occurred_at?: unknown;
  created_at?: unknown;
  external?: unknown;
  participants?: unknown;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  return "";
}

function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * The contact this record hangs off.
 *
 * A Note names its contact directly. A Todo or an Event names the todo or the
 * event, and the contact is a participant — `participater_type` "Contact",
 * alongside a "User" participant which is the staff member and is not wanted here.
 */
export function contactIdOf(record: RawHistory): string | null {
  if (str(record.history_record_type) === "Contact") {
    const direct = str(record.history_record_id);
    if (direct) return direct;
  }
  const participants = Array.isArray(record.participants) ? record.participants : [];
  for (const p of participants) {
    const part = obj(p);
    if (str(part.participater_type) === "Contact") {
      const id = str(part.participater_id);
      if (id) return id;
    }
  }
  return null;
}

/** `occurred_at` is what the screen shows; `created_at` is the fallback, not a default. */
function timestampOf(record: RawHistory): string | null {
  const occurred = str(record.occurred_at).trim();
  if (occurred) return occurred;
  const created = str(record.created_at).trim();
  return created || null;
}

function titleAndDescription(label: string): { title: string; description: string | null } {
  const clean = label.replace(/\s+/g, " ").trim();
  if (clean.length <= TITLE_MAX) return { title: clean, description: null };
  // Cut on a word boundary where there is one, so a title never ends mid-word.
  const cut = clean.lastIndexOf(" ", TITLE_MAX);
  const at = cut > TITLE_MAX / 2 ? cut : TITLE_MAX;
  return { title: `${clean.slice(0, at)}…`, description: clean };
}

/**
 * Accepts the file as text or as already-parsed JSON, and tolerates either the
 * `{ histories, activities }` wrapper the browser pull writes or a bare array of
 * history records.
 *
 * `activities` is read for nothing: its 1,603 rows are the same todos again, with
 * `all_day` and `todo_category_id` and no text, no date and no status. Every one
 * of its ids already appears among the todos below (checked: 1,603 of 1,603), so
 * importing it would add a second copy of each call and no new information.
 */
export function parseKarmaHistory(input: string | unknown): HistoryPlan {
  let parsed: unknown = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch (e) {
      return {
        notes: [],
        tasks: [],
        crmContactIds: [],
        skipped: [],
        problems: [`file is not valid JSON: ${(e as Error).message}`],
      };
    }
  }

  const wrapper = obj(parsed);
  const histories: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(wrapper.histories)
      ? (wrapper.histories as unknown[])
      : [];

  const problems: string[] = [];
  if (histories.length === 0) {
    problems.push(
      "no history records found — expected { histories: [...] } or a bare array of records"
    );
  }

  const notes: HistoryNote[] = [];
  const seenNoteIds = new Set<string>();
  /** Todos are assembled across their two records, so they are collected first. */
  const todos = new Map<
    string,
    { contactId: string; label: string; created: string | null; updated: string | null }
  >();
  const skippedCounts = new Map<string, number>();
  let orphanNotes = 0;
  let orphanTodos = 0;
  let emptyNotes = 0;

  for (const raw of histories) {
    const record = obj(raw) as RawHistory;
    const kind = str(record.name).trim();
    const external = obj(record.external);
    const contactId = contactIdOf(record);
    const when = timestampOf(record);

    if (kind === "Note" || kind === "Phone Call") {
      const content = str(external.body).trim();
      const sourceId = str(record.id).trim();
      if (!content) {
        emptyNotes += 1;
        continue;
      }
      if (!contactId) {
        orphanNotes += 1;
        continue;
      }
      if (!sourceId) {
        problems.push(`a ${kind} record has no id, so it cannot be de-duplicated — skipped`);
        continue;
      }
      if (seenNoteIds.has(sourceId)) continue;
      seenNoteIds.add(sourceId);
      notes.push({
        sourceId,
        crmContactId: contactId,
        occurredAt: when ?? new Date().toISOString(),
        content,
        noteType: kind === "Phone Call" ? "call" : "general",
      });
      continue;
    }

    if (kind === "Todo") {
      const todoId = str(record.history_record_id).trim();
      if (!todoId) {
        problems.push("a Todo record has no todo id — skipped");
        continue;
      }
      if (!contactId) {
        orphanTodos += 1;
        continue;
      }
      const label = str(external.label) || str(record.history_record_label);
      const existing = todos.get(todoId);
      const isUpdate = Number(record.history_type_id) === TYPE_UPDATED;
      const isCreate = Number(record.history_type_id) === TYPE_CREATED;
      if (!existing) {
        todos.set(todoId, {
          contactId,
          label,
          created: isUpdate ? null : when,
          updated: isUpdate ? when : null,
        });
      } else {
        if (label && !existing.label) existing.label = label;
        if (isCreate && when && (!existing.created || when < existing.created)) {
          existing.created = when;
        }
        if (isUpdate && when && (!existing.updated || when > existing.updated)) {
          existing.updated = when;
        }
        // A todo with two records and neither flagged as a create still needs a
        // created_at; the earliest timestamp seen is the honest answer.
        if (!existing.created && when) existing.created = when;
      }
      continue;
    }

    const reasonFor =
      kind === "Contact"
        ? "contact-created marker — already on members.crm_created_at"
        : kind === "Event"
          ? "birthday reminder — already on members.date_of_birth"
          : "unrecognised record kind";
    const key = `${kind || "(no name)"}|${reasonFor}`;
    skippedCounts.set(key, (skippedCounts.get(key) ?? 0) + 1);
  }

  const tasks: HistoryTask[] = [];
  for (const [sourceId, todo] of todos) {
    const { title, description } = titleAndDescription(todo.label || "Task");
    const createdAt = todo.created ?? todo.updated;
    if (!createdAt) {
      problems.push(`todo ${sourceId} has no date at all — skipped`);
      continue;
    }
    tasks.push({
      sourceId,
      crmContactId: todo.contactId,
      title: title || "Task",
      description,
      taskType: COURTESY_CALL.test(todo.label) ? "courtesy_call" : "general",
      createdAt,
      completedAt: todo.updated,
      status: todo.updated ? "completed" : "pending",
    });
  }

  if (orphanNotes > 0) {
    problems.push(`${orphanNotes} note(s) name no contact and cannot be placed`);
  }
  if (orphanTodos > 0) {
    problems.push(`${orphanTodos} todo(s) name no contact and cannot be placed`);
  }
  if (emptyNotes > 0) {
    problems.push(`${emptyNotes} note(s) have no text`);
  }

  const skipped = [...skippedCounts.entries()]
    .map(([key, count]) => {
      const [kind, reason] = key.split("|");
      return { kind, count, reason };
    })
    .sort((a, b) => b.count - a.count);

  const crmContactIds = [
    ...new Set([...notes.map((n) => n.crmContactId), ...tasks.map((t) => t.crmContactId)]),
  ];

  return { notes, tasks, crmContactIds, skipped, problems };
}

export interface HistorySummary {
  notes: number;
  calls: number;
  tasks: number;
  courtesyCalls: number;
  contacts: number;
  earliest: string | null;
  latest: string | null;
  skipped: number;
}

export function summariseHistory(plan: HistoryPlan): HistorySummary {
  const dates = [
    ...plan.notes.map((n) => n.occurredAt),
    ...plan.tasks.map((t) => t.createdAt),
  ].sort();
  return {
    notes: plan.notes.length,
    calls: plan.notes.filter((n) => n.noteType === "call").length,
    tasks: plan.tasks.length,
    courtesyCalls: plan.tasks.filter((t) => t.taskType === "courtesy_call").length,
    contacts: plan.crmContactIds.length,
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
    skipped: plan.skipped.reduce((n, s) => n + s.count, 0),
  };
}
