// What an operator sees on /call-centre/my-shifts — rendered, from fake Supabase rows.
//
// The queries are NOT mocked away. `useMyShiftRange`, `useMyShiftEvidence`, `useMyHolidays`,
// `useMyHolidayBalance` and `useBankHolidays` all run, against a fake PostgREST that records
// every filter — so the assertions cover both halves of each tab: that the right rows were ASKED
// for (own staff_id, the right window) and that the answer is rendered correctly. Stubbing the
// hooks would leave the `.eq("staff_id", …)` that keeps one operator out of another's rota
// untested, which is the part worth testing.
//
// Time is pinned to Thursday 10 September 2026 — the first day the rota holds — because every
// window on this page is relative to today.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";

const STAFF_ID = "staff-mary";
const OTHER_STAFF = "staff-carmen";

interface Filter {
  op: string;
  column: string;
  value: unknown;
}

/** Every query the page issued: table, and the filters it carried. */
const queries: Array<{ table: string; filters: Filter[] }> = [];

/** Rows the fake backend serves per table. */
let rows: Record<string, unknown[]> = {};

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const filters: Filter[] = [];
    const record = { table, filters };
    queries.push(record);
    const self: Record<string, unknown> = {};
    const chain = (op: string) => (column: string, value: unknown) => {
      filters.push({ op, column, value });
      return self;
    };
    self.select = () => self;
    self.eq = chain("eq");
    self.gte = chain("gte");
    self.lte = chain("lte");
    self.in = chain("in");
    self.order = () => self;
    self.maybeSingle = async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null });
    self.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows[table] ?? [], error: null });
    return self;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { id: STAFF_ID, first_name: "Mary", last_name: "Bonner", role: "call_centre" } }),
}));

