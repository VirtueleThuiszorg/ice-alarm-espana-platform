/**
 * THE LAST TWO CONTROLS ON THE RECORD THAT WROTE ON TOUCH.
 *
 * The courtesy-calls switch and the frequency select each ran their own UPDATE the instant they
 * moved — no Edit, no Save, no undo. Brushing the switch on a shared screen silently stopped a
 * member's scheduled check-in calls, and nothing said so beyond a toast that was gone in three
 * seconds. They are a draft the operator commits now, like every other field on this record.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

let updates: Array<Record<string, unknown>> = [];
let updateError: { message: string } | null = null;
let memberRow: Record<string, unknown> = {};

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.order = self;
    q.limit = self;
    // `.single()`, because that is what the card calls — with only `maybeSingle` faked the
    // fetch threw, the card fell back to its defaults, and two mutants became invisible.
    const answer = async () => ({ data: table === "members" ? memberRow : null, error: null });
    q.maybeSingle = answer;
    q.single = answer;
    q.update = (payload: Record<string, unknown>) => {
      updates.push(payload);
      return { eq: async () => ({ error: updateError }) };
    };
    q.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
    return q;
  };
  return { supabase: { from: (t: string) => chain(t) } };
});

const logged: Array<Record<string, unknown>> = [];
vi.mock("@/lib/auditLog", () => ({
  logMemberActivity: async (
    action: string,
    memberId: string,
    oldValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>,
  ) => {
    logged.push({ action, memberId, oldValues, newValues });
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, def?: unknown) => (typeof def === "string" ? def : key) }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

import { CourtesyCallsCard } from "@/components/admin/member-detail/CourtesyCallsCard";

beforeEach(() => {
  updates = [];
  updateError = null;
  logged.length = 0;
  toastError.mockClear();
  toastSuccess.mockClear();
  memberRow = {
    courtesy_calls_enabled: true,
    courtesy_call_frequency: "monthly",
    next_courtesy_call_date: "2026-10-10",
    created_at: "2026-01-01",
  };
});
afterEach(cleanup);

const card = () => screen.getByTestId("courtesy-card-fields") as HTMLFieldSetElement;

async function open() {
  render(<CourtesyCallsCard memberId="m1" />);
  await waitFor(() => expect(screen.getByTestId("courtesy-card-fields")).toBeTruthy());
}

describe("courtesy calls", () => {
  it("the switch is inert until Edit is pressed", async () => {
    await open();
    expect(card().disabled).toBe(true);
    expect(screen.getByLabelText("Enable Courtesy Calls").matches(":disabled")).toBe(true);
  });

  it("moving the switch writes NOTHING until Save", async () => {
    await open();
    fireEvent.click(screen.getByTestId("courtesy-card-edit"));
    fireEvent.click(screen.getByLabelText("Enable Courtesy Calls"));
    // This is the whole point: the old version had already run an UPDATE by now.
    expect(updates).toHaveLength(0);

    fireEvent.click(screen.getByTestId("courtesy-card-save"));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toMatchObject({ courtesy_calls_enabled: false });
    // Turned off means no next call date left behind to generate a task from.
    expect(updates[0].next_courtesy_call_date).toBeNull();
    expect(logged[0]).toMatchObject({
      action: "update",
      oldValues: { courtesy_calls_enabled: true, courtesy_call_frequency: "monthly" },
      newValues: { courtesy_calls_enabled: false, courtesy_call_frequency: "monthly" },
    });
  });

  it("a changed frequency moves the next call date, in the SAME write", async () => {
    await open();
    fireEvent.click(screen.getByTestId("courtesy-card-edit"));
    fireEvent.click(screen.getByLabelText("Call Frequency"));
    await waitFor(() => expect(screen.getByText("Weekly")).toBeTruthy());
    fireEvent.click(screen.getByText("Weekly"));
    fireEvent.click(screen.getByTestId("courtesy-card-save"));

    await waitFor(() => expect(updates).toHaveLength(1));
    // One write, not two: two meant a member could be left enabled at the old frequency when
    // the second failed, with a next-call date belonging to neither.
    expect(updates[0]).toMatchObject({
      courtesy_calls_enabled: true,
      courtesy_call_frequency: "weekly",
    });
    expect(updates[0].next_courtesy_call_date).not.toBe("2026-10-10");
  });

  it("Cancel puts the switch back and asks first", async () => {
    await open();
    fireEvent.click(screen.getByTestId("courtesy-card-edit"));
    fireEvent.click(screen.getByLabelText("Enable Courtesy Calls"));
    fireEvent.click(screen.getByTestId("courtesy-card-cancel"));
    await waitFor(() => expect(screen.getByTestId("courtesy-card-discard")).toBeTruthy());
    fireEvent.click(screen.getByTestId("courtesy-card-discard"));

    await waitFor(() => expect(card().disabled).toBe(true));
    expect(updates).toHaveLength(0);
    expect(
      (screen.getByLabelText("Enable Courtesy Calls") as HTMLButtonElement).getAttribute(
        "data-state",
      ),
    ).toBe("checked");
  });

  it("a refused write keeps the card open and shows what the database said", async () => {
    updateError = { message: "courtesy calls need an active membership" };
    await open();
    fireEvent.click(screen.getByTestId("courtesy-card-edit"));
    fireEvent.click(screen.getByLabelText("Enable Courtesy Calls"));
    fireEvent.click(screen.getByTestId("courtesy-card-save"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toContain("active membership");
    expect(card().disabled).toBe(false);
  });
});
