/**
 * "My shifts" has to say WHOSE shift it is.
 *
 * The 2026 import puts 15 of Travis's 128 shifts on days the six-day cycle says he is not on a
 * day shift at all, because he is covering somebody's holiday. Rendered as a bare shift, that
 * reads to the operator as a rota error — the one thing that makes people stop trusting a rota
 * and go back to the spreadsheet. So the cover is labelled, and the REASON is distinguished:
 * covering a holiday is not the same ask as covering a shift somebody moved off
 * (ROTA_MODEL.md §2-B).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

type Row = Record<string, unknown>;
let shiftRows: Row[] = [];
let coverRows: Row[] = [];
/** Every (table, filter) pair the component asked for, so "what did it query" is answerable. */
let queries: { table: string; eqs: [string, unknown][] }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const build = (table: string) => {
    const eqs: [string, unknown][] = [];
    const result = () => {
      queries.push({ table, eqs: [...eqs] });
      if (table === "staff_shifts") return { data: shiftRows, error: null };
      if (table === "staff_shift_covers") {
        const wanted = Object.fromEntries(eqs);
        return {
          data: coverRows.filter((r) =>
            Object.entries(wanted).every(([k, v]) => r[k] === v),
          ),
          error: null,
        };
      }
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "limit"]) {
      chain[m] = (...args: unknown[]) => {
        if (m === "eq") eqs.push([args[0] as string, args[1]]);
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  };
  return { supabase: { from: (table: string) => build(table) } };
});

vi.mock("react-i18next", () => ({
  // `initReactI18next` has to be present: something in this component's import graph pulls in
  // src/i18n/index.ts, which calls `.use(initReactI18next)` at module load. Omitting it makes
  // the whole file fail to collect with "no tests" rather than a useful error.
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    // Render the English default with its interpolation, the way i18next would.
    t: (_k: string, d?: string, opts?: Record<string, string>) =>
      typeof d === "string"
        ? d.replace(/\{\{(\w+)\}\}/g, (_m, name) => opts?.[name] ?? "")
        : _k,
  }),
}));

const { MyShiftsWidget } = await import("@/components/call-centre/MyShiftsWidget");

const wrap = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const MY_ID = "staff-travis";

beforeEach(() => {
  queries = [];
  shiftRows = [
    {
      id: "shift-1",
      staff_id: MY_ID,
      shift_date: "2026-10-08",
      shift_type: "morning",
      start_time: "07:00:00",
      end_time: "15:00:00",
      is_confirmed: true,
      notes: null,
    },
    {
      id: "shift-2",
      staff_id: MY_ID,
      shift_date: "2026-10-09",
      shift_type: "night",
      start_time: "23:00:00",
      end_time: "07:00:00",
      is_confirmed: true,
      notes: null,
    },
  ];
  coverRows = [];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MyShiftsWidget labels covers", () => {
  it("says whose shift it is, and that it is a holiday", async () => {
    coverRows = [
      {
        id: "c1",
        shift_id: "shift-1",
        holiday_id: "h-carmen",
        original_staff_id: "staff-carmen",
        cover_staff_id: MY_ID,
        status: "accepted",
        original_staff: { first_name: "Carmen", last_name: "Nicolas" },
      },
    ];
    render(<MyShiftsWidget staffId={MY_ID} />, { wrapper: wrap });
    expect(await screen.findByText("Covering Carmen Nicolas — holiday")).toBeTruthy();
  });

  it("distinguishes a moved shift from a holiday", async () => {
    // holiday_id NULL is the "(moved)" case: the other person vacated their own shift. Telling
    // an operator it is a holiday when it is not is a small lie that makes the label useless.
    coverRows = [
      {
        id: "c2",
        shift_id: "shift-1",
        holiday_id: null,
        original_staff_id: "staff-carmen",
        cover_staff_id: MY_ID,
        status: "accepted",
        original_staff: { first_name: "Carmen", last_name: "Nicolas" },
      },
    ];
    render(<MyShiftsWidget staffId={MY_ID} />, { wrapper: wrap });
    expect(await screen.findByText("Covering Carmen Nicolas — swap")).toBeTruthy();
  });

  it("labels only the covered shift, not every shift that day", async () => {
    coverRows = [
      {
        id: "c1",
        shift_id: "shift-1",
        holiday_id: "h-carmen",
        original_staff_id: "staff-carmen",
        cover_staff_id: MY_ID,
        status: "accepted",
        original_staff: { first_name: "Carmen", last_name: "Nicolas" },
      },
    ];
    render(<MyShiftsWidget staffId={MY_ID} />, { wrapper: wrap });
    await screen.findByText("Covering Carmen Nicolas — holiday");
    expect(screen.getAllByText(/Covering/)).toHaveLength(1);
  });

  it("shows no cover label when the shift is the operator's own", async () => {
    render(<MyShiftsWidget staffId={MY_ID} />, { wrapper: wrap });
    // Both shifts render, and neither claims to be a cover.
    expect(await screen.findByText("Thu 8 Oct")).toBeTruthy();
    expect(screen.queryByText(/Covering/)).toBeNull();
  });

  it("asks for ACCEPTED covers, not pending ones", async () => {
    // A seeded rota has no pending covers at all — every imported row is already accepted,
    // because it describes a shift that was worked. Querying 'pending' here would show an
    // operator no covers ever, which looks like "nothing to see" rather than "wrong question".
    render(<MyShiftsWidget staffId={MY_ID} />, { wrapper: wrap });
    await waitFor(() => {
      const cov = queries.filter((q) => q.table === "staff_shift_covers");
      expect(cov.length).toBeGreaterThan(0);
      expect(cov[0].eqs).toEqual(
        expect.arrayContaining([
          ["cover_staff_id", MY_ID],
          ["status", "accepted"],
        ]),
      );
    });
  });
});
