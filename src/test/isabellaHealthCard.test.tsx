/**
 * Isabella's dashboard card tells the truth about Isabella (Lee's dashboard notes, 9 Sep, item 1).
 *
 * WHAT WENT WRONG. `IsabellaStatusBanner` decided its whole verdict with
 * `enabledFunctions.length > 0` — a count of switches in `isabella_settings`. On 8 Sep the
 * Anthropic balance was zero, every run failed, and the dashboard sat there in green saying
 * ISABELLA ACTIVE with forty function names listed underneath. The banner could not have said
 * anything else: it never read an execution.
 *
 * So the load-bearing test is Lee's own: SEEDED CREDIT ERRORS TURN THE CARD RED WITH SETTINGS
 * UNTOUCHED. "Untouched" is asserted literally — the mocked client records every table it is
 * asked for, and `isabella_settings` must not be among them. A card that went red while still
 * consulting settings would pass a colour assertion and fail the point.
 *
 * Four layers, because no one of them is sufficient:
 *
 *   1. the verdict, as a pure function, one test per branch — including the two reds that are
 *      NOT about errors, which a fixture-based test would never reach;
 *   2. the hook, against a mocked PostgREST, proving it asks for `completed` and `failed`
 *      separately, takes an EXACT count, and never touches settings;
 *   3. the rendered card, proving the level reaches the screen as a WORD as well as a colour;
 *   4. the source, proving the old banner is gone and the new files cannot read a setting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";

import { stripComments } from "./helpers/stripComments";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => stripComments(read(p));

/** Every query the card made, so "it never asked about settings" is provable. */
type Query = {
  table: string;
  select: string;
  count?: string;
  eqs: [string, unknown][];
  gtes: [string, unknown][];
  orders: [string, unknown][];
  limit?: number;
};
let queries: Query[] = [];

let completedRow: { created_at: string } | null = null;
let completedError: unknown = null;
let failureRows: { error_message: string | null }[] = [];
/** Left undefined, the mock reports the row count — as PostgREST does with `count: 'exact'`. */
let failureCount: number | null | undefined;
let failureError: unknown = null;

function builder(table: string) {
  const q: Query = { table, select: "", eqs: [], gtes: [], orders: [] };
  queries.push(q);
  const chain: Record<string, unknown> = {};
  chain.select = (cols: string, opts?: { count?: string }) => {
    q.select = cols;
    q.count = opts?.count;
    return chain;
  };
  chain.eq = (c: string, v: unknown) => {
    q.eqs.push([c, v]);
    return chain;
  };
  chain.gte = (c: string, v: unknown) => {
    q.gtes.push([c, v]);
    return chain;
  };
  chain.order = (c: string, v: unknown) => {
    q.orders.push([c, v]);
    return chain;
  };
  chain.limit = (n: number) => {
    q.limit = n;
    return chain;
  };
  // The last-success query ends in `.maybeSingle()`; the failures query is awaited directly, so
  // the builder itself has to be thenable — the real one is, and the hook relies on it.
  chain.maybeSingle = () =>
    Promise.resolve(
      completedError ? { data: null, error: completedError } : { data: completedRow, error: null },
    );
  chain.then = (res: (v: unknown) => unknown) =>
    Promise.resolve(
      failureError
        ? { data: null, count: null, error: failureError }
        : { data: failureRows, count: failureCount ?? failureRows.length, error: null },
    ).then(res);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = (typeof fallback === "object" ? fallback : opts) ?? {};
      const text = typeof fallback === "string" ? fallback : key;
      return text.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(vars[name] ?? ""));
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

const { isabellaHealth, commonestOf, summariseError, STALE_MS, ERROR_WINDOW_MS } = await import(
  "@/lib/isabellaHealth"
);
const { useIsabellaHealth } = await import("@/hooks/useIsabellaHealth");
const { IsabellaHealthCard } = await import("@/components/admin/dashboard/IsabellaHealthCard");

const NOW = new Date("2026-09-09T16:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

/** What a zero-balance Anthropic account actually says, as `ai-run` stores it. */
const CREDIT_ERROR =
  "Anthropic API error: 400 Your credit balance is too low to access the Anthropic API. " +
  "Please go to Plans & Billing to upgrade or purchase credits.";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queries = [];
  completedRow = null;
  completedError = null;
  failureRows = [];
  failureCount = undefined;
  failureError = null;
});
afterEach(() => cleanup());

