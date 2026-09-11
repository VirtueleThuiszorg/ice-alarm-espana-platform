/**
 * Writing the karmaCRM history to the platform.
 *
 * `karmaHistoryImport.ts` turns the API's JSON into notes and tasks. This decides
 * where each one lands and in what order, and is the only part that knows a
 * database exists — the adapter is in `crmImportDb.ts`, and the interface below is
 * everything it is allowed to do.
 *
 * THREE RULES, ALL OF THEM LEARNED THE HARD WAY ON THIS DATA
 *
 * 1. A note always hangs off something. The contacts import creates a `members`
 *    row for the 121 live files and leaves the other 310 as `crm_contacts`, so
 *    resolving a karmaCRM contact id means checking both. A record that resolves
 *    to neither is REPORTED, never dropped quietly and never attached to a guess.
 *
 * 2. De-duplication is on the source id, never on the text. `crmImportDb`'s
 *    existing `noteExists` compares `content` for equality against an unindexed
 *    column; at 6,228 notes, the longest of them 19,340 characters, that is a
 *    sequential scan per note over a table that is growing as you scan it. The
 *    unique index added in 20260911140000 makes the same question an id lookup,
 *    and the lookups here are batched a few hundred at a time rather than one
 *    round trip per record.
 *
 * 3. A failed chunk does not fail the run. 9,628 records go in over dozens of
 *    round trips; one of them rejecting must leave the other dozens written and
 *    say which one did not, because the alternative is re-running the whole import
 *    to find out. Everything already written stays written — that is safe here
 *    precisely because of rule 2: a second run inserts only what is missing.
 */
import type { HistoryNote, HistoryPlan, HistoryTask } from "./karmaHistoryImport";

/** Written into `source` on every row this module inserts. */
export const HISTORY_SOURCE = "karmacrm";

/** How many rows go in one insert, and how many ids in one lookup. */
const CHUNK = 200;

export type HistoryOwner =
  | { kind: "member"; id: string }
  | { kind: "crm_contact"; id: string };

export interface NoteRow {
  member_id: string | null;
  crm_contact_id: string | null;
  content: string;
  note_type: string;
  created_at: string;
  source: string;
  source_id: string;
}

export interface TaskRow {
  member_id: string | null;
  crm_contact_id: string | null;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  source: string;
  source_id: string;
}

export interface HistoryDb {
  /**
   * karmaCRM contact id → where it lives now. A member wins over a CRM contact:
   * once a contact has been converted, the member record is the live file and the
   * CRM row is the husk it came from.
   */
  resolveOwners(crmContactIds: string[]): Promise<Map<string, HistoryOwner>>;
  /** Of these `source_id`s, which are already in `member_notes` for this source. */
  existingNoteSourceIds(sourceIds: string[]): Promise<Set<string>>;
  existingTaskSourceIds(sourceIds: string[]): Promise<Set<string>>;
  insertNotes(rows: NoteRow[]): Promise<void>;
  insertTasks(rows: TaskRow[]): Promise<void>;
}

export interface HistoryApplyResult {
  notesCreated: number;
  notesAlreadyPresent: number;
  tasksCreated: number;
  tasksAlreadyPresent: number;
  /** Records whose karmaCRM contact is not in the platform at all. */
  unplaced: number;
  /** Those contacts' karmaCRM ids, so the gap can be looked at rather than guessed. */
  unplacedContactIds: string[];
  /** Written to members vs to CRM contacts — the cancelled and deceased files. */
  toMembers: number;
  toCrmContacts: number;
  problems: string[];
}

