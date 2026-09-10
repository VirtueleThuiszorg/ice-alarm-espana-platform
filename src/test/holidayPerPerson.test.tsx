// The Holidays page, per person: the four numbers, the dates behind them, and the two warnings.
//
// Rendered against a fake PostgREST rather than asserted on the source, because the claims are
// arithmetic reaching a screen: 30 minus 18 is 12 in the balance view, the entitlement column
// shows a pro-rata figure only for somebody who started mid-year, and a request inside two
// months is flagged before somebody clicks Approve.
//
// The two things this file exists to stop are both silent: an entitlement quietly reduced for
// somebody whose hire date is simply missing, and a short-notice request approved with nothing
// on the screen to say it was short notice.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MARY = "staff-mary";
const CARMEN = "staff-carmen";
const NEWSTARTER = "staff-nuria";

let rows: Record<string, unknown[]> = {};
const csvCalls: Array<{ filename: string; rows: unknown[] }> = [];

/**
 * A fake PostgREST that APPLIES the filters it is given.
 *
 * It has to: the claim "the per-person table does not change shape when the status tab is
 * filtered" is only testable if filtering actually removes rows. `eq`/`in` on a plain column is
 * all this page uses.
 */
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const self: Record<string, unknown> = {};
    const pass = () => self;
    self.select = pass;
    self.order = pass;
    self.eq = (column: string, value: unknown) => {
      // Embedded filters (`staff.role`) are the join's business, not a column on the row.
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
    const result = () =>
      (rows[table] ?? []).filter((row) =>
        filters.every((f) => f(row as Record<string, unknown>)),
      );
    self.maybeSingle = async () => ({ data: result()[0] ?? null, error: null });
    self.then = (resolve: (v: unknown) => unknown) => resolve({ data: result(), error: null });
    return self;
  };
  return {
    supabase: {
      from: (table: string) => builder(table),
      functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
      auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    },
  };
});

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { id: "staff-lee", first_name: "Lee", last_name: "W", role: "super_admin" } }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ staffRole: "super_admin", user: { id: "u-1" } }),
}));