// ── 1. the verdict ──────────────────────────────────────────────────────────
describe("the verdict, as a pure function", () => {
  it("is GREEN with a success today and no failures in the hour", () => {
    const v = isabellaHealth({
      lastCompletedAt: ago(10 * 60_000),
      errorsLast60Min: 0,
      commonestError: null,
      now: NOW,
    });
    expect(v.level).toBe("green");
    expect(v.reason).toBe("healthy");
    expect(v.never).toBe(false);
  });

  it("is RED and `failing` when runs fail and none has succeeded within the window", () => {
    const v = isabellaHealth({
      lastCompletedAt: ago(ERROR_WINDOW_MS + 60_000),
      errorsLast60Min: 12,
      commonestError: CREDIT_ERROR,
      now: NOW,
    });
    expect(v.level).toBe("red");
    expect(v.reason).toBe("failing");
    expect(v.errorsLast60Min).toBe(12);
    expect(v.commonestError).toBe(CREDIT_ERROR);
  });

  it("is RED and `noRunEver` when nothing has ever completed", () => {
    const v = isabellaHealth({
      lastCompletedAt: null,
      errorsLast60Min: 0,
      commonestError: null,
      now: NOW,
    });
    expect(v.level).toBe("red");
    expect(v.reason).toBe("noRunEver");
    expect(v.never).toBe(true);
  });

  it("is RED and `stale` when the last success is over 24h old — a silent day is not a quiet one", () => {
    const v = isabellaHealth({
      lastCompletedAt: ago(STALE_MS + 60_000),
      errorsLast60Min: 0,
      commonestError: null,
      now: NOW,
    });
    expect(v.level).toBe("red");
    expect(v.reason).toBe("stale");
  });

  it("is AMBER and `intermittent` when runs are both failing and completing", () => {
    const v = isabellaHealth({
      lastCompletedAt: ago(5 * 60_000),
      errorsLast60Min: 3,
      commonestError: "Anthropic API error: 529 overloaded",
      now: NOW,
    });
    expect(v.level).toBe("amber");
    expect(v.reason).toBe("intermittent");
  });

  it("is AMBER and `notToday` when the last success was yesterday but inside 24h", () => {
    // 00:30 with a success at 23:50 last night: worth a glance, not an outage.
    const v = isabellaHealth({
      lastCompletedAt: "2026-09-08T23:50:00Z",
      errorsLast60Min: 0,
      commonestError: null,
      now: new Date("2026-09-09T00:30:00Z"),
    });
    expect(v.level).toBe("amber");
    expect(v.reason).toBe("notToday");
    expect(v.never).toBe(false);
  });

  it("`failing` outranks `stale` — the error text is the more actionable of the two", () => {
    const v = isabellaHealth({
      lastCompletedAt: ago(STALE_MS + 60_000),
      errorsLast60Min: 1,
      commonestError: CREDIT_ERROR,
      now: NOW,
    });
    expect(v.reason).toBe("failing");
  });

  it("counts a success exactly on the window edge as OUTSIDE it", () => {
    // The boundary is `< 60 min`, so a success 60 minutes ago does not clear a live failure.
    const v = isabellaHealth({
      lastCompletedAt: ago(ERROR_WINDOW_MS),
      errorsLast60Min: 1,
      commonestError: "boom",
      now: NOW,
    });
    expect(v.reason).toBe("failing");
  });

  it("normalises a count that is null, negative, fractional or unparseable to zero", () => {
    const base = { lastCompletedAt: ago(60_000), commonestError: "x", now: NOW };
    expect(isabellaHealth({ ...base, errorsLast60Min: null }).level).toBe("green");
    expect(isabellaHealth({ ...base, errorsLast60Min: -4 }).errorsLast60Min).toBe(0);
    expect(isabellaHealth({ ...base, errorsLast60Min: Number.NaN }).errorsLast60Min).toBe(0);
    expect(isabellaHealth({ ...base, errorsLast60Min: 2.7 }).errorsLast60Min).toBe(2);
  });

  it("drops the error string when there are no errors — it would be last hour's news", () => {
    const v = isabellaHealth({
      lastCompletedAt: ago(60_000),
      errorsLast60Min: 0,
      commonestError: CREDIT_ERROR,
      now: NOW,
    });
    expect(v.commonestError).toBeNull();
  });

  it("treats an unparseable timestamp as no success at all, never as the epoch", () => {
    const v = isabellaHealth({
      lastCompletedAt: "not a date",
      errorsLast60Min: 0,
      commonestError: null,
      now: NOW,
    });
    expect(v.never).toBe(true);
    expect(v.reason).toBe("noRunEver");
  });

  it("does not read settings, because it is not given any", () => {
    // The type has three data fields and a clock. There is nowhere for a switch to enter.
    expect(Object.keys(isabellaHealth({ lastCompletedAt: null, errorsLast60Min: 0, commonestError: null })))
      .toEqual(["level", "reason", "lastCompletedAt", "never", "errorsLast60Min", "commonestError"]);
  });
});

