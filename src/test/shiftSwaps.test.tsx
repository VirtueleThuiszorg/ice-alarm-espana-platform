// Swaps and cover, from the screen to the write — the three answers and who is allowed to give them.
//
// WHAT THIS FILE IS FOR, given that scripts/rls/isolation.sql already exercises the database
// side. The harness proves what happens once a row changes: the shifts move in one transaction,
// an operator cannot apply a swap, the bell rows land on the right people. It cannot see a screen.
// What it therefore cannot catch is the failure that costs the most here — a button wired to the
// wrong write, or offered to somebody whose write the database will refuse. So every assertion
// below is on the RECORDED WRITE, not on a toast: a toast fires on an optimistic update that
// never left the browser, and this flow's whole point is that something reaches the other person.
//
// THE ONE CLAIM THAT IS DELIBERATELY NOT MADE HERE: that RLS agrees. The fake below applies
// filters but has no policies, so it answers as the database would for somebody allowed to write.
// "An operator cannot approve" is asserted where it can be — against real policies, in the RLS
// harness — and what this file asserts instead is that the APPROVE BUTTON IS NOT THERE for them,
// which is the other half of the same guarantee and a different failure.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MARY = "staff-mary";
const ALBERT = "staff-albert";
const CARMEN = "staff-carmen";

let rows: Record<string, unknown[]> = {};
/** Every write attempted, in order. The assertions are all on this. */
const writes: Array<{ table: string; op: string; values: unknown }> = [];
const rpcCalls: Array<{ name: string; args: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const self: Record<string, unknown> = {};
    const pass = () => self;
    self.select = pass;
    self.order = pass;
    self.eq = (column: string, value: unknown) => {
      if (!column.includes(".")) filters.push((row) => row[column] === value);
      return self;
    };
    self.in = (column: string, values: unknown[]) => {
      if (!column.includes(".")) filters.push((row) => values.includes(row[column]));
      return self;
    };
    self.gte = (column: string, value: unknown) => {
      filters.push((row) => String(row[column]) >= String(value));
      return self;
    };
    self.lte = (column: string, value: unknown) => {
      filters.push((row) => String(row[column]) <= String(value));
      return self;
    };
    /** `or("requested_by.eq.x,counterparty_id.eq.y")`, applied — useMySwaps depends on it. */
    self.or = (expr: string) => {
      const clauses = expr.split(",").map((c) => c.split("."));
      filters.push((row) =>
        clauses.some(([column, op, value]) => op === "eq" && row[column] === value),
      );
      return self;
    };
    const result = () =>
      (rows[table] ?? []).filter((row) => filters.every((f) => f(row as Record<string, unknown>)));
    self.update = (values: unknown) => {
      writes.push({ table, op: "update", values });
      return self;
    };
    self.insert = (values: unknown) => {
      writes.push({ table, op: "insert", values });
      return self;
    };
    self.single = async () => ({ data: result()[0] ?? null, error: null });
    self.maybeSingle = async () => ({ data: result()[0] ?? null, error: null });
    self.then = (resolve: (v: unknown) => unknown) => resolve({ data: result(), error: null });
    return self;
  };
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: async (name: string, args: unknown) => {
        rpcCalls.push({ name, args });
        return { data: [{ moved_shifts: 2, covers_written: 2, outcome: "2 moved" }], error: null };
      },
      functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
      auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    },
  };
});

let currentStaff = { id: MARY, first_name: "Mary", last_name: "Bonner", role: "call_centre" };
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: currentStaff }),
}));

let staffRole = "call_centre";
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ staffRole, user: { id: "u-1" } }),
}));

vi.mock("react-i18next", () => {
  const en = JSON.parse(readFileSync(join(process.cwd(), "src/i18n/locales/en.json"), "utf8"));
  const lookup = (key: string) =>
    key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en);
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: () => ({
      t: (key: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
        const vars = (typeof fallback === "object" ? fallback : opts) ?? {};
        const template = (lookup(key) as string) ?? (typeof fallback === "string" ? fallback : key);
        return template.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(vars[name] ?? ""));
      },
      i18n: { language: "en" },
    }),
  };
});

import MyShiftsPage from "@/pages/call-centre/MyShiftsPage";
import { SwapRequestList } from "@/components/call-centre/SwapRequestList";
import { swapAwaits, type ShiftSwap } from "@/hooks/useShiftSwaps";

const shift = (id: string, staff_id: string, date: string, type: string) => ({
  id,
  staff_id,
  shift_date: date,
  shift_type: type,
  start_time: type === "morning" ? "07:00:00" : type === "afternoon" ? "15:00:00" : "23:00:00",
  end_time: type === "morning" ? "15:00:00" : type === "afternoon" ? "23:00:00" : "07:00:00",
  is_confirmed: false,
  notes: null,
  created_by: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
});

