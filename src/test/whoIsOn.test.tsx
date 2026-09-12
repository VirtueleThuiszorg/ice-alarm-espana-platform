// Who is on now, and who is on next — the supervisor's first question.
//
// THE CLAIM UNDER TEST is not "it renders a list". It is that the strip tells apart the three
// facts `staff-shift-monitor` tells apart — SCHEDULED (a rota row), ON DUTY (they pressed the
// button) and PRESENT (a browser pinged inside 90 seconds) — and shows the one combination that
// needs a supervisor: scheduled, and neither of the other two. A strip that collapsed them into
// one green tick would read as "covered" at the exact moment the runner raises a no-show, which
// is worse than showing nothing.
//
// Rendered against a fake PostgREST that applies its filters, with the clock pinned, because
// every boundary here is a time: which shift is current, which is next, and whether a heartbeat
// is stale.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MARY = "staff-mary";
const TRAVIS = "staff-travis";
const CARMEN = "staff-carmen";

interface Filter {
  op: string;
  column: string;
  value: unknown;
}

let rows: Record<string, unknown[]> = {};
const queries: Array<{ table: string; filters: Filter[] }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const filters: Filter[] = [];
    queries.push({ table, filters });
    const self: Record<string, unknown> = {};
    const keep = (op: string) => (column: string, value: unknown) => {
      filters.push({ op, column, value });
      return self;
    };
    self.select = () => self;
    self.order = () => self;
    self.eq = keep("eq");
    self.gte = keep("gte");
    self.lte = keep("lte");
    self.in = keep("in");
    const result = () =>
      (rows[table] ?? []).filter((row) =>
        filters.every((f) => {
          const r = row as Record<string, unknown>;
          if (f.op === "eq") return r[f.column] === f.value;
          if (f.op === "in") return (f.value as unknown[]).includes(r[f.column]);
          if (f.op === "gte") return String(r[f.column]) >= String(f.value);
          if (f.op === "lte") return String(r[f.column]) <= String(f.value);
          return true;
        }),
      );
    self.then = (resolve: (v: unknown) => unknown) => resolve({ data: result(), error: null });
    self.maybeSingle = async () => ({ data: result()[0] ?? null, error: null });
    return self;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

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

import { WhoIsOnStrip } from "@/components/call-centre/WhoIsOnStrip";
import { HEARTBEAT_STALE_SECONDS, shiftEndLabel } from "@/hooks/useWhoIsOn";