describe("the commonest error", () => {
  it("is the mode, not the newest", () => {
    expect(commonestOf(["overloaded", CREDIT_ERROR, CREDIT_ERROR])).toBe(CREDIT_ERROR);
  });

  it("breaks a tie towards the FIRST seen — the rows arrive newest-first", () => {
    expect(commonestOf(["newest", "older"])).toBe("newest");
  });

  it("ignores nulls, blanks and whitespace, and trims what it returns", () => {
    expect(commonestOf([null, undefined, "", "   ", "  real  "])).toBe("real");
  });

  it("is null when there is nothing to count", () => {
    expect(commonestOf([])).toBeNull();
    expect(commonestOf([null, ""])).toBeNull();
  });
});

describe("the error summary", () => {
  it("keeps the front of the message, where the instruction is", () => {
    const s = summariseError(CREDIT_ERROR)!;
    expect(s).toContain("credit balance is too low");
    expect(s.length).toBeLessThanOrEqual(110);
    expect(s.endsWith("…")).toBe(true);
  });

  it("leaves a short message alone and collapses its whitespace", () => {
    expect(summariseError("429  rate\n limit")).toBe("429 rate limit");
  });

  it("is null for null and for whitespace", () => {
    expect(summariseError(null)).toBeNull();
    expect(summariseError("   ")).toBeNull();
  });
});

