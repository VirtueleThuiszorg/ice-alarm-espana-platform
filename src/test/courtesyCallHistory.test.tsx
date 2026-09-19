/**
 * A COURTESY CALL IN THE MEMBER'S HISTORY — and the one thing staff must not be able to type.
 *
 * Two claims:
 *
 *   1. a courtesy call reads as a courtesy call, with its outcome visible. "No answer" three
 *      months running is the thing somebody scanning this list needs to see, and before this the
 *      note fell back to the "General" badge with "[no_answer]" buried in the paragraph;
 *   2. NOBODY CAN HAND-WRITE ONE. A real courtesy note is written by `close_courtesy_call` and
 *      carries a task, an outcome and a move to the member's next-call date. A typed one would
 *      look identical in this list while none of that happened — a note claiming a vulnerable
 *      person was checked on when nobody rang.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

let notesRows: Array<Record<string, unknown>> = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = () => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.neq = self;
    q.not = self;
    q.is = self;
    q.ilike = self;
    q.order = self;
    q.limit = self;
    q.range = async () => ({ data: notesRows, error: null, count: notesRows.length });
    q.maybeSingle = async () => ({ data: null, error: null });
    q.single = q.maybeSingle;
    q.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: [], error: null, count: 0 });
    return q;
  };
  return { supabase: { from: () => chain() } };
});

vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

const { NotesTab } = await import("@/components/admin/member-detail/NotesTab");

function wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const courtesyNote = (over: Record<string, unknown> = {}) => ({
  id: "n-1",
  member_id: "m-1",
  note_type: "courtesy_call",
  content: "[no_answer] Rang twice, no reply.",
  source: "courtesy_call_attempt",
  source_id: null,
  staff_id: "staff-1",
  is_pinned: false,
  is_private: false,
  followup_date: null,
  followup_completed: null,
  created_at: "2026-09-19T09:00:00.000Z",
  updated_at: null,
  crm_contact_id: null,
  staff: { first_name: "Cora", last_name: "Operator" },
  ...over,
});

beforeEach(() => {
  notesRows = [];
});
afterEach(cleanup);

describe("a courtesy call in the member's history", () => {
  it("reads as a courtesy call, not as a general note", async () => {
    notesRows = [courtesyNote()];
    render(<NotesTab memberId="m-1" />, { wrapper });
    expect(await screen.findByText("Courtesy call")).toBeInTheDocument();
  });

  it("shows how the call ended as a badge", async () => {
    notesRows = [courtesyNote()];
    render(<NotesTab memberId="m-1" />, { wrapper });
    const badge = await screen.findByTestId("courtesy-outcome-badge");
    expect(badge).toHaveTextContent("no answer");
  });

  it("strips the machine marker out of what a person reads", async () => {
    notesRows = [courtesyNote()];
    render(<NotesTab memberId="m-1" />, { wrapper });
    expect(await screen.findByText("Rang twice, no reply.")).toBeInTheDocument();
    expect(screen.queryByText(/\[no_answer\]/)).toBeNull();
  });

  it("leaves an ordinary note's content alone", async () => {
    notesRows = [
      courtesyNote({
        id: "n-2",
        note_type: "general",
        content: "[not an outcome] just how she writes.",
      }),
    ];
    render(<NotesTab memberId="m-1" />, { wrapper });
    expect(await screen.findByText(/just how she writes/)).toBeInTheDocument();
    expect(screen.queryByTestId("courtesy-outcome-badge")).toBeNull();
  });

  it("still shows the karma-imported calls, which are note_type 'call'", async () => {
    notesRows = [
      courtesyNote({ id: "n-3", note_type: "call", content: "Called about the pendant." }),
    ];
    render(<NotesTab memberId="m-1" />, { wrapper });
    expect(await screen.findByText("Call")).toBeInTheDocument();
  });
});

describe("nobody can hand-write a courtesy call", () => {
  /**
   * The schema is what actually rejects the write, so the form is driven by it. Before this the
   * form and the render config were the same object used twice, kept in step by nobody — so
   * adding `courtesy_call` for rendering would have silently offered it as something to type.
   */
  it("the creatable types are the schema's, and exclude courtesy_call", async () => {
    const mod = await import("@/components/admin/member-detail/NotesTab");
    // Read the source rather than the runtime value: the list is module-private on purpose.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/admin/member-detail/NotesTab.tsx", "utf8");

    expect(mod.NotesTab).toBeTypeOf("function");
    // The form select must map the creatable list, never the render config.
    expect(src).toMatch(/CREATABLE_NOTE_TYPES\.map/);
    expect(src).toMatch(/const CREATABLE_NOTE_TYPES = noteSchema\.shape\.note_type\.options/);

    const enumLine = src.match(/note_type: z\.enum\(\[(.*?)\]\)/s)?.[1] ?? "";
    expect(enumLine, "the schema must not accept a hand-typed courtesy call").not.toContain(
      "courtesy_call",
    );
  });

  it("but courtesy_call is still renderable, or the notes fall back to General", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/admin/member-detail/NotesTab.tsx", "utf8");
    expect(src).toMatch(/courtesy_call: \{/);
  });
});
