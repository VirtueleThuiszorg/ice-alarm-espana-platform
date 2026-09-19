/**
 * THE COURTESY-CALL GENERATOR'S RUN, SEPARATED SO IT CAN BE EXECUTED.
 *
 * It used to live inside `Deno.serve()` in `generate-courtesy-calls/index.ts`, which meant every
 * assertion about it was a source scan — "the file contains `.eq('task_type', 'courtesy_call')`".
 * That proves a line is written. It does not prove a member is not queued twice.
 *
 * This repo has already paid for that distinction once: `billing-migration-run.ts` was split out
 * for the same reason, after three defects shipped that were each written, each read, and never
 * run. The idempotency claim below is exactly the kind that reads correctly and fails in
 * production, so it is executed in `src/test/courtesyGenerateExecuted.test.ts` against a fake
 * PostgREST, and the database's own rules stay where they belong — real PostgreSQL, in
 * `scripts/rls/isolation.sql`.
 */

import { nextCallDateString } from "./courtesy-schedule.ts";

/* The client is typed structurally rather than imported: this module is loaded both by Deno (via
   a URL specifier) and by vitest (through a relative path), and only one of those can resolve
   `@supabase/supabase-js`. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export interface CourtesyGenerationResult {
  tasksCreated: number;
  tasksSkipped: number;
  totalMembersChecked: number;
}

interface MemberRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  courtesy_call_frequency?: string | null;
  next_courtesy_call_date?: string | null;
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  "bi-weekly": "Bi-weekly",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

const frequencyLabel = (frequency: string): string => FREQUENCY_LABELS[frequency] ?? "Monthly";

/** A date as the local `YYYY-MM-DD` the `next_courtesy_call_date` column holds. */
const dateString = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Create today's courtesy-call tasks.
 *
 * `today` is a parameter rather than `new Date()` inside, so a test can state the day it is
 * generating for and the month-end cases are assertable without freezing the clock.
 */
export async function runCourtesyGeneration(
  supabase: Client,
  today: Date,
): Promise<CourtesyGenerationResult> {
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select(
      "id, first_name, last_name, phone, created_at, courtesy_call_frequency, next_courtesy_call_date",
    )
    .eq("status", "active")
    .eq("courtesy_calls_enabled", true);

  if (membersError) throw membersError;

  const rows: MemberRow[] = members ?? [];
  let tasksCreated = 0;
  let tasksSkipped = 0;

  for (const member of rows) {
    const frequency = member.courtesy_call_frequency || "monthly";

    // Due when the member's next-call date has arrived, or when they have never had one.
    const nextCallDate = member.next_courtesy_call_date;
    if (nextCallDate && nextCallDate > dateString(today)) continue;

    /*
      SKIP A MEMBER WHO ALREADY HAS A CALL WAITING — not one who happens to have had a task
      created today.

      The old window was `created_at` between midnight and midnight tonight, which answers a
      different question: "did THIS JOB already run today?". It guarded against a double
      invocation and was blind to a pending task created on any other day.

      That blindness costs something real now that `close_courtesy_call` raises the next call the
      moment an operator finishes one: the member has a pending task dated next month, this job
      sees nothing created TODAY, creates a second, and the member is in the queue twice. Two
      operators ring the same person about the same check-in, and one closes a task the other
      has already had the conversation for.

      "Is there already something to do for this member?" is also idempotent against the old
      failure mode — a task created earlier today is pending too — so nothing is lost.
    */
    const { data: existingTasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id")
      .eq("member_id", member.id)
      .eq("task_type", "courtesy_call")
      .neq("status", "completed")
      .limit(1);

    if (tasksError) {
      console.error(`Error checking existing tasks for member ${member.id}:`, tasksError);
      continue;
    }

    if (existingTasks && existingTasks.length > 0) {
      tasksSkipped++;
      continue;
    }

    const dueDate = new Date(today.getTime());
    dueDate.setHours(17, 0, 0, 0);

    const label = frequencyLabel(frequency);
    const { error: insertError } = await supabase.from("tasks").insert({
      title: `${label} Courtesy Call - ${member.first_name} ${member.last_name}`,
      description: `${label} check-in call for ${member.first_name} ${member.last_name}. Phone: ${member.phone || "N/A"}`,
      member_id: member.id,
      task_type: "courtesy_call",
      priority: "normal",
      status: "pending",
      due_date: dueDate.toISOString(),
    });

    if (insertError) {
      console.error(`Error creating courtesy call task for member ${member.id}:`, insertError);
      continue;
    }

    tasksCreated++;

    await supabase
      .from("members")
      .update({ next_courtesy_call_date: nextCallDateString(frequency, today) })
      .eq("id", member.id);
  }

  return { tasksCreated, tasksSkipped, totalMembersChecked: rows.length };
}
