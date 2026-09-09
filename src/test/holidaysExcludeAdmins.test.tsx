/**
 * Admins do not appear on the Holidays page (Lee's dashboard notes, 9 Sep, item 5).
 *
 * FOUR SURFACES, and only one of them filtered. The cover picker asked for
 * `role IN ('call_centre','call_centre_supervisor')` inline; the request list, the calendar and
 * the balance counts asked for everybody. So an admin was absent from the picker and present in
 * the other three — which reads as a bug in the picker rather than a filter missing twice.
 *
 * `staff_holiday_balance` is the reason the counts were wrong: it is a view over every ACTIVE
 * staff row (20260303150000) with no role column, so every admin has always had a balance row
 * there with a 30-day allowance nobody tracks.
 *
 * Tested three ways, because a source-text assertion alone would not survive a refactor and a
 * pure-function test alone would not prove the query asks the database the right question:
 *
 *   1. the pure guard, against a FIXTURE ADMIN WITH A HOLIDAY ROW;
 *   2. the hook end to end, with a mocked client that returns that admin row anyway;
 *   3. the query shape, so the work is done server-side rather than by fetching everything.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";

import type { StaffHoliday } from "@/hooks/useStaffHolidays";

/** The row shape the mocked client hands back — the hook's own, so a fixture cannot drift. */
type Holiday = StaffHoliday;

/** Every filter each query applied, so "did it ask the database" is provable. */
type Call = { table: string; select: string; ins: [string, unknown[]][]; eqs: [string, unknown][] };
let calls: Call[] = [];

let holidayRows: Holiday[] = [];
let staffRows: { id: string }[] = [];
let balanceRows: Record<string, unknown>[] = [];

function builder(table: string) {
  const call: Call = { table, select: "", ins: [], eqs: [] };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  const resolve = () => {
    if (table === "staff_holidays") return { data: holidayRows, error: null };
    if (table === "staff") return { data: staffRows, error: null };
    return { data: balanceRows, error: null };
  };
  chain.select = (cols: string) => {
    call.select = cols;
    return chain;
  };
  chain.in = (col: string, vals: unknown[]) => {
    call.ins.push([col, vals]);
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    call.eqs.push([col, val]);
    return chain;
  };
  // `.order()` returns the BUILDER, not a promise. The real PostgREST builder is thenable and
  // keeps accepting filters after `.order()` — `useAllHolidays` relies on exactly that, applying
  // `.eq("status", …)` afterwards. A mock that resolved here made that call land on a Promise and
  // the hook threw instead of filtering.
  chain.order = () => chain;
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(resolve()).then(res);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

const { HOLIDAY_ROLES, takesHolidays } = await import("@/config/shifts");
const { holidaysOfRotaStaff, useAllHolidays, useAllHolidayBalances } = await import(
  "@/hooks/useStaffHolidays"
);

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** A real holiday request, differing only in the requester's role. */
const holiday = (role: string | undefined, over: Record<string, unknown> = {}) =>
  ({
    id: `h-${role ?? "none"}`,
    staff_id: `s-${role ?? "none"}`,
    start_date: "2026-09-14",
    end_date: "2026-09-21",
    reason: "family",
    status: "requested",
    total_days: 8,
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
    created_at: "2026-09-09T08:00:00Z",
    updated_at: "2026-09-09T08:00:00Z",
    staff: role === undefined
      ? { first_name: "Role", last_name: "Unknown" }
      : { first_name: "Ada", last_name: "Admin", role },
    ...over,
  }) as unknown as Holiday;

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  calls = [];
  holidayRows = [];
  staffRows = [];
  balanceRows = [];
});
afterEach(() => cleanup());

describe("who takes holidays through the rota", () => {
  it("call-centre staff and their supervisors do", () => {
    expect(takesHolidays("call_centre")).toBe(true);
    expect(takesHolidays("call_centre_supervisor")).toBe(true);
  });

  it("admins and super_admins do NOT", () => {
    expect(takesHolidays("admin")).toBe(false);
    expect(takesHolidays("super_admin")).toBe(false);
  });

  it("nor does an unknown or absent role", () => {
    expect(takesHolidays(null)).toBe(false);
    expect(takesHolidays(undefined)).toBe(false);
    expect(takesHolidays("")).toBe(false);
    expect(takesHolidays("partner")).toBe(false);
  });

  it("the list is exactly the two rota roles — a third would show up on the page", () => {
    expect([...HOLIDAY_ROLES]).toEqual(["call_centre", "call_centre_supervisor"]);
  });
});

