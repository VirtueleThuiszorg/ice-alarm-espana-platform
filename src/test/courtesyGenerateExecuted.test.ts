// @vitest-environment node
//
// ═══ "THE GENERATOR DOES NOT QUEUE THE SAME MEMBER TWICE" — run, not described ═══
//
// The run lived inside `Deno.serve()`, so every assertion about it could only be a source scan.
// This repo has already paid for that once — `billing-migration-run.ts` was split out after
// three defects shipped that were each written, each read, and never run.
//
// The claim here is exactly that kind: the old dedupe reads perfectly well and is wrong. It
// asked "was a courtesy task created for this member TODAY?", which guards against the job being
// invoked twice in one night and is blind to a pending task created on any other day. As soon as
// `close_courtesy_call` raises next month's call when an operator finishes one, that blindness
// puts a member in the queue twice.
//
// WHAT IS NOT HERE: the database's own rules. Constraints, RLS and the RPC are executed against
// real PostgreSQL in `scripts/rls/isolation.sql`. This answers the other question — given what
// the database would have returned, what does the run DO?

import { describe, expect, it } from "vitest";

import { fakeSupabase, type Seed } from "./helpers/fakeSupabase";

/* eslint-disable @typescript-eslint/no-explicit-any */
const RUN_MOD = "../../supabase/functions/_shared/courtesy-generate-run.ts";
const { runCourtesyGeneration } = (await import(/* @vite-ignore */ RUN_MOD)) as any;

/** A fixed today. A schedule is relative to one, and a suite that passes in September and fails
    in October has proved nothing. */
const TODAY = new Date("2026-09-19T09:00:00");

const member = (over: Record<string, unknown> = {}) => ({
  id: "m-1",
  first_name: "Rosa",
  last_name: "Cortes",
  phone: "+34600300001",
  status: "active",
  courtesy_calls_enabled: true,
  courtesy_call_frequency: "monthly",
  next_courtesy_call_date: "2026-09-19",
  ...over,
});

const seed = (over: Partial<Seed> = {}): Seed => ({
  members: [member()],
  tasks: [],
  ...over,
});

const courtesyInserts = (db: ReturnType<typeof fakeSupabase>) =>
  db.writes.filter(
    (w) => w.table === "tasks" && w.op === "insert" && w.values.task_type === "courtesy_call",
  );

describe("a member who is due and has nothing waiting", () => {
  it("gets exactly one courtesy call task", async () => {
    const db = fakeSupabase(seed());
    const result = await runCourtesyGeneration(db.client, TODAY);

    expect(result.tasksCreated).toBe(1);
    expect(courtesyInserts(db)).toHaveLength(1);
    expect(courtesyInserts(db)[0].values).toMatchObject({
      member_id: "m-1",
      task_type: "courtesy_call",
      status: "pending",
      title: "Monthly Courtesy Call - Rosa Cortes",
    });
  });

  it("has their next call moved on by the shared rule", async () => {
    const db = fakeSupabase(seed());
    await runCourtesyGeneration(db.client, TODAY);

    const update = db.writes.find((w) => w.table === "members" && w.op === "update");
    expect(update?.values).toMatchObject({ next_courtesy_call_date: "2026-10-19" });
  });

  it("month end is clamped, not overflowed — 31 Jan becomes 28 Feb", async () => {
    const db = fakeSupabase(seed({ members: [member({ next_courtesy_call_date: "2026-01-31" })] }));
    await runCourtesyGeneration(db.client, new Date("2026-01-31T09:00:00"));

    const update = db.writes.find((w) => w.table === "members" && w.op === "update");
    expect(update?.values).toMatchObject({ next_courtesy_call_date: "2026-02-28" });
  });
});