// `t` resolves against the real en.json, so a key that does not exist there fails an assertion
// here rather than shipping a raw `myShifts.tabPast` into the tab strip.
vi.mock("react-i18next", () => {
  const en = JSON.parse(readFileSync(join(process.cwd(), "src/i18n/locales/en.json"), "utf8"));
  const lookup = (key: string) =>
    key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en);
  return {
    // `useShiftCovers` imports `@/i18n`, which registers this plugin at module load.
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

const shift = (
  id: string,
  shift_date: string,
  shift_type: "morning" | "afternoon" | "night",
  extra: Record<string, unknown> = {},
) => ({
  id,
  staff_id: STAFF_ID,
  shift_date,
  shift_type,
  start_time: { morning: "07:00:00", afternoon: "15:00:00", night: "23:00:00" }[shift_type],
  end_time: { morning: "15:00:00", afternoon: "23:00:00", night: "07:00:00" }[shift_type],
  is_confirmed: false,
  notes: null,
  created_by: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/call-centre/my-shifts"]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<MyShiftsPage />, { wrapper });
}

/**
 * Radix opens on `pointerdown`, not on `click` — and jsdom has no Pointer Events API, so the
 * shims in src/test/setup.ts are what make this work at all. Same idiom as
 * ordersFulfilmentActions.test.tsx.
 */
const openTab = (name: string) => {
  const tab = screen.getByRole("tab", { name });
  // Radix's Tabs trigger activates on `mousedown` (primary button) or on focus, NOT on click.
  fireEvent.pointerDown(tab, new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
  fireEvent.mouseDown(tab, { button: 0, bubbles: true });
  fireEvent.focus(tab);
  return tab;
};

const tableQueries = (table: string) => queries.filter((q) => q.table === table);
const filterFor = (table: string, op: string, column: string) =>
  tableQueries(table)
    .flatMap((q) => q.filters)
    .find((f) => f.op === op && f.column === column);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Thursday 10 September 2026, 09:00 Madrid.
  vi.setSystemTime(new Date("2026-09-10T07:00:00Z"));
  queries.length = 0;
  rows = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe("upcoming shifts", () => {
  beforeEach(() => {
    rows = {
      staff_shifts: [
        shift("sh-1", "2026-09-10", "morning"),
        shift("sh-2", "2026-09-11", "afternoon"),
        // Two on one date: a long day, and the warning the rota already classifies.
        shift("sh-3", "2026-09-18", "afternoon"),
        shift("sh-4", "2026-09-18", "night"),
      ],
      staff_shift_covers: [
        {
          id: "cov-1",
          shift_id: "sh-2",
          holiday_id: "hol-1",
          original_staff_id: OTHER_STAFF,
          cover_staff_id: STAFF_ID,
          status: "accepted",
          original_staff: { first_name: "Carmen", last_name: "Nicolás" },
        },
      ],
    };
  });

  it("shows Thursday 10 September — the first day of the rota", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("my-shift-row").length).toBeGreaterThan(0));
    const row = screen.getAllByTestId("my-shift-row").find((r) => r.dataset.shiftDate === "2026-09-10");
    expect(row, "10 September is missing from Upcoming").toBeTruthy();
    expect(row!).toHaveTextContent("Thu 10 Sep");
    expect(row!).toHaveTextContent("Morning");
    expect(row!).toHaveTextContent("07:00");
    expect(row!).toHaveTextContent("8h");
  });

  it("asks only for ITS OWN shifts, over the next eight weeks", async () => {
    renderPage();
    await waitFor(() => expect(tableQueries("staff_shifts").length).toBeGreaterThan(0));
    // The filter that keeps one operator out of another's rota, belt to RLS's braces.
    expect(filterFor("staff_shifts", "eq", "staff_id")).toEqual({
      op: "eq",
      column: "staff_id",
      value: STAFF_ID,
    });
    expect(filterFor("staff_shifts", "gte", "shift_date")?.value).toBe("2026-09-10");
    // 10 Sep + 56 days.
    expect(filterFor("staff_shifts", "lte", "shift_date")?.value).toBe("2026-11-05");
  });

  it("groups by week and totals the week's hours", async () => {
    renderPage();
    // The week of Mon 7 Sep holds the 10th and the 11th: sixteen hours.
    const heading = await screen.findByText("Week of 7 Sep");
    const section = heading.closest("section")!;
    expect(section).toHaveTextContent("16h");
    expect(within(section).getAllByTestId("my-shift-row")).toHaveLength(2);
  });

  it("says whose shift a cover is, and why", async () => {
    renderPage();
    const row = await waitFor(() => {
      const found = screen
        .getAllByTestId("my-shift-row")
        .find((r) => r.dataset.shiftDate === "2026-09-11");
      expect(found).toBeTruthy();
      return found!;
    });
    // Not "an extra shift on a day the cycle says you are off", which is how it reads unlabelled.
    expect(row).toHaveTextContent("covering Carmen Nicolás — holiday");
  });

  it("warns on a doubled day, with the hours it actually is", async () => {
    renderPage();
    const warnings = await waitFor(() => {
      const found = screen.getAllByTestId("long-day-warning");
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    // 15:00 → 07:00 is sixteen hours, and the badge says sixteen rather than eight.
    expect(warnings[0]).toHaveTextContent("16h");
    // Only the doubled date is warned about.
    for (const w of warnings) {
      expect(w.closest("[data-shift-date]")?.getAttribute("data-shift-date")).toBe("2026-09-18");
    }
  });

  it("does not fetch the other three tabs' data on arrival", async () => {
    renderPage();
    await waitFor(() => expect(tableQueries("staff_shifts").length).toBeGreaterThan(0));
    expect(tableQueries("bank_holidays")).toHaveLength(0);
    expect(tableQueries("staff_holidays")).toHaveLength(0);
    expect(tableQueries("shift_notes")).toHaveLength(0);
  });
});

describe("past shifts, and what the platform can honestly say about them", () => {
  beforeEach(() => {
    rows = {
      staff_shifts: [
        shift("sh-past-1", "2026-09-01", "morning", { is_confirmed: true }),
        shift("sh-past-2", "2026-09-02", "night", { is_confirmed: false }),
      ],
      shift_notes: [
        // 00:30 Madrid on the 3rd == 22:30Z on the 2nd: the night shift that began on the 2nd.
        { id: "n-1", created_at: "2026-09-02T23:30:00Z" },
        { id: "n-2", created_at: "2026-09-03T00:15:00Z" },
      ],
    };
  });

  const openPast = () => {
    renderPage();
    openTab("Past");
  };

  it("totals the month's SCHEDULED hours, and counts the confirmations separately", async () => {
    openPast();
    await waitFor(() => expect(screen.getAllByTestId("my-shift-row")).toHaveLength(2));
    expect(screen.getByText("Scheduled hours").previousElementSibling).toHaveTextContent("16h");
    expect(screen.getByText("Confirmed of 2").previousElementSibling).toHaveTextContent("1");
  });

  it("marks a confirmed shift confirmed, and an unconfirmed one as not confirmed", async () => {
    openPast();
    await waitFor(() => expect(screen.getAllByTestId("my-shift-row")).toHaveLength(2));
    expect(screen.getByTestId("shift-confirmed").closest("[data-shift-date]")).toHaveAttribute(
      "data-shift-date",
      "2026-09-01",
    );
    expect(screen.getByTestId("shift-unconfirmed").closest("[data-shift-date]")).toHaveAttribute(
      "data-shift-date",
      "2026-09-02",
    );
  });

  it("attributes a note written after midnight to the night shift that began the day before", async () => {
    openPast();
    const evidence = await screen.findByTestId("shift-evidence");
    expect(evidence).toHaveTextContent("2 handover notes");
    // Both notes land on the 2nd — the naive reading would put one of them on the 3rd, a date
    // with no shift at all, and the evidence would silently vanish.
    expect(evidence.closest("[data-shift-date]")).toHaveAttribute("data-shift-date", "2026-09-02");
  });

  it("counts only the operator's OWN notes as evidence", async () => {
    openPast();
    await waitFor(() => expect(tableQueries("shift_notes").length).toBeGreaterThan(0));
    // RLS lets any member of staff READ any handover note ("Staff can view shift notes"), so
    // this filter is the only thing standing between "you wrote two notes that night" and
    // "somebody wrote two notes that night". Without it the Past tab would offer another
    // operator's work as evidence of yours.
    expect(filterFor("shift_notes", "eq", "staff_id")?.value).toBe(STAFF_ID);
    // A day either side of the month, so a night shift's small hours are inside the window.
    expect(filterFor("shift_notes", "gte", "created_at")?.value).toBe("2026-08-31T00:00:00Z");
    expect(filterFor("shift_notes", "lte", "created_at")?.value).toBe("2026-10-01T23:59:59Z");
  });

  it("never claims a shift was WORKED", async () => {
    openPast();
    await waitFor(() => expect(screen.getAllByTestId("my-shift-row")).toHaveLength(2));
    // The platform has no attendance record. Saying "worked" would invent one, and this page is
    // the one an operator would read a payroll figure off.
    expect(document.body.textContent).not.toMatch(/\bworked\b/i);
    expect(screen.getByText(/does not record attendance/i)).toBeInTheDocument();
  });

  it("offers months back to the start of the rota and no further", async () => {
    openPast();
    const month = screen.getByRole("combobox", { name: "Month" });
    fireEvent.pointerDown(month, new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    const options = await screen.findAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels[0]).toBe("September 2026");
    // Nothing before the rota exists, so nothing before it is offered.
    expect(labels).toHaveLength(1);
  });
});

describe("holidays", () => {
  beforeEach(() => {
    rows = {
      staff_holidays: [
        {
          id: "hol-1",
          staff_id: STAFF_ID,
          start_date: "2026-08-03",
          end_date: "2026-08-16",
          total_days: 14,
          status: "approved",
          reason: null,
        },
      ],
      staff_holiday_balance: [
        {
          staff_id: STAFF_ID,
          annual_holiday_days: 30,
          days_approved: 18,
          days_pending: 0,
          days_remaining: 12,
        },
      ],
    };
  });

  it("shows the balance the database computed — 30 / 18 used / 12 left", async () => {
    renderPage();
    openTab("Holidays");
    const balance = await screen.findByTestId("holiday-balance");
    // Read off `staff_holiday_balance`, not recomputed here: one answer to the question, and it
    // is the same one the supervisor's approval screen uses.
    expect(balance).toHaveTextContent("30");
    expect(balance).toHaveTextContent("18");
    expect(balance).toHaveTextContent("12");
  });

  it("lists own holiday rows in calendar days", async () => {
    renderPage();
    openTab("Holidays");
    const row = await screen.findByTestId("my-holiday-row");
    expect(row).toHaveTextContent("3 Aug — 16 Aug 2026");
    // días naturales, ET art. 38 — not working days.
    expect(row).toHaveTextContent("14 calendar days");
    expect(row).toHaveTextContent("Approved");
  });

  it("sends a request to the one form that exists rather than growing a second", async () => {
    renderPage();
    openTab("Holidays");
    const link = await screen.findByRole("link", { name: "Request holiday" });
    expect(link).toHaveAttribute("href", "/call-centre/holidays");
  });
});

describe("bank holidays", () => {
  beforeEach(() => {
    rows = {
      bank_holidays: [
        { holiday_date: "2026-10-12", name: "Fiesta Nacional de España", region: "national" },
        { holiday_date: "2026-12-25", name: "Navidad", region: "national" },
      ],
      staff_shifts: [shift("sh-x", "2026-12-25", "morning")],
    };
  });

  it("lists the year's festivos and marks the ones the operator is working", async () => {
    renderPage();
    openTab("Bank holidays");
    await waitFor(() => expect(screen.getAllByTestId("bank-holiday-row")).toHaveLength(2));

    const marked = screen.getAllByTestId("bank-holiday-on-shift");
    expect(marked).toHaveLength(1);
    expect(marked[0].closest("[data-testid='bank-holiday-row']")).toHaveTextContent("Navidad");

    // The call centre does not close for a festivo, and the page says so rather than implying a
    // day off.
    expect(screen.getByText(/runs on a festivo like any other day/i)).toBeInTheDocument();
  });

  it("asks for the whole year of festivos, once, and only on this tab", async () => {
    renderPage();
    expect(tableQueries("bank_holidays")).toHaveLength(0);
    openTab("Bank holidays");
    await waitFor(() => expect(tableQueries("bank_holidays").length).toBeGreaterThan(0));
    expect(filterFor("bank_holidays", "gte", "holiday_date")?.value).toBe("2026-01-01");
    expect(filterFor("bank_holidays", "lte", "holiday_date")?.value).toBe("2026-12-31");
  });
});