const swap = (over: Partial<ShiftSwap> = {}): ShiftSwap =>
  ({
    id: "swap-1",
    requested_shift_id: "shift-albert-fri",
    offered_shift_id: null,
    requested_by: ALBERT,
    counterparty_id: MARY,
    status: "requested",
    wants_exchange: false,
    reason: "dentist",
    accepted_at: null,
    approved_by: null,
    approved_at: null,
    applied_at: null,
    created_at: "2026-09-09T10:00:00Z",
    updated_at: "2026-09-09T10:00:00Z",
    requested_shift: {
      id: "shift-albert-fri",
      shift_date: "2026-09-18",
      shift_type: "afternoon",
      start_time: "15:00:00",
      end_time: "23:00:00",
      staff_id: ALBERT,
    },
    offered_shift: null,
    requester: { first_name: "Albert", last_name: "Soares" },
    counterparty: { first_name: "Mary", last_name: "Bonner" },
    ...over,
  }) as ShiftSwap;

function renderWith(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Radix tabs activate on mousedown + focus in jsdom, not click — and the switch is wrapped in
 * `act` because Radix's Presence animates the panel in, which is a state update React otherwise
 * warns about on every one of these tests.
 */
const openTab = async (testId: string) => {
  const tab = await screen.findByTestId(testId);
  await act(async () => {
    fireEvent.mouseDown(tab);
    fireEvent.focus(tab);
  });
};

const openSelect = (label: string) => {
  const trigger = screen.getByRole("combobox", { name: label });
  fireEvent.pointerDown(trigger, new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
};

const lastWrite = (table: string, op: string) =>
  [...writes].reverse().find((w) => w.table === table && w.op === op)?.values as
    | Record<string, unknown>
    | undefined;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-10T07:00:00Z"));
  writes.length = 0;
  rpcCalls.length = 0;
  currentStaff = { id: MARY, first_name: "Mary", last_name: "Bonner", role: "call_centre" };
  staffRole = "call_centre";
  rows = {
    staff: [
      { id: MARY, first_name: "Mary", last_name: "Bonner", role: "call_centre_supervisor", status: "active" },
      { id: ALBERT, first_name: "Albert", last_name: "Soares", role: "call_centre", status: "active" },
      { id: CARMEN, first_name: "Carmen", last_name: "Nicolas", role: "call_centre", status: "active" },
    ],
    staff_shifts: [
      shift("shift-mary-thu", MARY, "2026-09-17", "morning"),
      shift("shift-mary-sat", MARY, "2026-09-19", "night"),
    ],
    staff_shift_swaps: [],
    staff_shift_covers: [],
    shift_notes: [],
    staff_holidays: [],
    staff_holiday_balance: [],
    bank_holidays: [],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("whose turn it is", () => {
  it("is the counterparty's while it is only requested", () => {
    expect(swapAwaits(swap(), MARY)).toBe("you");
    expect(swapAwaits(swap(), ALBERT)).toBe("them");
  });

  it("is the supervisor's once accepted, for both people", () => {
    const accepted = swap({ status: "accepted" });
    expect(swapAwaits(accepted, MARY)).toBe("supervisor");
    expect(swapAwaits(accepted, ALBERT)).toBe("supervisor");
  });

  it("is nobody's once it is applied, declined or withdrawn", () => {
    for (const status of ["applied", "declined", "cancelled"] as const) {
      expect(swapAwaits(swap({ status }), MARY)).toBe("done");
    }
  });
});

describe("the person who was asked", () => {
  it("sees the request on My shifts, with a count on the tab", async () => {
    rows.staff_shift_swaps = [swap()];
    renderWith(<MyShiftsPage />);
    // The count is visible WITHOUT opening the tab — a badge you only see after clicking is not
    // a badge, and this is the only thing that tells somebody a colleague is waiting on them.
    expect(await screen.findByTestId("requests-awaiting-badge")).toHaveTextContent("1");

    await openTab("tab-requests");
    const row = await screen.findByTestId("swap-request-row");
    expect(row).toHaveTextContent("Albert Soares asked you for cover");
    expect(row).toHaveTextContent("Fri 18 Sep");
    expect(row).toHaveTextContent("dentist");
  });

  it("accepting writes accepted and stamps when they said yes", async () => {
    rows.staff_shift_swaps = [swap()];
    renderWith(<MyShiftsPage />);
    await openTab("tab-requests");
    fireEvent.click(await screen.findByTestId("accept-swap"));

    await waitFor(() => expect(lastWrite("staff_shift_swaps", "update")).toBeDefined());
    const write = lastWrite("staff_shift_swaps", "update")!;
    expect(write.status).toBe("accepted");
    // `apply_shift_swap` copies this onto the cover row's responded_at, so it has to be the
    // moment they answered rather than the moment a supervisor got round to it.
    // Within the test's own clock, not equal to it: the fake timer advances while React works,
    // and pinning the millisecond would fail for a reason that says nothing about the feature.
    expect(Date.parse(write.accepted_at as string)).toBeGreaterThanOrEqual(
      Date.parse("2026-09-10T07:00:00.000Z"),
    );
    expect(Date.parse(write.accepted_at as string)).toBeLessThan(
      Date.parse("2026-09-10T07:01:00.000Z"),
    );
    // Nothing else moved: accepting is not approving.
    expect(rpcCalls).toHaveLength(0);
    expect(writes.filter((w) => w.table === "staff_shifts")).toHaveLength(0);
  });

  it("declining writes declined and clears the acceptance stamp", async () => {
    rows.staff_shift_swaps = [swap()];
    renderWith(<MyShiftsPage />);
    await openTab("tab-requests");
    fireEvent.click(await screen.findByTestId("decline-swap"));

    await waitFor(() => expect(lastWrite("staff_shift_swaps", "update")).toBeDefined());
    expect(lastWrite("staff_shift_swaps", "update")).toMatchObject({
      status: "declined",
      accepted_at: null,
    });
  });

  it("is offered a shift of their OWN to give back, but only where a swap was asked for", async () => {
    rows.staff_shift_swaps = [swap({ wants_exchange: true })];
    renderWith(<MyShiftsPage />);
    await openTab("tab-requests");

    openSelect("One of yours in exchange (optional)");
    // Mary's own two shifts, and nothing of Albert's — she cannot see his rota, so the only
    // thing she can offer is hers.
    expect(await screen.findByRole("option", { name: /Thu 17 Sep/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Sat 19 Sep/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Fri 18 Sep/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /Thu 17 Sep/ }));
    fireEvent.click(screen.getByTestId("accept-swap"));

    await waitFor(() => expect(lastWrite("staff_shift_swaps", "update")).toBeDefined());
    expect(lastWrite("staff_shift_swaps", "update")).toMatchObject({
      status: "accepted",
      offered_shift_id: "shift-mary-thu",
    });
  });

  it("has no exchange picker on a plain cover request", async () => {
    rows.staff_shift_swaps = [swap({ wants_exchange: false })];
    renderWith(<MyShiftsPage />);
    await openTab("tab-requests");
    await screen.findByTestId("accept-swap");
    expect(
      screen.queryByRole("combobox", { name: "One of yours in exchange (optional)" }),
    ).not.toBeInTheDocument();
  });

  it("accepting a swap with no shift nominated does NOT send a null offered_shift_id", async () => {
    // It must be ABSENT, not null: a null would overwrite a shift the requester's own screen
    // never set, and "I'll just take it" is a valid answer to a swap request.
    rows.staff_shift_swaps = [swap({ wants_exchange: true })];
    renderWith(<MyShiftsPage />);
    await openTab("tab-requests");
    fireEvent.click(await screen.findByTestId("accept-swap"));

    await waitFor(() => expect(lastWrite("staff_shift_swaps", "update")).toBeDefined());
    expect(lastWrite("staff_shift_swaps", "update")).not.toHaveProperty("offered_shift_id");
  });
});

describe("the person who asked", () => {
  it("sees who it is waiting on, and can withdraw it", async () => {
    rows.staff_shift_swaps = [
      swap({
        requested_by: MARY,
        counterparty_id: ALBERT,
        requester: { first_name: "Mary", last_name: "Bonner" },
        counterparty: { first_name: "Albert", last_name: "Soares" },
      }),
    ];
    renderWith(<MyShiftsPage />);
    await openTab("tab-requests");

    const row = await screen.findByTestId("swap-request-row");
    expect(row).toHaveTextContent("You asked Albert Soares for cover");
    expect(row).toHaveTextContent("Waiting for Albert Soares to answer");
    // No accept button on your own request — you cannot answer yourself, and the database
    // would refuse it.
    expect(screen.queryByTestId("accept-swap")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("withdraw-swap"));
    await waitFor(() => expect(lastWrite("staff_shift_swaps", "update")).toBeDefined());
    expect(lastWrite("staff_shift_swaps", "update")).toMatchObject({ status: "cancelled" });
  });

  it("is told it is with a supervisor once accepted, and gets no approve button", async () => {
    rows.staff_shift_swaps = [
      swap({
        status: "accepted",
        requested_by: MARY,
        counterparty_id: ALBERT,
        counterparty: { first_name: "Albert", last_name: "Soares" },
      }),
    ];
    renderWith(<MyShiftsPage />);
    await openTab("tab-requests");
    expect(await screen.findByTestId("swap-request-row")).toHaveTextContent(
      "waiting for a supervisor to approve",
    );
    // THE ONE THAT MATTERS: approval is the supervisor's step. RLS refuses it, and the screen
    // does not offer it.
    expect(screen.queryByTestId("approve-swap")).not.toBeInTheDocument();
  });
});

describe("asking, from the shift itself", () => {
  it("writes the request with wants_exchange set, and never names a shift back", async () => {
    renderWith(<MyShiftsPage />);
    // Mary's own Thursday, on the Upcoming tab.
    const asks = await screen.findAllByTestId("ask-swap-or-cover");
    fireEvent.click(asks[0]);

    // "Swap", not plain cover.
    fireEvent.click(await screen.findByLabelText(/Swap/, { selector: "#swap-mode-swap" }));
    openSelect("Who?");
    fireEvent.click(await screen.findByRole("option", { name: "Albert Soares" }));
    fireEvent.click(screen.getByTestId("submit-swap-request"));

    await waitFor(() => expect(lastWrite("staff_shift_swaps", "insert")).toBeDefined());
    const write = lastWrite("staff_shift_swaps", "insert")!;
    expect(write).toMatchObject({
      requested_shift_id: "shift-mary-thu",
      requested_by: MARY,
      counterparty_id: ALBERT,
      wants_exchange: true,
      // ALWAYS null from this side: Mary cannot see Albert's shifts, so she cannot name one.
      offered_shift_id: null,
    });
  });

  it("offers every colleague and never yourself", async () => {
    renderWith(<MyShiftsPage />);
    fireEvent.click((await screen.findAllByTestId("ask-swap-or-cover"))[0]);
    openSelect("Who?");
    expect(await screen.findByRole("option", { name: "Albert Soares" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Carmen Nicolas" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Mary Bonner" })).not.toBeInTheDocument();
  });

  it("defaults to cover, so the safer of the two questions is the one you send by accident", async () => {
    renderWith(<MyShiftsPage />);
    fireEvent.click((await screen.findAllByTestId("ask-swap-or-cover"))[0]);
    openSelect("Who?");
    fireEvent.click(await screen.findByRole("option", { name: "Albert Soares" }));
    fireEvent.click(screen.getByTestId("submit-swap-request"));
    await waitFor(() => expect(lastWrite("staff_shift_swaps", "insert")).toBeDefined());
    expect(lastWrite("staff_shift_swaps", "insert")).toMatchObject({ wants_exchange: false });
  });
});

describe("the supervisor who approves", () => {
  it("approves through apply_shift_swap, and writes staff_shifts from nowhere else", async () => {
    const accepted = swap({ status: "accepted", id: "swap-9" });
    renderWith(
      <SwapRequestList swaps={[accepted]} staffId="staff-super" mode="approvals" />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Approve the swap between Albert Soares and Mary Bonner/i }),
    );

    await waitFor(() => expect(rpcCalls).toHaveLength(1));
    expect(rpcCalls[0]).toEqual({ name: "apply_shift_swap", args: { p_swap_id: "swap-9" } });
    // THE POINT OF THE FUNCTION: no client-side shift move, ever. Two updates from here would
    // leave one shift moved and one not.
    expect(writes.filter((w) => w.table === "staff_shifts")).toHaveLength(0);
    expect(writes.filter((w) => w.table === "staff_shift_covers")).toHaveLength(0);
  });

  it("says out loud when approving a swap will only move one shift", async () => {
    // A swap was asked for and the counterparty accepted without nominating anything back. It
    // is valid and it becomes cover — but a supervisor pressing Approve should know that before
    // one operator finds out they gave a shift away for nothing.
    renderWith(
      <SwapRequestList
        swaps={[swap({ status: "accepted", wants_exchange: true, offered_shift_id: null })]}
        staffId="staff-super"
        mode="approvals"
      />,
    );
    expect(
      screen.getByText(/no shift was offered back — approving this moves one shift, as cover/i),
    ).toBeInTheDocument();
  });

  it("shows the exchange when there is one", async () => {
    renderWith(
      <SwapRequestList
        swaps={[
          swap({
            status: "accepted",
            wants_exchange: true,
            offered_shift_id: "shift-mary-thu",
            offered_shift: {
              id: "shift-mary-thu",
              shift_date: "2026-09-17",
              shift_type: "morning",
              start_time: "07:00:00",
              end_time: "15:00:00",
              staff_id: MARY,
            },
          }),
        ]}
        staffId="staff-super"
        mode="approvals"
      />,
    );
    const offered = screen.getByTestId("swap-offered-shift");
    expect(within(offered).getByText("Thu 17 Sep")).toBeInTheDocument();
    expect(screen.getByText(/Both people have agreed/)).toBeInTheDocument();
  });

  it("has an empty state that says nothing is waiting, not that nothing exists", () => {
    renderWith(<SwapRequestList swaps={[]} staffId="staff-super" mode="approvals" />);
    expect(screen.getByTestId("no-swap-requests")).toHaveTextContent(
      "Nothing waiting for approval",
    );
  });
});