describe("a member who already has a call waiting", () => {
  /**
   * THE DEFECT THIS PR IS ABOUT. The pending task was created a month ago by
   * `close_courtesy_call` when the last call was closed. The old dedupe looked only at tasks
   * created TODAY, found none, and queued the member a second time.
   */
  it("is skipped when the pending task was created on another day", async () => {
    const db = fakeSupabase(
      seed({
        tasks: [
          {
            id: "t-existing",
            member_id: "m-1",
            task_type: "courtesy_call",
            status: "pending",
            created_at: "2026-08-19T17:00:00.000Z",
          },
        ],
      }),
    );

    const result = await runCourtesyGeneration(db.client, TODAY);

    expect(result.tasksCreated).toBe(0);
    expect(result.tasksSkipped).toBe(1);
    expect(courtesyInserts(db)).toHaveLength(0);
  });

  it("is skipped when the task is in progress rather than pending", async () => {
    const db = fakeSupabase(
      seed({
        tasks: [
          { id: "t-open", member_id: "m-1", task_type: "courtesy_call", status: "in_progress" },
        ],
      }),
    );

    expect((await runCourtesyGeneration(db.client, TODAY)).tasksCreated).toBe(0);
  });

  it("is NOT skipped when the only task is already completed", async () => {
    const db = fakeSupabase(
      seed({
        tasks: [
          { id: "t-done", member_id: "m-1", task_type: "courtesy_call", status: "completed" },
        ],
      }),
    );

    expect((await runCourtesyGeneration(db.client, TODAY)).tasksCreated).toBe(1);
  });

  it("is NOT skipped by another member's pending call", async () => {
    const db = fakeSupabase(
      seed({
        tasks: [
          { id: "t-other", member_id: "m-2", task_type: "courtesy_call", status: "pending" },
        ],
      }),
    );

    expect((await runCourtesyGeneration(db.client, TODAY)).tasksCreated).toBe(1);
  });

  it("is NOT skipped by a pending task of a different type", async () => {
    const db = fakeSupabase(
      seed({
        tasks: [{ id: "t-follow", member_id: "m-1", task_type: "follow_up", status: "pending" }],
      }),
    );

    expect((await runCourtesyGeneration(db.client, TODAY)).tasksCreated).toBe(1);
  });
});

describe("a member who is not due", () => {
  it("is left alone when the next call is still in the future", async () => {
    const db = fakeSupabase(seed({ members: [member({ next_courtesy_call_date: "2026-10-19" })] }));

    const result = await runCourtesyGeneration(db.client, TODAY);
    expect(result.tasksCreated).toBe(0);
    expect(courtesyInserts(db)).toHaveLength(0);
  });

  it("is due when the date has passed", async () => {
    const db = fakeSupabase(seed({ members: [member({ next_courtesy_call_date: "2026-08-19" })] }));
    expect((await runCourtesyGeneration(db.client, TODAY)).tasksCreated).toBe(1);
  });

  it("is due when they have never had a next-call date", async () => {
    const db = fakeSupabase(seed({ members: [member({ next_courtesy_call_date: null })] }));
    expect((await runCourtesyGeneration(db.client, TODAY)).tasksCreated).toBe(1);
  });
});

describe("running the job twice", () => {
  /**
   * The old dedupe's ONE job. It must keep working, or this change trades one duplicate for
   * another: the retry that a failed invocation prompts would queue everybody a second time.
   */
  it("creates nothing the second time, because the first task is now pending", async () => {
    const db = fakeSupabase(seed());

    const first = await runCourtesyGeneration(db.client, TODAY);
    expect(first.tasksCreated).toBe(1);

    // The fake does not apply writes back to its store, so the second run is given the state the
    // first one produced: the member now has a pending task and a next date a month out.
    const after = fakeSupabase({
      members: [member({ next_courtesy_call_date: "2026-10-19" })],
      tasks: [
        { id: "t-new", member_id: "m-1", task_type: "courtesy_call", status: "pending" },
      ],
    });
    const second = await runCourtesyGeneration(after.client, TODAY);

    expect(second.tasksCreated).toBe(0);
    expect(courtesyInserts(after)).toHaveLength(0);
  });
});
