/**
 * THE CALL WORKSPACE — what it writes, and what it refuses to lose.
 *
 * The three claims worth executing rather than reading:
 *
 *   1. the notes survive, because they are autosaved to `tasks.draft_notes` rather than held in
 *      the browser — a dropped browser mid-call is when losing them costs most;
 *   2. closing goes through `close_courtesy_call` with the checklist and outcome attached, in ONE
 *      call, because four client writes with no transaction is how a member ends up with a
 *      next-call date for a call nobody recorded;
 *   3. a failed close does not cost the operator what they typed.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcError: { message: string } | null = null;
let draftOnTask: string | null = null;
let previousNotes: Array<Record<string, unknown>> = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.neq = self;
    q.order = self;
    q.limit = self;
    q.maybeSingle = async () => ({
      data: table === "tasks" ? { draft_notes: draftOnTask } : null,
      error: null,
    });
    q.single = q.maybeSingle;
    q.update = (values: Record<string, unknown>) => {
      updates.push({ table, values });
      return { eq: async () => ({ error: null }) };
    };
    q.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: table === "member_notes" ? previousNotes : [], error: null });
    return q;
  };
  return {
    supabase: {
      from: (t: string) => chain(t),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return { data: null, error: rpcError };
      },
    },
  };
});

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { first_name: "Cora", last_name: "Operator" } }),
}));

vi.mock("@/hooks/useMemberOverview", () => ({
  useMemberOverview: () => ({
    data: {
      subject: { name: "Rosa Cortes", photoUrl: null, status: "active" },
      sections: [
        { key: "identity", title: "Identity", rows: [{ label: "Phone", value: "+34600300001" }] },
      ],
    },
    isLoading: false,
  }),
}));

const toasts: string[] = [];
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => toasts.push(`success:${m}`),
    error: (m: string) => toasts.push(`error:${m}`),
  },
}));

const { CourtesyCallDialog } = await import("@/components/call-centre/CourtesyCallDialog");

/* The company block on the document comes from `useMemberDocumentChrome`, which is a real
   react-query hook. Wrapped rather than mocked, so the document under test is the real one. */
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderDialog = (over: Record<string, unknown> = {}) =>
  render(
    <CourtesyCallDialog
      taskId="task-1"
      memberId="member-1"
      memberName="Rosa Cortes"
      memberPhone="+34600300001"
      open
      onOpenChange={() => {}}
      {...over}
    />,
    { wrapper },
  );

beforeEach(() => {
  updates.length = 0;
  rpcCalls.length = 0;
  toasts.length = 0;
  rpcError = null;
  draftOnTask = null;
  previousNotes = [];
  vi.useRealTimers();
});

afterEach(cleanup);

describe("the record is beside the call", () => {
  it("renders the member's document and the call panel together", async () => {
    renderDialog();
    expect(await screen.findByTestId("courtesy-call-record")).toBeInTheDocument();
    expect(screen.getByTestId("courtesy-call-panel")).toBeInTheDocument();
  });

  it("shows the number to dial, and a working tel: link for a softphone", async () => {
    renderDialog();
    expect(await screen.findByText("+34600300001")).toBeInTheDocument();
    expect(screen.getByTestId("courtesy-call-dial")).toHaveAttribute("href", "tel:+34600300001");
  });

  it("does not offer a dial link when we hold no number", async () => {
    renderDialog({ memberPhone: null });
    await screen.findByTestId("courtesy-call-panel");
    expect(screen.queryByTestId("courtesy-call-dial")).toBeNull();
  });

  it("shows the previous calls with who made them and how they ended", async () => {
    previousNotes = [
      {
        id: "n-1",
        created_at: "2026-08-19T10:00:00.000Z",
        content: "[spoke_member] All well, pendant worn.",
        staff: { first_name: "Cora", last_name: "Operator" },
      },
    ];
    renderDialog();
    expect(await screen.findByText(/All well, pendant worn/)).toBeInTheDocument();
    expect(screen.getByText(/spoke member/)).toBeInTheDocument();
    // The raw "[spoke_member]" marker is a machine detail, not something to read back.
    expect(screen.queryByText(/\[spoke_member\]/)).toBeNull();
  });
});

