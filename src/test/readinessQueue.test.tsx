/**
 * The paid-but-not-ready queue — increment 4, the PREVENTIVE readiness control.
 *
 * The operator card (increment 2) and the escalation alert (increment 1) are both REACTIVE:
 * they make the missing-contacts state visible once an SOS is already firing. This screen exists
 * so that call never happens unprepared, which matters more once the join wizard stops
 * collecting contacts before payment. READINESS_MODEL.md §4-C, §6-C.
 *
 * Tested by rendering, plus source-level assertions for the two structural rules that no render
 * can prove: that readiness is read from the view rather than re-derived, and that nothing here
 * sends an automated chase.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

type Result = { data: unknown; error: unknown };

let readinessResult: Result;
let membersResult: Result;
const readinessFilters: Record<string, unknown> = {};

function builder(result: Result, isReadiness: boolean) {
  const chain: Record<string, unknown> = {};
  const p = Promise.resolve(result);
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => {
    if (isReadiness) readinessFilters[`eq:${col}`] = val;
    return chain;
  };
  chain.not = (col: string, op: string, val: unknown) => {
    if (isReadiness) readinessFilters[`not:${col}`] = `${op} ${val}`;
    return chain;
  };
  chain.in = () => chain;
  chain.order = (col: string, opts?: { ascending?: boolean }) => {
    if (isReadiness) readinessFilters["order"] = `${col}:${opts?.ascending}`;
    return chain;
  };
  chain.then = (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) =>
      table === "member_monitoring_readiness"
        ? builder(readinessResult, true)
        : builder(membersResult, false),
  },
}));

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      if (typeof fallback !== "string") return _k;
      const vars = (opts ?? {}) as Record<string, unknown>;
      return fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""));
    },
    i18n: { language: "en" },
  }),
}));

async function renderQueue() {
  const Page = (await import("@/pages/admin/MonitoringReadinessQueuePage")).default;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  );
}

const MEMBER = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  first_name: "Bruno",
  last_name: "Beta",
  phone: "+34600000002",
  email: "b@example.com",
  city: "Albox",
  preferred_language: "es",
  status: "active",
  ...over,
});

beforeEach(() => {
  navigate.mockReset();
  for (const k of Object.keys(readinessFilters)) delete readinessFilters[k];
  readinessResult = { data: [], error: null };
  membersResult = { data: [], error: null };
});
afterEach(() => cleanup());

describe("readiness queue — who is on it", () => {
  it("lists a paid member with zero contacts, with the wait in days", async () => {
    readinessResult = {
      data: [{ member_id: "m-b", monitoring_ready: false, emergency_contact_count: 0, paid_since: iso(9) }],
      error: null,
    };
    membersResult = { data: [MEMBER("m-b")], error: null };

    await renderQueue();
    await waitFor(() => expect(screen.queryAllByTestId("readiness-queue-row").length).toBe(1));
    expect(screen.getByText("Bruno Beta")).toBeTruthy();
    expect(screen.getByText("9d")).toBeTruthy();
  });

  it("queries the view for monitoring_ready = false, paid_since not null, OLDEST FIRST", async () => {
    await renderQueue();
    await waitFor(() => expect(readinessFilters["order"]).toBeDefined());
    // The ordering is the whole point of a worklist: the longest-exposed member is phoned first.
    expect(readinessFilters["order"]).toBe("paid_since:true");
    expect(readinessFilters["eq:monitoring_ready"]).toBe(false);
    expect(readinessFilters["not:paid_since"]).toBe("is null");
  });

  it("preserves the view's oldest-first order rather than re-sorting client-side", async () => {
    readinessResult = {
      data: [
        { member_id: "old", monitoring_ready: false, emergency_contact_count: 0, paid_since: iso(30) },
        { member_id: "new", monitoring_ready: false, emergency_contact_count: 0, paid_since: iso(1) },
      ],
      error: null,
    };
    membersResult = {
      data: [MEMBER("new", { first_name: "New", last_name: "Member" }), MEMBER("old", { first_name: "Old", last_name: "Member" })],
      error: null,
    };

    await renderQueue();
    await waitFor(() => expect(screen.queryAllByTestId("readiness-queue-row").length).toBe(2));
    const names = screen.getAllByTestId("readiness-queue-row").map((r) => r.textContent);
    expect(names[0]).toContain("Old Member");
    expect(names[1]).toContain("New Member");
  });

  it("flags a wait of a week or more, and NOT by colour alone", async () => {
    readinessResult = {
      data: [{ member_id: "m-b", monitoring_ready: false, emergency_contact_count: 0, paid_since: iso(21) }],
      error: null,
    };
    membersResult = { data: [MEMBER("m-b")], error: null };

    await renderQueue();
    await waitFor(() => expect(screen.queryByTestId("readiness-queue-longest")).not.toBeNull());
    // The number itself carries the meaning; the icon is a second non-colour channel.
    expect(screen.getByTestId("readiness-queue-longest").textContent).toContain("21");
  });

  it("makes the phone number a real link — the point of the screen is that somebody calls", async () => {
    readinessResult = {
      data: [{ member_id: "m-b", monitoring_ready: false, emergency_contact_count: 0, paid_since: iso(2) }],
      error: null,
    };
    membersResult = { data: [MEMBER("m-b")], error: null };

    await renderQueue();
    const link = await waitFor(() => screen.getByText("+34600000002"));
    expect(link.getAttribute("href")).toBe("tel:+34600000002");
  });

  it("says so loudly when a queued member has NO phone number at all", async () => {
    readinessResult = {
      data: [{ member_id: "m-b", monitoring_ready: false, emergency_contact_count: 0, paid_since: iso(2) }],
      error: null,
    };
    membersResult = { data: [MEMBER("m-b", { phone: null })], error: null };

    await renderQueue();
    await waitFor(() => expect(screen.queryByText(/NO PHONE ON FILE/i)).not.toBeNull());
  });
});

describe("readiness queue — who is NOT on it", () => {
  it("does NOT list a member the view reports as ready", async () => {
    // The view is the only arbiter. If it says ready, the queue must not second-guess it.
    readinessResult = { data: [], error: null };
    membersResult = { data: [MEMBER("m-a")], error: null };

    await renderQueue();
    await waitFor(() => expect(screen.queryByTestId("readiness-queue-empty")).not.toBeNull());
    expect(screen.queryAllByTestId("readiness-queue-row").length).toBe(0);
  });

  it("does NOT list a not-ready member whose member row is not active", async () => {
    // Readiness is a second axis: a suspended member is not this queue's problem.
    readinessResult = {
      data: [{ member_id: "m-x", monitoring_ready: false, emergency_contact_count: 0, paid_since: iso(5) }],
      error: null,
    };
    membersResult = { data: [], error: null }; // status filter excluded them server-side

    await renderQueue();
    await waitFor(() => expect(screen.queryByTestId("readiness-queue-empty")).not.toBeNull());
    expect(screen.queryAllByTestId("readiness-queue-row").length).toBe(0);
  });

  it("does NOT list anyone whose paid_since is null (never activated by the webhook)", async () => {
    await renderQueue();
    await waitFor(() => expect(readinessFilters["not:paid_since"]).toBe("is null"));
  });
});

describe("readiness queue — a failed read is never an empty queue", () => {
  it("renders a LOUD error, not the reassuring empty state, when the view read fails", async () => {
    // An empty queue means "nobody is waiting". Showing that when we merely could not read is
    // the same false all-clear emergency-contact-notify used to give (READINESS_MODEL.md §1-A).
    readinessResult = { data: null, error: { message: "permission denied" } };

    await renderQueue();
    const err = await waitFor(() => screen.getByTestId("readiness-queue-error"));
    expect(err.textContent).toMatch(/could not be loaded/i);
    expect(err.textContent).toMatch(/NOT the same as an empty queue/i);
    expect(screen.queryByTestId("readiness-queue-empty")).toBeNull();
    expect(err.getAttribute("role")).toBe("alert");
  });

  it("renders the error, not the empty state, when the members read fails", async () => {
    readinessResult = {
      data: [{ member_id: "m-b", monitoring_ready: false, emergency_contact_count: 0, paid_since: iso(3) }],
      error: null,
    };
    membersResult = { data: null, error: { message: "boom" } };

    await renderQueue();
    await waitFor(() => expect(screen.queryByTestId("readiness-queue-error")).not.toBeNull());
    expect(screen.queryByTestId("readiness-queue-empty")).toBeNull();
  });
});

describe("readiness queue — structural rules a render cannot prove", () => {
  const src = () => read("src/pages/admin/MonitoringReadinessQueuePage.tsx");

  it("reads readiness from the VIEW and does not re-derive it", async () => {
    const s = src();
    expect(s).toContain('from("member_monitoring_readiness")');
    // No second derivation: the queue must never count emergency_contacts itself. Per
    // ICE_OPERATOR_CARD_SPEC.md §5.1.4 the SOS card owns that derivation and the view owns this
    // one; the two must not swap roles.
    expect(s).not.toContain('from("emergency_contacts")');
  });

  it("sends NO automated chase of any kind", async () => {
    // Assert against CODE, not prose: the file's own comments name Resend when explaining why
    // there is no chase, and a check that trips on its own rationale proves nothing.
    const code = src()
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // Email is not deliverable and a silent chase failure looks like a member ignoring you.
    for (const forbidden of [
      "send-member-update-request",
      "sendEmail",
      "functions.invoke",
      "resend",
      "mailto:",
    ]) {
      expect(code.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // And the only outbound affordance in the row is a tel: link.
    expect(code).toContain("tel:");
  });

  it("states on screen that it does not chase, so nobody adds one without reading why", async () => {
    await renderQueue();
    await waitFor(() =>
      expect(screen.queryByText(/does not send anything automatically/i)).not.toBeNull(),
    );
  });

  it("is mounted behind requireStaff + requireAdmin, not merely linked from an admin page", async () => {
    const app = read("src/App.tsx");
    expect(app).toContain('path="members/readiness-queue"');
    // The route sits inside the /admin element that wraps ProtectedRoute requireStaff
    // requireAdmin; assert the guard exists rather than trusting the nesting by eye.
    expect(app).toMatch(/<ProtectedRoute requireStaff requireAdmin>/);
  });

  it("is reachable from the admin sidebar — an unlinked worklist is an unworked worklist", async () => {
    const sidebar = read("src/components/layout/AdminSidebar.tsx");
    expect(sidebar).toContain("/admin/members/readiness-queue");
  });
});
