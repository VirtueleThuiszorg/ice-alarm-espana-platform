// Filter the rota by person — and do not let the filter change what the coverage banner says.
//
// THE HAZARD, and the only reason this file exists. The banner above the grid says whether every
// slot this week has somebody on it. If filtering to one person also filtered the shifts the
// banner counts, a fully covered week would read as UNCOVERED the moment a supervisor looked at
// one person — a false alarm on the one banner that means "a shift has nobody on it", and the
// fastest way to teach somebody to ignore it.
//
// So the fixture below covers the week COMPLETELY, and the assertion is that the banner stays
// green while the grid narrows to one row. Filtering can only ever remove shifts, so that is the
// direction the coupling actually breaks in.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MARY = "staff-mary";
const CARMEN = "staff-carmen";

let rows: Record<string, unknown[]> = {};

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.order = () => self;
    self.eq = (column: string, value: unknown) => {
      if (!column.includes(".")) filters.push((r) => r[column] === value);
      return self;
    };
    self.in = (column: string, values: unknown[]) => {
      if (!column.includes(".")) filters.push((r) => values.includes(r[column]));
      return self;
    };
    self.gte = (column: string, value: unknown) => {
      filters.push((r) => String(r[column]) >= String(value));
      return self;
    };
    self.lte = (column: string, value: unknown) => {
      filters.push((r) => String(r[column]) <= String(value));
      return self;
    };
    const result = () =>
      (rows[table] ?? []).filter((row) =>
        filters.every((f) => f(row as Record<string, unknown>)),
      );
    self.then = (resolve: (v: unknown) => unknown) => resolve({ data: result(), error: null });
    self.maybeSingle = async () => ({ data: result()[0] ?? null, error: null });
    return self;
  };
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: async () => ({ data: [], error: null }),
    },
  };
});

// A supervisor: the person this route was opened up for. The escalation query is disabled for
// them, which is asserted in rotaAccess.test.tsx and is why no fixture is needed for it here.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ staffRole: "call_centre_supervisor", user: { id: "u-1" } }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { id: MARY, first_name: "Mary", last_name: "Bonner", role: "call_centre_supervisor" } }),
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

import RotaPage from "@/pages/admin/RotaPage";

/** Monday 7 September 2026 to Sunday the 13th — the week the clock below lands in. */
const WEEK = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
];

const shift = (staffId: string, date: string, type: string) => ({
  id: `${staffId}-${date}-${type}`,
  staff_id: staffId,
  shift_date: date,
  shift_type: type,
  start_time: type === "morning" ? "07:00:00" : type === "afternoon" ? "15:00:00" : "23:00:00",
  end_time: type === "morning" ? "15:00:00" : type === "afternoon" ? "23:00:00" : "07:00:00",
  is_confirmed: false,
  notes: null,
  created_by: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  staff: { first_name: staffId === MARY ? "Mary" : "Carmen", last_name: staffId === MARY ? "Bonner" : "Nicolás" },
});

function renderRota() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RotaPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Radix opens on pointerdown; jsdom needs the shims in src/test/setup.ts. */
const openSelect = (label: string) => {
  const trigger = screen.getByRole("combobox", { name: label });
  fireEvent.pointerDown(trigger, new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
  return trigger;
};

const chooseOption = (name: string) => {
  const option = screen.getByRole("option", { name });
  fireEvent.click(option);
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Thursday 10 September 2026 — the week of Monday the 7th.
  vi.setSystemTime(new Date("2026-09-10T07:00:00Z"));
  rows = {
    staff: [
      { id: MARY, first_name: "Mary", last_name: "Bonner", role: "call_centre_supervisor", status: "active", personal_mobile: null },
      { id: CARMEN, first_name: "Carmen", last_name: "Nicolás", role: "call_centre", status: "active", personal_mobile: null },
    ],
    // A COMPLETELY covered week: Mary every morning and every night, Carmen every afternoon.
    // 21 slots, all filled, so the banner is green — and must stay green when the grid shows one
    // person. A partially covered week is used in its own test below.
    staff_shifts: WEEK.flatMap((date) => [
      shift(MARY, date, "morning"),
      shift(CARMEN, date, "afternoon"),
      shift(MARY, date, "night"),
    ]),
    staff_on_shift_now: [],
    shift_escalation_chain: [],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("filtering the rota by person", () => {
  it("shows every operator by default", async () => {
    renderRota();
    await waitFor(() => expect(screen.getByText("Mary B.")).toBeInTheDocument());
    expect(screen.getByText("Carmen N.")).toBeInTheDocument();
  });

  it("offers every operator in the picker, not a hardcoded list", async () => {
    renderRota();
    await waitFor(() => expect(screen.getByText("Mary B.")).toBeInTheDocument());
    openSelect("Show");
    expect(await screen.findByRole("option", { name: "Everyone" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mary Bonner" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Carmen Nicolás" })).toBeInTheDocument();
  });

  it("narrows the grid to one person's rows", async () => {
    renderRota();
    await waitFor(() => expect(screen.getByText("Carmen N.")).toBeInTheDocument());
    openSelect("Show");
    chooseOption("Mary Bonner");
    await waitFor(() => expect(screen.queryByText("Carmen N.")).not.toBeInTheDocument());
    expect(screen.getByText("Mary B.")).toBeInTheDocument();
  });

  it("does NOT change the coverage banner — the filter must not report on itself", async () => {
    renderRota();
    // The whole week is covered between the two of them.
    expect(await screen.findByText("All shifts covered this week")).toBeInTheDocument();

    openSelect("Show");
    chooseOption("Carmen Nicolás");
    await waitFor(() => expect(screen.queryByText("Mary B.")).not.toBeInTheDocument());

    // Carmen alone covers only the afternoons — and the banner must STILL be green, because it
    // counts the week, not the filter.
    expect(screen.getByText("All shifts covered this week")).toBeInTheDocument();
    expect(screen.queryByText("Some shifts are uncovered this week")).not.toBeInTheDocument();
    // And the screen says out loud that the numbers above are not filtered.
    expect(screen.getByTestId("rota-filter-note")).toHaveTextContent(
      "still counts everybody's shifts",
    );
  });

  it("still reports a genuinely uncovered week, filtered or not", async () => {
    // The other direction: the banner is not simply pinned to green.
    rows.staff_shifts = [shift(MARY, "2026-09-07", "morning")];
    renderRota();
    expect(await screen.findByText("Some shifts are uncovered this week")).toBeInTheDocument();
    openSelect("Show");
    chooseOption("Mary Bonner");
    await waitFor(() => expect(screen.queryByText("Carmen N.")).not.toBeInTheDocument());
    expect(screen.getByText("Some shifts are uncovered this week")).toBeInTheDocument();
  });

  it("goes back to everyone", async () => {
    renderRota();
    await waitFor(() => expect(screen.getByText("Carmen N.")).toBeInTheDocument());
    openSelect("Show");
    chooseOption("Mary Bonner");
    await waitFor(() => expect(screen.queryByText("Carmen N.")).not.toBeInTheDocument());
    openSelect("Show");
    chooseOption("Everyone");
    await waitFor(() => expect(screen.getByText("Carmen N.")).toBeInTheDocument());
    expect(screen.queryByTestId("rota-filter-note")).not.toBeInTheDocument();
  });
});