// ── 2. the hook ─────────────────────────────────────────────────────────────
describe("useIsabellaHealth — what it asks the database", () => {
  it("asks ai_runs twice and isabella_settings never", async () => {
    completedRow = { created_at: new Date().toISOString() };
    const { result } = renderHealth();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queries.map((q) => q.table)).toEqual(["ai_runs", "ai_runs"]);
    expect(queries.some((q) => q.table === "isabella_settings")).toBe(false); // <-- load-bearing
  });

  it("reads the last COMPLETED run, newest first, one row", async () => {
    completedRow = { created_at: "2026-09-09T15:40:00Z" };
    const { result } = renderHealth();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const q = queries[0];
    expect(q.eqs).toEqual([["status", "completed"]]);
    expect(q.orders).toEqual([["created_at", { ascending: false }]]);
    expect(q.limit).toBe(1);
    expect(result.current.data?.lastCompletedAt?.toISOString()).toBe("2026-09-09T15:40:00.000Z");
  });

  it("counts FAILED runs inside a 60-minute window, with an exact count", async () => {
    const before = Date.now();
    failureRows = [{ error_message: CREDIT_ERROR }];
    const { result } = renderHealth();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const q = queries[1];
    expect(q.eqs).toEqual([["status", "failed"]]);
    expect(q.count).toBe("exact");
    expect(q.gtes).toHaveLength(1);
    const [col, since] = q.gtes[0];
    expect(col).toBe("created_at");
    // The window is measured, not asserted by string: 60 minutes back from around now.
    const delta = before - new Date(since as string).getTime();
    expect(delta).toBeGreaterThanOrEqual(ERROR_WINDOW_MS - 5_000);
    expect(delta).toBeLessThanOrEqual(ERROR_WINDOW_MS + 5_000);
    expect(result.current.data?.windowMinutes).toBe(60);
  });

  it("trusts the exact count over the page of rows it sampled", async () => {
    // 200 rows returned, 4000 failures. Counting the array would report calm.
    failureRows = Array.from({ length: 200 }, () => ({ error_message: CREDIT_ERROR }));
    failureCount = 4000;
    const { result } = renderHealth();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.errorsLast60Min).toBe(4000);
    expect(queries[1].limit).toBe(200);
  });

  it("falls back to the sampled rows when the count header is absent", async () => {
    failureRows = [{ error_message: "a" }, { error_message: "a" }];
    failureCount = null;
    const { result } = renderHealth();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.errorsLast60Min).toBe(2);
  });

  it("surfaces a failed read as an ERROR rather than as a healthy card", async () => {
    completedError = { message: "permission denied for table ai_runs" };
    const { result } = renderHealth();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("surfaces a failed failure-count read too", async () => {
    completedRow = { created_at: new Date().toISOString() };
    failureError = { message: "boom" };
    const { result } = renderHealth();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ── 3. the card ─────────────────────────────────────────────────────────────
describe("the card on the dashboard", () => {
  it("SEEDED CREDIT ERRORS TURN IT RED, WITH SETTINGS UNTOUCHED", async () => {
    // Lee's test, verbatim. Isabella last succeeded three hours ago; since then every run has
    // failed on a zero balance. Nothing in `isabella_settings` has changed — and nothing reads it.
    completedRow = { created_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString() };
    failureRows = Array.from({ length: 9 }, () => ({ error_message: CREDIT_ERROR }));

    render(<IsabellaHealthCard />, { wrapper });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Down"));
    expect(screen.getByText(/credit balance is too low/)).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText(/Runs are failing/)).toBeTruthy();
    expect(queries.some((q) => q.table === "isabella_settings")).toBe(false); // <-- load-bearing
    expect(document.body.textContent).not.toContain("ISABELLA ACTIVE");
  });

  it("shows Never when no run has ever completed", async () => {
    render(<IsabellaHealthCard />, { wrapper });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Down"));
    expect(screen.getByText("Never")).toBeTruthy();
    expect(screen.getByText(/No run has ever completed/)).toBeTruthy();
  });

  it("shows Healthy, with the timestamp, when runs are completing", async () => {
    completedRow = { created_at: new Date(Date.now() - 4 * 60_000).toISOString() };
    render(<IsabellaHealthCard />, { wrapper });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Healthy"));
    expect(screen.getByText(/minutes ago/)).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.queryByText(/credit balance/)).toBeNull();
  });

  it("says Degraded — not Healthy — when some runs fail and some complete", async () => {
    completedRow = { created_at: new Date(Date.now() - 2 * 60_000).toISOString() };
    failureRows = [{ error_message: "Anthropic API error: 529 overloaded" }];
    render(<IsabellaHealthCard />, { wrapper });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Degraded"));
    expect(screen.getByText(/529 overloaded/)).toBeTruthy();
  });

  it("says UNKNOWN, never Healthy, when it cannot read the runs at all", async () => {
    completedError = { message: "permission denied for table ai_runs" };
    render(<IsabellaHealthCard />, { wrapper });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Unknown"));
    expect(screen.getByText(/Could not read/)).toBeTruthy();
  });

  it("carries the level as a WORD, not only as a colour (WCAG AA)", async () => {
    // The four states an admin can land on, each named in text. A colour-only signal is
    // unreadable to a third of the people who use this dashboard on a bright terrace.
    completedRow = { created_at: new Date(Date.now() - 60_000).toISOString() };
    render(<IsabellaHealthCard />, { wrapper });
    const status = await waitFor(() => screen.getByRole("status"));
    expect(status.textContent?.trim()).toBe("Healthy");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("links to the operations page rather than claiming to manage anything itself", async () => {
    render(<IsabellaHealthCard />, { wrapper });
    const link = await waitFor(() => screen.getByText("Manage"));
    expect(link.getAttribute("href")).toBe("/admin/ai/operations");
  });
});

// ── 4. the source ───────────────────────────────────────────────────────────
describe("the banner is gone, and cannot come back by accident", () => {
  it("IsabellaStatusBanner.tsx no longer exists", () => {
    expect(existsSync(join(ROOT, "src/components/admin/dashboard/IsabellaStatusBanner.tsx"))).toBe(false);
  });

  it("nothing imports it, and the dashboard renders the health card instead", () => {
    const dash = code("src/pages/admin/AdminDashboard.tsx");
    expect(dash).not.toContain("IsabellaStatusBanner");
    expect(dash).toContain("<IsabellaHealthCard />");
  });

  it("neither the card, the hook nor the verdict reads isabella_settings", () => {
    // Comments stripped: all three files DISCUSS isabella_settings at length, which is the point.
    for (const f of [
      "src/components/admin/dashboard/IsabellaHealthCard.tsx",
      "src/hooks/useIsabellaHealth.ts",
      "src/lib/isabellaHealth.ts",
    ]) {
      expect(code(f), f).not.toContain("isabella_settings");
      expect(code(f), f).not.toContain("useIsabellaSettings");
    }
  });

  it("the card sits beside the sales strip, in one row under the header", () => {
    // Item 1 asks for it "beside item 2" and item 2 asks for the same thing from the other side,
    // so the row is asserted rather than left to whoever next edits the page.
    const dash = code("src/pages/admin/AdminDashboard.tsx");
    const row = dash.slice(dash.indexOf('<div className="grid gap-4 lg:grid-cols-3">'));
    const block = row.slice(0, row.indexOf("</div>", row.indexOf("<SalesCommandStrip />")));
    expect(block).toContain("<IsabellaHealthCard />");
    expect(block).toContain("<SalesCommandStrip />");
    // And above the stats grid, which is the rest of the dashboard.
    expect(dash.indexOf("<IsabellaHealthCard />")).toBeLessThan(dash.indexOf("adminDashboard.activeMembers"));
  });

  it("the dead banner keys went with it — isabella.banner is out of all three locales", () => {
    for (const l of ["en", "es", "nl"]) {
      const isabella = JSON.parse(read(`src/i18n/locales/${l}.json`)).isabella;
      expect(isabella.banner, l).toBeUndefined();
      expect(isabella.health.reason.failing, l).toBeTruthy();
    }
  });
});

/** Renders the hook alone, for the query-shape assertions. */
function renderHealth() {
  return renderHook(() => useIsabellaHealth(), { wrapper });
}