describe("the guard, against a fixture admin who HAS a holiday row", () => {
  it("drops an admin's holiday request", () => {
    const rows = [holiday("call_centre"), holiday("admin")];
    const kept = holidaysOfRotaStaff(rows);
    expect(kept).toHaveLength(1);
    expect(kept[0].staff?.role).toBe("call_centre");
  });

  it("drops a super_admin's too", () => {
    expect(holidaysOfRotaStaff([holiday("super_admin")])).toEqual([]);
  });

  it("keeps a supervisor's", () => {
    expect(holidaysOfRotaStaff([holiday("call_centre_supervisor")])).toHaveLength(1);
  });

  it("KEEPS a row whose role could not be read — silence is the worse failure", () => {
    // The embedded select supplies the role. Dropping rows we simply failed to read the role for
    // would hide real requests from the people who approve them, which is worse than showing one
    // row too many.
    const kept = holidaysOfRotaStaff([holiday(undefined)]);
    expect(kept).toHaveLength(1);
  });

  it("keeps nothing at all when every requester is an admin", () => {
    expect(holidaysOfRotaStaff([holiday("admin"), holiday("super_admin")])).toEqual([]);
  });
});

describe("useAllHolidays — end to end, with the admin row coming back anyway", () => {
  it("asks the database for rota roles only, with a real inner join", async () => {
    holidayRows = [holiday("call_centre")];
    const { result } = renderHook(() => useAllHolidays(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const q = calls.find((c) => c.table === "staff_holidays")!;
    // `!inner` is what makes `staff.role` filterable at all: without it PostgREST leaves the
    // embedded row null rather than excluding the parent.
    expect(q.select).toContain("staff:staff_id!inner");
    expect(q.select).toContain("role");
    expect(q.ins).toEqual([["staff.role", ["call_centre", "call_centre_supervisor"]]]);
  });

  it("still drops an admin row if one arrives — a stale cache, or a changed select", async () => {
    holidayRows = [holiday("call_centre"), holiday("admin"), holiday("super_admin")];
    const { result } = renderHook(() => useAllHolidays(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].staff?.role).toBe("call_centre");
  });

  it("passes the status filter through as well as the role filter", async () => {
    holidayRows = [holiday("call_centre")];
    const { result } = renderHook(() => useAllHolidays("approved"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const q = calls.find((c) => c.table === "staff_holidays")!;
    expect(q.eqs).toEqual([["status", "approved"]]);
    expect(q.ins).toEqual([["staff.role", ["call_centre", "call_centre_supervisor"]]]);
  });
});

describe("useAllHolidayBalances — the counts", () => {
  it("reads the rota staff first, then filters the balance view by their ids", async () => {
    staffRows = [{ id: "s-1" }, { id: "s-2" }];
    balanceRows = [{ staff_id: "s-1", first_name: "Cara" }];
    const { result } = renderHook(() => useAllHolidayBalances(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const staffQuery = calls.find((c) => c.table === "staff")!;
    expect(staffQuery.ins).toEqual([["role", ["call_centre", "call_centre_supervisor"]]]);
    expect(staffQuery.eqs).toEqual([["status", "active"]]);

    const balanceQuery = calls.find((c) => c.table === "staff_holiday_balance")!;
    expect(balanceQuery.ins).toEqual([["staff_id", ["s-1", "s-2"]]]);
    expect(result.current.data).toHaveLength(1);
  });

  it("returns NO balances when there are no rota staff — not everybody", () => {
    // The failure that would put every admin back on the page: an unfiltered fallback when the
    // id list comes back empty.
    staffRows = [];
    balanceRows = [{ staff_id: "s-admin", first_name: "Ada" }];
    const { result } = renderHook(() => useAllHolidayBalances(), { wrapper });
    return waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual([]);
      // And it did not even ask the view.
      expect(calls.find((c) => c.table === "staff_holiday_balance")).toBeUndefined();
    });
  });
});

describe("the page's four surfaces all use the one list", () => {
  const page = read("src/pages/admin/HolidaysPage.tsx");
  const hooks = read("src/hooks/useStaffHolidays.ts");

  it("the cover picker uses the shared constant, not its own copy", () => {
    expect(page).toContain("[...HOLIDAY_ROLES]");
    expect(page).not.toMatch(/\.in\("role", \["call_centre", "call_centre_supervisor"\]\)/);
  });

  it("the list and the balances both filter on it", () => {
    expect(hooks.split("HOLIDAY_ROLES").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("the list, the calendar and the counts all come from the two filtered hooks", () => {
    // The calendar and the request list render from `holidays`, and the counts from `balances`;
    // there is no third query on this page reaching for staff_holidays or the balance view.
    expect(page).toContain("useAllHolidays(");
    expect(page).toContain("useAllHolidayBalances()");
    expect(page).not.toContain('from("staff_holidays")');
    expect(page).not.toContain('from("staff_holiday_balance")');
  });

  it("the balance view itself still has no role column — which is why this is a client filter", () => {
    // If a migration ever adds one, this fails and the two-query dance can collapse into one.
    const view = read("supabase/migrations/20260303150000_staff_invites.sql");
    const def = view.slice(view.indexOf("CREATE OR REPLACE VIEW public.staff_holiday_balance"));
    expect(def.slice(0, 900)).not.toMatch(/s\.role/);
  });
});