// The CSV is a download; what matters is the ROWS it would write.
vi.mock("@/lib/csvExporter", () => ({
  exportToCsv: (data: unknown[], filename: string) => csvCalls.push({ filename, rows: data }),
  buildCsvString: () => "",
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

import HolidaysPage from "@/pages/admin/HolidaysPage";

const holiday = (
  id: string,
  staff_id: string,
  start_date: string,
  end_date: string,
  status: string,
  staff: { first_name: string; last_name: string },
) => ({
  id,
  staff_id,
  start_date,
  end_date,
  total_days:
    (Date.parse(`${end_date}T00:00:00Z`) - Date.parse(`${start_date}T00:00:00Z`)) / 86_400_000 + 1,
  status,
  reason: null,
  reviewed_by: null,
  reviewed_at: null,
  review_notes: null,
  created_at: "2026-01-01T00:00:00Z",
  staff: { ...staff, role: "call_centre" },
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <HolidaysPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const personRow = (staffId: string) =>
  screen.getAllByTestId("per-person-row").find((r) => r.dataset.staffId === staffId);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-10T07:00:00Z"));
  csvCalls.length = 0;
  rows = {
    // `role` and `status` are on these rows because the fake APPLIES filters, and both queries
    // that read `staff` here filter on them (`role in HOLIDAY_ROLES`, `status = 'active'`).
    staff: [
      // Mary and Carmen: contratos indefinidos predating the year.
      { id: MARY, first_name: "Mary", last_name: "Bonner", hire_date: "2019-03-01", annual_holiday_days: 30, role: "call_centre_supervisor", status: "active" },
      { id: CARMEN, first_name: "Carmen", last_name: "Nicolás", hire_date: "2021-06-15", annual_holiday_days: 30, role: "call_centre", status: "active" },
      // A mid-year starter, and one with no hire date on file at all.
      { id: NEWSTARTER, first_name: "Nuria", last_name: "Vega", hire_date: "2026-07-01", annual_holiday_days: 30, role: "call_centre", status: "active" },
      { id: "staff-nohire", first_name: "Tomás", last_name: "Ruiz", hire_date: null, annual_holiday_days: 30, role: "call_centre", status: "active" },
    ],
    staff_holiday_balance: [
      { staff_id: MARY, first_name: "Mary", last_name: "Bonner", annual_holiday_days: 30, days_approved: 18, days_pending: 0, days_remaining: 12 },
      { staff_id: CARMEN, first_name: "Carmen", last_name: "Nicolás", annual_holiday_days: 30, days_approved: 28, days_pending: 0, days_remaining: 2 },
      { staff_id: NEWSTARTER, first_name: "Nuria", last_name: "Vega", annual_holiday_days: 30, days_approved: 0, days_pending: 4, days_remaining: 26 },
      { staff_id: "staff-nohire", first_name: "Tomás", last_name: "Ruiz", annual_holiday_days: 30, days_approved: 0, days_pending: 0, days_remaining: 30 },
    ],
    staff_holidays: [
      holiday("h-1", MARY, "2026-07-18", "2026-07-21", "approved", { first_name: "Mary", last_name: "Bonner" }),
      holiday("h-2", CARMEN, "2026-05-17", "2026-05-25", "approved", { first_name: "Carmen", last_name: "Nicolás" }),
      // A pending request 12 days out: inside the two months ET art. 38.3 expects.
      holiday("h-3", NEWSTARTER, "2026-09-22", "2026-09-25", "requested", { first_name: "Nuria", last_name: "Vega" }),
    ],
    system_settings: [],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("per person, for the year", () => {
  it("shows entitlement, approved, pending and remaining as the database computed them", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("per-person-row").length).toBe(4));
    const mary = personRow(MARY)!;
    // Lee's figures after the backfill: 30 entitlement, 18 used, 12 left.
    expect(mary).toHaveTextContent("Mary Bonner");
    const cells = within(mary).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("30");
    expect(cells[2]).toHaveTextContent("18");
    expect(cells[4]).toHaveTextContent("12");

    const carmen = personRow(CARMEN)!;
    expect(within(carmen).getAllByRole("cell")[4]).toHaveTextContent("2");
  });

  it("lists the DATES behind the numbers, so a balance can be checked against something", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("per-person-row").length).toBe(4));
    expect(personRow(MARY)!).toHaveTextContent("18 Jul–21 Jul (4)");
    expect(personRow(CARMEN)!).toHaveTextContent("17 May–25 May (9)");
    // Nothing on file reads as a dash, not as an empty cell somebody has to interpret.
    expect(personRow("staff-nohire")!).toHaveTextContent("—");
  });

  it("pro-rates a mid-year starter, and labels it", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("per-person-row").length).toBe(4));
    const nuria = personRow(NEWSTARTER)!;
    // Hired 1 July 2026: 184 of 365 days, so 16 of 30 rounded up.
    expect(within(nuria).getAllByRole("cell")[1]).toHaveTextContent("16");
    expect(within(nuria).getAllByRole("cell")[1]).toHaveTextContent("pro-rata");
  });

  it("flags a MISSING hire date instead of quietly reducing the entitlement", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("per-person-row").length).toBe(4));
    const tomas = personRow("staff-nohire")!;
    // The full 30 — "we do not know when they started" is not a reason to take days away.
    expect(within(tomas).getAllByRole("cell")[1]).toHaveTextContent("30");
    expect(within(tomas).getAllByTestId("missing-hire-date")).toHaveLength(1);
    expect(within(tomas).queryByText("pro-rata")).not.toBeInTheDocument();
  });

  it("does not change shape when the status tab above it is filtered", async () => {
    // The per-person table is a statement of the year; the tab strip filters the list BELOW it.
    // The fake applies filters, so choosing a status with no rows really does empty that list.
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("per-person-row").length).toBe(4));

    const rejected = screen.getByRole("tab", { name: "Rejected" });
    fireEvent.pointerDown(rejected, new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    fireEvent.mouseDown(rejected, { button: 0, bubbles: true });
    fireEvent.focus(rejected);

    await waitFor(() => expect(rejected).toHaveAttribute("data-state", "active"));
    // Still four people, still Mary's July dates — the year did not change because a tab did.
    expect(screen.getAllByTestId("per-person-row")).toHaveLength(4);
    expect(personRow(MARY)!).toHaveTextContent("18 Jul");
  });
});

