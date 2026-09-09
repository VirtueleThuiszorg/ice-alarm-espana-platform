/**
 * The dashboard header pills, and the Isabella health source behind one of them.
 *
 * Lee's correction (9 Sep): the two status boxes were CARDS in a row of their own between the
 * header and the stat tiles. They are pills on the header line now, immediately left of Add
 * Member, with the detail behind a popover.
 *
 * And the substantive half — Lee: *"the pill says 'No run has ever completed' while Isabella
 * answers on the public site. Confirm the card reads the table ai-run actually writes on
 * success."*
 *
 * IT DID READ THE RIGHT TABLE. `ai_runs` is the only table in the schema that separates "she
 * ran and it worked" from "she ran and it broke": `conversation_messages` gets the assistant
 * turn saved by the client whether the answer was real or the fallback string, and `ai_events`
 * is the inbox for events that may never run at all. The defect was the WRITER — all three
 * `ai_runs` writes in `ai-run/index.ts` are in the agent/event branch, and the chat branch
 * returns before reaching any of them, in both streaming and non-streaming mode. So the table
 * recorded scheduled agent runs and nothing else, while chat — the surface the public touches —
 * recorded nothing.
 *
 * The database half of that fix is proven in `scripts/rls/wiring.sql` §3 against real
 * PostgreSQL. This file pins the client half: that the writer exists on the chat path, and that
 * a chat-shaped completed run turns the pill green.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Comments stripped — these files discuss the tables at length, which is the point. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");

// ── fakes ───────────────────────────────────────────────────────────────────
let completedRow: { created_at: string } | null = null;
let failureRows: Array<{ error_message: string | null }> = [];
let salesRow: Record<string, number> | null = null;
let salesError: { message: string } | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.gte = self;
    q.order = self;
    q.limit = self;
    q.maybeSingle = async () =>
      table === "ai_runs" ? { data: completedRow, error: null } : { data: null, error: null };
    q.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: failureRows, count: failureRows.length, error: null });
    return q;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      rpc: async () => ({ data: salesRow, error: salesError }),
    },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = (typeof fallback === "object" ? fallback : opts) ?? {};
      const text = typeof fallback === "string" ? fallback : key;
      return text.replace(/\{\{(\w+)\}\}/g, (_m, n) => String(vars[n] ?? ""));
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

const { IsabellaHealthPill } = await import("@/components/admin/dashboard/IsabellaHealthPill");
const { SalesTodayPill } = await import("@/components/admin/dashboard/SalesTodayPill");

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
});

beforeEach(() => {
  completedRow = null;
  failureRows = [];
  salesError = null;
  salesRow = {
    paid_sales_today: 0,
    paid_amount_today: 0,
    paid_sales_60min: 0,
    paid_amount_60min: 0,
    new_subscriptions: 0,
    partner_signups: 0,
    ai_hot_items: 0,
    followups_pending: 0,
  };
});
afterEach(() => cleanup());

// ── 1. the health source: the defect Lee reported ───────────────────────────
describe("the Isabella pill reads a table the CHAT path writes", () => {
  const fn = code("supabase/functions/ai-run/index.ts");
  /**
   * Everything before the AGENT/EVENT branch's own `ai_runs` insert, which that branch
   * introduces with "Create the run record".
   *
   * Not sliced at the first `.from("ai_runs")`: `recordChatRun` is defined above `serve()`, so
   * that anchor lands in the helper and leaves this slice holding nothing but the imports —
   * which is what four of these assertions caught the first time they ran.
   */
  const chatBranch = fn.slice(0, fn.indexOf("// Create the run record"));

  it("the chat branch records a run — it previously reached none of the three writes", () => {
    // The reported symptom: "No run has ever completed" while Isabella answered on the site.
    expect(chatBranch).toContain("recordChatRun(");
  });

  it("records BOTH streaming and non-streaming, because the widget streams by default", () => {
    // `useAIChat` calls `streamIsabellaChat` first and only falls back to the plain invoke when
    // the stream is unavailable — so a writer on the non-streaming path alone would still
    // leave the live site unrecorded.
    expect(code("src/hooks/useAIChat.ts")).toContain("streamIsabellaChat");
    expect(chatBranch).toContain("streamed: true");
    expect(chatBranch).toContain("streamed: false");
  });

  it("records failures as well as successes — a pill that only sees wins cannot go red", () => {
    expect(chatBranch).toContain('status: "completed"');
    expect(chatBranch).toContain('status: "failed"');
    // Four points: stream success, stream failure, non-stream success, non-stream failure.
    expect((chatBranch.match(/recordChatRun\(/g) ?? []).length).toBe(5); // 1 definition + 4 calls
  });

  it("keeps the provider's error text, which is what named the zero balance on 8 Sep", () => {
    expect(chatBranch).toContain("error_message");
    expect(chatBranch).toMatch(/errorMessage/);
  });

  it("writes no message content into the execution log", () => {
    // A chat turn carries whatever a member typed. An execution record is not the place for it.
    expect(chatBranch).toContain('input_context: { source: "chat_widget"');
    expect(chatBranch).not.toMatch(/input_context:[^}]*currentMessage/);
  });

  it("cannot break the answer it is recording", () => {
    // The record is best-effort by construction: the helper swallows its own failure. An
    // answer already streamed to a member must not be undone by a logging error.
    expect(fn).toMatch(/async function recordChatRun[\s\S]{0,900}catch \(e\)/);
  });

  it("the hook still reads ai_runs, not conversation_messages or ai_events", () => {
    // Those two cannot distinguish a real answer from the fallback string, which is the whole
    // question the pill exists to answer.
    const hook = code("src/hooks/useIsabellaHealth.ts");
    expect(hook).toContain('from("ai_runs")');
    expect(hook).not.toContain("conversation_messages");
    expect(hook).not.toContain('from("ai_events")');
    expect(hook).not.toContain("isabella_settings");
  });
});