function renderStrip(enabled = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WhoIsOnStrip enabled={enabled} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const person = (staffId: string) =>
  screen.getAllByTestId("who-is-on-person").find((el) => el.dataset.staffId === staffId);

/** 10 September 2026, 09:00 Madrid — inside the morning shift. */
const MORNING = new Date("2026-09-10T07:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(MORNING);
  queries.length = 0;
  rows = {
    staff_on_shift_now: [
      { staff_id: MARY, first_name: "Mary", last_name: "Bonner", shift_type: "morning" },
    ],
    staff: [{ id: MARY, is_on_call: true }],
    staff_presence: [
      { staff_id: MARY, is_online: true, last_heartbeat_at: new Date(MORNING.getTime() - 10_000).toISOString() },
    ],
    staff_shifts: [
      {
        staff_id: CARMEN,
        shift_type: "afternoon",
        shift_date: "2026-09-10",
        staff: { first_name: "Carmen", last_name: "Nicolás" },
      },
      // Not next: a night shift the same day, and somebody else's morning tomorrow.
      {
        staff_id: TRAVIS,
        shift_type: "night",
        shift_date: "2026-09-10",
        staff: { first_name: "Travis", last_name: "Nelison" },
      },
    ],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the shift in progress", () => {
  it("names the current shift and when it ends, from SHIFT_BOUNDS", async () => {
    renderStrip();
    await waitFor(() => expect(screen.getByTestId("who-is-on-person")).toBeInTheDocument());
    expect(screen.getByTestId("who-is-on-strip")).toHaveTextContent("On now");
    expect(screen.getByTestId("who-is-on-strip")).toHaveTextContent("Morning");
    // 15:00, and read off the same constant the escalation runner uses.
    expect(shiftEndLabel("morning")).toBe("15:00");
    expect(screen.getByTestId("who-is-on-strip")).toHaveTextContent("until 15:00");
  });

  it("shows scheduled, on duty and present as THREE separate statements", async () => {
    renderStrip();
    const mary = await waitFor(() => {
      const el = person(MARY);
      expect(el).toBeTruthy();
      return el!;
    });
    expect(mary).toHaveTextContent("Mary Bonner");
    expect(mary).toHaveTextContent("on duty");
    expect(mary).toHaveTextContent("browser active");
    expect(mary.dataset.accountedFor).toBe("true");
  });

  it("flags somebody scheduled who is neither on duty nor present", async () => {
    rows.staff = [];
    rows.staff_presence = [];
    renderStrip();
    const warning = await screen.findByTestId("who-is-on-warning");
    expect(warning).toHaveTextContent("1 scheduled and not signed in");
    // The row itself carries the state, so the styling is not the only signal.
    expect(person(MARY)!.dataset.accountedFor).toBe("false");
  });

  it("treats a STALE heartbeat as not present, matching what the runner does at 90s", async () => {
    // The runner clears `is_online` at 90 seconds and raises a disconnection. A strip that
    // trusted `is_online` alone would still read "present" until the runner's next pass.
    expect(HEARTBEAT_STALE_SECONDS).toBe(90);
    rows.staff = [];
    rows.staff_presence = [
      {
        staff_id: MARY,
        is_online: true,
        last_heartbeat_at: new Date(MORNING.getTime() - 91_000).toISOString(),
      },
    ];
    renderStrip();
    const mary = await waitFor(() => {
      const el = person(MARY);
      expect(el).toBeTruthy();
      return el!;
    });
    expect(mary).toHaveTextContent("no recent ping");
    expect(mary.dataset.accountedFor).toBe("false");
  });

  it("counts a fresh heartbeat as present even when nobody pressed on duty", async () => {
    rows.staff = [];
    renderStrip();
    const mary = await waitFor(() => {
      const el = person(MARY);
      expect(el).toBeTruthy();
      return el!;
    });
    // Present but not on duty is NOT a no-show — somebody is at the desk. Both are stated.
    expect(mary).toHaveTextContent("not on duty");
    expect(mary).toHaveTextContent("browser active");
    expect(mary.dataset.accountedFor).toBe("true");
    expect(screen.queryByTestId("who-is-on-warning")).not.toBeInTheDocument();
  });

  it("says NOBODY IS SCHEDULED distinctly from somebody being absent", async () => {
    // An empty rota slot is a planning failure; an absent person is an operational one.
    rows.staff_on_shift_now = [];
    renderStrip();
    expect(await screen.findByTestId("who-is-on-nobody")).toHaveTextContent(
      "Nobody is on the rota for this shift",
    );
    expect(screen.queryByTestId("who-is-on-warning")).not.toBeInTheDocument();
  });
});

describe("the shift after this one", () => {
  it("asks for the NEXT shift by type and date, and shows who has it", async () => {
    renderStrip();
    await waitFor(() => expect(screen.getByTestId("who-is-next")).toBeInTheDocument());
    expect(screen.getByTestId("who-is-next")).toHaveTextContent("Carmen Nicolás");
    // Travis's night shift is on the same date but is not next.
    expect(screen.getByTestId("who-is-next")).not.toHaveTextContent("Travis");

    const shiftQuery = queries.find((q) => q.table === "staff_shifts")!;
    expect(shiftQuery.filters).toEqual(
      expect.arrayContaining([
        { op: "eq", column: "shift_date", value: "2026-09-10" },
        { op: "eq", column: "shift_type", value: "afternoon" },
      ]),
    );
  });

  it("rolls to TOMORROW's morning when the night shift is the one in progress", async () => {
    // 23:30 Madrid on the 10th. The night shift is keyed on the 10th; the shift after it is the
    // morning of the ELEVENTH, and a strip that asked for the 10th would show the wrong person.
    vi.setSystemTime(new Date("2026-09-10T21:30:00Z"));
    rows.staff_on_shift_now = [
      { staff_id: TRAVIS, first_name: "Travis", last_name: "Nelison", shift_type: "night" },
    ];
    rows.staff_shifts = [
      {
        staff_id: MARY,
        shift_type: "morning",
        shift_date: "2026-09-11",
        staff: { first_name: "Mary", last_name: "Bonner" },
      },
    ];
    renderStrip();
    await waitFor(() => expect(screen.getByTestId("who-is-next")).toBeInTheDocument());
    expect(screen.getByTestId("who-is-next")).toHaveTextContent("Mary Bonner");
    const shiftQuery = queries.find((q) => q.table === "staff_shifts")!;
    expect(shiftQuery.filters).toEqual(
      expect.arrayContaining([
        { op: "eq", column: "shift_date", value: "2026-09-11" },
        { op: "eq", column: "shift_type", value: "morning" },
      ]),
    );
  });

  it("stays on the SAME date at 01:00, when the night shift began yesterday", async () => {
    // 01:00 Madrid on the 11th is the night shift of the 10th (getShiftContext resolves that),
    // so the next shift is still the morning of the 11th — not the 12th.
    vi.setSystemTime(new Date("2026-09-10T23:00:00Z"));
    rows.staff_on_shift_now = [
      { staff_id: TRAVIS, first_name: "Travis", last_name: "Nelison", shift_type: "night" },
    ];
    renderStrip();
    await waitFor(() => expect(queries.some((q) => q.table === "staff_shifts")).toBe(true));
    const shiftQuery = queries.find((q) => q.table === "staff_shifts")!;
    expect(shiftQuery.filters).toEqual(
      expect.arrayContaining([{ op: "eq", column: "shift_date", value: "2026-09-11" }]),
    );
  });

  it("says nobody is on next rather than leaving the row blank", async () => {
    rows.staff_shifts = [];
    renderStrip();
    expect(await screen.findByTestId("who-is-next-nobody")).toHaveTextContent(
      "nobody on the rota",
    );
  });
});

describe("who gets the strip at all", () => {
  it("renders nothing, and asks for nothing, when it is not enabled", async () => {
    // Presence is readable by admin / super_admin / call_centre_supervisor only, so an operator
    // would see every scheduled person as absent. Not showing it is the honest option.
    renderStrip(false);
    expect(screen.queryByTestId("who-is-on-strip")).not.toBeInTheDocument();
    expect(queries).toHaveLength(0);
  });

  it("is offered to rota managers on the dashboard, and to nobody else", () => {
    const dashboard = readFileSync(
      join(process.cwd(), "src/pages/call-centre/StaffDashboard.tsx"),
      "utf8",
    );
    expect(dashboard).toMatch(/<WhoIsOnStrip[\s\S]{0,160}ROTA_MANAGER_ROLES/);
  });

  it("uses the same staleness threshold as the runner — ONE constant, not two that match", () => {
    /*
      This used to read the runner's source for its own `HEARTBEAT_STALE_SECONDS = 90` and compare
      the numbers, because that constant was module-private there. Pinning a duplicate only ever
      says "they have not drifted YET", and the runner and this strip disagreeing about whether
      somebody is present is exactly the defect that filled a bell with no-show alerts about a man
      at his desk. So there is one constant now, in `_shared/presence.ts`, and what is asserted is
      that BOTH read it rather than that two numbers happen to match.
    */
    const runner = readFileSync(
      join(process.cwd(), "supabase/functions/staff-shift-monitor/index.ts"),
      "utf8",
    );
    const hook = readFileSync(join(process.cwd(), "src/hooks/useWhoIsOn.ts"), "utf8");

    expect(runner).toMatch(/import\s*\{[^}]*HEARTBEAT_STALE_SECONDS[^}]*\}\s*from\s*"\.\.\/_shared\/presence\.ts"/);
    expect(hook).toContain("_shared/presence");
    // Neither may declare one of its own again.
    expect(runner).not.toMatch(/const\s+HEARTBEAT_STALE_SECONDS\s*=/);
    expect(hook).not.toMatch(/const\s+HEARTBEAT_STALE_SECONDS\s*=/);
    // And the value the strip exports is still the shared one.
    expect(HEARTBEAT_STALE_SECONDS).toBe(90);
  });
});