export interface ApplyHistoryOptions {
  /** Resolve and count, write nothing. */
  dryRun?: boolean;
  chunkSize?: number;
  onProgress?: (done: number, total: number) => void;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function ownerColumns(owner: HistoryOwner): { member_id: string | null; crm_contact_id: string | null } {
  return owner.kind === "member"
    ? { member_id: owner.id, crm_contact_id: null }
    : { member_id: null, crm_contact_id: owner.id };
}

export function noteRowFor(note: HistoryNote, owner: HistoryOwner): NoteRow {
  return {
    ...ownerColumns(owner),
    content: note.content,
    note_type: note.noteType,
    // The point of the whole exercise. Without this every note from 2020 reads as
    // written the day the import ran, and the history is worth nothing.
    created_at: note.occurredAt,
    source: HISTORY_SOURCE,
    source_id: note.sourceId,
  };
}

export function taskRowFor(task: HistoryTask, owner: HistoryOwner): TaskRow {
  return {
    ...ownerColumns(owner),
    title: task.title,
    description: task.description,
    task_type: task.taskType,
    status: task.status,
    created_at: task.createdAt,
    completed_at: task.completedAt,
    source: HISTORY_SOURCE,
    source_id: task.sourceId,
  };
}

export async function applyHistoryPlan(
  db: HistoryDb,
  plan: HistoryPlan,
  options: ApplyHistoryOptions = {}
): Promise<HistoryApplyResult> {
  const size = options.chunkSize ?? CHUNK;
  const result: HistoryApplyResult = {
    notesCreated: 0,
    notesAlreadyPresent: 0,
    tasksCreated: 0,
    tasksAlreadyPresent: 0,
    unplaced: 0,
    unplacedContactIds: [],
    toMembers: 0,
    toCrmContacts: 0,
    problems: [...plan.problems],
  };

  const owners = new Map<string, HistoryOwner>();
  for (const ids of chunk(plan.crmContactIds, size)) {
    const found = await db.resolveOwners(ids);
    for (const [k, v] of found) owners.set(k, v);
  }

  const unplaced = new Set<string>();

  const existingNotes = new Set<string>();
  for (const ids of chunk(plan.notes.map((n) => n.sourceId), size)) {
    for (const id of await db.existingNoteSourceIds(ids)) existingNotes.add(id);
  }
  const existingTasks = new Set<string>();
  for (const ids of chunk(plan.tasks.map((t) => t.sourceId), size)) {
    for (const id of await db.existingTaskSourceIds(ids)) existingTasks.add(id);
  }

  const noteRows: NoteRow[] = [];
  for (const note of plan.notes) {
    if (existingNotes.has(note.sourceId)) {
      result.notesAlreadyPresent += 1;
      continue;
    }
    const owner = owners.get(note.crmContactId);
    if (!owner) {
      result.unplaced += 1;
      unplaced.add(note.crmContactId);
      continue;
    }
    if (owner.kind === "member") result.toMembers += 1;
    else result.toCrmContacts += 1;
    noteRows.push(noteRowFor(note, owner));
  }

  const taskRows: TaskRow[] = [];
  for (const task of plan.tasks) {
    if (existingTasks.has(task.sourceId)) {
      result.tasksAlreadyPresent += 1;
      continue;
    }
    const owner = owners.get(task.crmContactId);
    if (!owner) {
      result.unplaced += 1;
      unplaced.add(task.crmContactId);
      continue;
    }
    if (owner.kind === "member") result.toMembers += 1;
    else result.toCrmContacts += 1;
    taskRows.push(taskRowFor(task, owner));
  }

  result.unplacedContactIds = [...unplaced].sort();

  if (options.dryRun) return result;

  const total = noteRows.length + taskRows.length;
  let done = 0;

  for (const batch of chunk(noteRows, size)) {
    try {
      await db.insertNotes(batch);
      result.notesCreated += batch.length;
    } catch (e) {
      // Rule 3: name the batch and carry on. Everything before it is written, and
      // a re-run skips what is written because the dedupe is on the source id.
      result.problems.push(
        `${batch.length} note(s) failed to write (source ids ${batch[0].source_id}…${batch[batch.length - 1].source_id}): ${(e as Error).message}`
      );
    }
    done += batch.length;
    options.onProgress?.(done, total);
  }

  for (const batch of chunk(taskRows, size)) {
    try {
      await db.insertTasks(batch);
      result.tasksCreated += batch.length;
    } catch (e) {
      result.problems.push(
        `${batch.length} task(s) failed to write (source ids ${batch[0].source_id}…${batch[batch.length - 1].source_id}): ${(e as Error).message}`
      );
    }
    done += batch.length;
    options.onProgress?.(done, total);
  }

  return result;
}