describe("the short-notice warning", () => {
  it("flags a request that starts inside two months, before anybody approves it", async () => {
    renderPage();
    const warning = await screen.findByTestId("short-notice-warning");
    // 22 September is 12 days after 10 September.
    expect(warning).toHaveTextContent("Starts in 12 days");
    expect(warning).toHaveTextContent("ET art. 38.3");
  });

  it("stays silent on a request far enough out", async () => {
    rows.staff_holidays = [
      holiday("h-4", MARY, "2026-12-24", "2026-12-27", "requested", {
        first_name: "Mary",
        last_name: "Bonner",
      }),
    ];
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("per-person-row").length).toBe(4));
    expect(screen.queryByTestId("short-notice-warning")).not.toBeInTheDocument();
  });

  it("moves with the setting rather than a hardcoded two months", async () => {
    // 24 December is 105 days out — outside the default 60, inside a 120-day policy.
    rows.staff_holidays = [
      holiday("h-4", MARY, "2026-12-24", "2026-12-27", "requested", {
        first_name: "Mary",
        last_name: "Bonner",
      }),
    ];
    rows.system_settings = [{ key: "holiday_short_notice_warning_days", value: "120" }];
    renderPage();
    const warning = await screen.findByTestId("short-notice-warning");
    expect(warning).toHaveTextContent("less than the 120 days");
  });
});

describe("the CSV", () => {
  it("writes one row per holiday, with the person's balance on each", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("per-person-row").length).toBe(4));
    screen.getByRole("button", { name: "Download CSV" }).click();

    await waitFor(() => expect(csvCalls).toHaveLength(1));
    const { filename, rows: csv } = csvCalls[0];
    expect(filename).toBe("holidays-2026-2026-09-10.csv");
    // Three holidays + one person with none: four rows, so nobody is missing from the export.
    expect(csv).toHaveLength(4);
    const mary = (csv as Array<Record<string, unknown>>).find((r) => r.name === "Mary Bonner")!;
    expect(mary).toMatchObject({
      entitlement: 30,
      approved: 18,
      pending: 0,
      remaining: 12,
      dates: "18 Jul–21 Jul",
      status: "approved",
      days: 4,
    });
    // A person with no holidays still gets a row — an accountant reading the file needs to see
    // that they took none, not to wonder whether they were left out.
    const tomas = (csv as Array<Record<string, unknown>>).find((r) => r.name === "Tomás Ruiz")!;
    expect(tomas).toMatchObject({ remaining: 30, dates: "" });
    // And the entitlement column carries the PRO-RATED figure, not the stored 30. Exporting the
    // annual number for a mid-year starter is how a spreadsheet ends up disagreeing with the
    // screen it was exported from.
    const nuria = (csv as Array<Record<string, unknown>>).find((r) => r.name === "Nuria Vega")!;
    expect(nuria).toMatchObject({ entitlement: 16, pending: 4, status: "requested" });
  });
});

describe("the policy card", () => {
  it("is on this page, where the person approving requests is", async () => {
    renderPage();
    expect(await screen.findByText("Holiday policy")).toBeInTheDocument();
    // The rule that is not negotiable is stated on the screen, not just in a comment.
    expect(
      await screen.findByText(/never exchanged for money/i),
    ).toBeInTheDocument();
  });

  it("offers no pay-out control", async () => {
    renderPage();
    await screen.findByText("Holiday policy");
    expect(document.body.textContent).not.toMatch(/pay[- ]?out control|buy back|compensation in/i);
    expect(screen.queryByRole("switch", { name: /pay/i })).not.toBeInTheDocument();
  });
});