describe("the notes survive the browser", () => {
  it("restores a draft the task already carries", async () => {
    draftOnTask = "Rang at 10, she was in the garden.";
    renderDialog();
    await waitFor(() =>
      expect(screen.getByTestId("courtesy-call-notes")).toHaveValue(
        "Rang at 10, she was in the garden.",
      ),
    );
  });

  it("writes the draft to the TASK, not to the browser", async () => {
    renderDialog();
    const notes = await screen.findByTestId("courtesy-call-notes");
    fireEvent.change(notes, { target: { value: "Doing well. Daughter visiting Sunday." } });
    fireEvent.blur(notes);

    await waitFor(() => {
      const draft = updates.find((u) => u.table === "tasks" && "draft_notes" in u.values);
      expect(draft?.values.draft_notes).toBe("Doing well. Daughter visiting Sunday.");
    });
  });

  it("does not rewrite an unchanged draft", async () => {
    renderDialog();
    const notes = await screen.findByTestId("courtesy-call-notes");
    fireEvent.change(notes, { target: { value: "One line." } });
    fireEvent.blur(notes);
    await waitFor(() => expect(updates.length).toBe(1));

    fireEvent.blur(notes);
    await new Promise((r) => setTimeout(r, 10));
    expect(updates.length).toBe(1);
  });
});

describe("closing the call", () => {
  it("is refused until the operator says how it ended", async () => {
    renderDialog();
    expect(await screen.findByTestId("courtesy-close-call")).toBeDisabled();
  });

  it("sends the outcome, the notes and the checklist in ONE rpc", async () => {
    renderDialog();
    fireEvent.change(await screen.findByTestId("courtesy-call-notes"), {
      target: { value: "All well." },
    });
    fireEvent.click(screen.getByLabelText("Is the pendant being worn?"));
    fireEvent.click(screen.getByLabelText("Spoke to member"));
    fireEvent.click(screen.getByTestId("courtesy-close-call"));

    await waitFor(() => expect(rpcCalls).toHaveLength(1));
    expect(rpcCalls[0].fn).toBe("close_courtesy_call");
    expect(rpcCalls[0].args).toMatchObject({
      p_task_id: "task-1",
      p_outcome: "spoke_member",
      p_notes: "All well.",
      p_checklist: { pendant_worn: true },
      p_follow_up_at: null,
    });
  });

  it("warns that an unanswered call stays open", async () => {
    renderDialog();
    fireEvent.click(await screen.findByLabelText("No answer"));
    expect(screen.getByText(/stays open and a retry is raised/)).toBeInTheDocument();
  });

  it("does not warn when somebody was actually spoken to", async () => {
    renderDialog();
    fireEvent.click(await screen.findByLabelText("Spoke to carer"));
    expect(screen.queryByText(/stays open and a retry is raised/)).toBeNull();
  });

  it("passes a follow-up date when one is asked for", async () => {
    renderDialog();
    await screen.findByTestId("courtesy-call-panel");
    fireEvent.click(screen.getByLabelText("Needs follow-up"));
    fireEvent.change(screen.getByTestId("courtesy-followup-date"), {
      target: { value: "2026-10-02" },
    });
    fireEvent.click(screen.getByLabelText("Spoke to member"));
    fireEvent.click(screen.getByTestId("courtesy-close-call"));

    await waitFor(() => expect(rpcCalls).toHaveLength(1));
    expect(rpcCalls[0].args.p_follow_up_at).toBe("2026-10-02");
  });

  /**
   * The operator has just had the conversation. If the close fails, the one thing that must not
   * happen is that the notes go with it.
   */
  it("saves the notes as a draft when the close fails", async () => {
    rpcError = { message: "task is already closed" };
    renderDialog();
    fireEvent.change(await screen.findByTestId("courtesy-call-notes"), {
      target: { value: "She has a new carer, Marta." },
    });
    fireEvent.click(screen.getByLabelText("Spoke to member"));
    fireEvent.click(screen.getByTestId("courtesy-close-call"));

    await waitFor(() => expect(toasts.some((m) => m.startsWith("error:"))).toBe(true));
    const draft = updates.find((u) => u.table === "tasks" && "draft_notes" in u.values);
    expect(draft?.values.draft_notes).toBe("She has a new carer, Marta.");
  });
});