// ── 2. the pill goes green off a chat run ───────────────────────────────────
describe("a completed chat run turns the pill green", () => {
  it("was RED with no runs, and is GREEN once one chat turn has completed", async () => {
    // Before: exactly what Lee saw.
    render(<IsabellaHealthPill />, { wrapper });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Down"));
    cleanup();

    // After: one completed run, of the shape recordChatRun() inserts.
    completedRow = { created_at: new Date(Date.now() - 2 * 60_000).toISOString() };
    render(<IsabellaHealthPill />, { wrapper });
    const status = await waitFor(() => screen.getByRole("status"));
    expect(status).toHaveTextContent("Healthy");
    // Green is carried by a word, not only by the dot.
    expect(status.textContent).toContain("Healthy");
  });

  it("goes back to Degraded when that run is joined by failures", async () => {
    completedRow = { created_at: new Date(Date.now() - 2 * 60_000).toISOString() };
    failureRows = [{ error_message: "Anthropic API error: 529 overloaded" }];
    render(<IsabellaHealthPill />, { wrapper });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Degraded"));
  });
});

// ── 3. the pills are pills ──────────────────────────────────────────────────
describe("both pills are header-height, and hide their detail", () => {
  it("the Isabella pill is 36px and round, with the detail behind it", async () => {
    completedRow = { created_at: new Date(Date.now() - 60_000).toISOString() };
    render(<IsabellaHealthPill />, { wrapper });
    const trigger = await waitFor(() => screen.getByRole("button"));
    expect(trigger.className).toContain("h-9");
    expect(trigger.className).toContain("rounded-full");
    expect(screen.queryByText("Manage")).toBeNull();
  });

  it("the Sales pill shows today's total and count, and hides the rest", async () => {
    salesRow = { ...salesRow!, paid_sales_today: 3, paid_amount_today: 480 };
    render(<SalesTodayPill />, { wrapper });
    const trigger = await waitFor(() => screen.getByRole("button"));
    expect(trigger.className).toContain("h-9");
    expect(trigger.textContent).toContain("€480");
    expect(trigger.textContent).toContain("3 orders");
    // Detail is not on the header line.
    expect(screen.queryByText("Last 60 min")).toBeNull();

    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByText("Last 60 min")).toBeTruthy());
    expect(screen.getByText("Paid today")).toBeTruthy();
    expect(screen.getByText("Follow-ups pending")).toBeTruthy();
  });

  it("a quiet morning reads €0 · 0 orders, which is true", async () => {
    render(<SalesTodayPill />, { wrapper });
    const trigger = await waitFor(() => screen.getByRole("button"));
    expect(trigger.textContent).toContain("€0");
    expect(trigger.textContent).toContain("0 orders");
  });

  it("A FAILED READ IS NOT A QUIET ZERO — the error says so instead", async () => {
    // €0 is a common true statement, so it must not double as what broken looks like.
    salesError = { message: "permission denied for function get_sales_command_stats" };
    salesRow = null;
    render(<SalesTodayPill />, { wrapper });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Sales stats unavailable"),
    );
    expect(screen.queryByText(/0 orders/)).toBeNull();
  });
});

// ── 4. the layout Lee asked for ─────────────────────────────────────────────
describe("the header holds both pills, and the old row is gone", () => {
  const dash = code("src/pages/admin/AdminDashboard.tsx");

  it("title → Isabella → Sales → Add Member, all in one flex block", () => {
    const header = dash.slice(
      dash.indexOf('<div className="flex flex-wrap items-center justify-between gap-3">'),
    );
    const block = header.slice(0, header.indexOf("adminDashboard.statsError"));
    const at = (n: string) => block.indexOf(n);
    expect(at("adminDashboard.title")).toBeGreaterThan(-1);
    expect(at("adminDashboard.title")).toBeLessThan(at("<IsabellaHealthPill />"));
    expect(at("<IsabellaHealthPill />")).toBeLessThan(at("<SalesTodayPill />"));
    expect(at("<SalesTodayPill />")).toBeLessThan(at("adminDashboard.addMember"));
  });

  it("wraps under the title on narrow screens instead of forming a row above the tiles", () => {
    expect(dash).toContain("flex-wrap");
  });

  it("the row the cards occupied is gone, so the stat tiles moved up", () => {
    expect(dash).not.toContain('<div className="grid gap-4 lg:grid-cols-3">');
    expect(dash).not.toContain("SalesCommandStrip");
    expect(dash).not.toContain("IsabellaHealthCard");
    // The tiles are now the first thing under the header (bar the error banner).
    const tiles = dash.indexOf("adminDashboard.activeMembers");
    expect(dash.indexOf("<SalesTodayPill />")).toBeLessThan(tiles);
  });

  it("the sales RPC is called once, from one hook, not copied into the pill", () => {
    // The strip and the pill would otherwise hold two copies of the same query and the same
    // zero-defaults, and the pair would drift the first time a field was added.
    expect(code("src/hooks/useSalesCommandStats.ts")).toContain("get_sales_command_stats");
    expect(code("src/components/admin/dashboard/SalesTodayPill.tsx")).not.toContain(
      "get_sales_command_stats",
    );
  });
});
