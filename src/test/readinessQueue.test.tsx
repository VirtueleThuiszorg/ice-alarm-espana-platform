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
/**
 * Item 8's second axis, with its OWN result.
 *
 * It had to be its own: the mock used to route every table that was not the readiness view to
 * `membersResult`, so the `subscriptions` query added by item 8 was answered with member rows.
 * Those carry no `member_id`, so the merge dropped them and every existing test passed BY LUCK —
 * a harness that cannot tell the two queries apart cannot prove anything about either.
 */
let pastDueResult: Result;
const readinessFilters: Record<string, unknown> = {};
const pastDueFilters: Record<string, unknown> = {};

function builder(result: Result, record?: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  const p = Promise.resolve(result);
  chain.select = (cols?: string) => {
    // Recorded, because "does this screen read the SECOND condition" is otherwise unprovable:
    // a row that happens to carry the column proves nothing about the query that fetched it.
    if (record && typeof cols === "string") record["select"] = cols;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    if (record) record[`eq:${col}`] = val;
    return chain;
  };
  chain.not = (col: string, op: string, val: unknown) => {
    if (record) record[`not:${col}`] = `${op} ${val}`;
    return chain;
  };
  chain.in = () => chain;
  chain.order = (col: string, opts?: { ascending?: boolean }) => {
    if (record) record["order"] = `${col}:${opts?.ascending}`;
    return chain;
  };
  chain.then = (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "member_monitoring_readiness") return builder(readinessResult, readinessFilters);
      if (table === "subscriptions") return builder(pastDueResult, pastDueFilters);
      return builder(membersResult);
    },
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
  for (const k of Object.keys(pastDueFilters)) delete pastDueFilters[k];
  readinessResult = { data: [], error: null };
  membersResult = { data: [], error: null };
  pastDueResult = { data: [], error: null };
});
afterEach(() => cleanup());

describe("readiness queue — D4: two row kinds, both worked by phone", () => {
  const ROW = (id: string, over: Record<string, unknown> = {}) => ({
    member_id: id,
    monitoring_ready: false,
    emergency_contact_count: 0,
    device_tested_at: null,
    paid_since: iso(3),
    ...over,
  });

  it("reads the second condition from the view, rather than re-deriving it", async () => {
    await renderQueue();
    await waitFor(() => expect(readinessFilters["select"]).toBeDefined());
    expect(readinessFilters["select"]).toContain("device_tested_at");
    expect(readinessFilters["select"]).toContain("emergency_contact_count");
  });

  it("labels a member with nobody to call", async () => {
    readinessResult = {
      data: [ROW("m-b", { device_tested_at: iso(1) })],
      error: null,
    };
    membersResult = { data: [MEMBER("m-b")], error: null };
    await renderQueue();
    expect(await screen.findByTestId("readiness-gap-contacts")).toBeTruthy();
    expect(screen.getByTestId("readiness-queue-row").dataset.gap).toBe("contacts");
  });

  it("labels a member whose pendant has never been tested", async () => {
    readinessResult = {
      data: [ROW("m-b", { emergency_contact_count: 2 })],
      error: null,
    };
    membersResult = { data: [MEMBER("m-b")], error: null };
    await renderQueue();
    expect(await screen.findByTestId("readiness-gap-pendant")).toBeTruthy();
    // The work, not just the state: naming only "not ready" makes an operator open the record
    // to find out what for.
    expect(screen.getByText(/press the pendant/i)).toBeTruthy();
  });

  it("labels a member missing both, and says one call does both", async () => {
    readinessResult = { data: [ROW("m-b")], error: null };
    membersResult = { data: [MEMBER("m-b")], error: null };
    await renderQueue();
    expect(await screen.findByTestId("readiness-gap-both")).toBeTruthy();
    expect(screen.getByText(/one call does both/i)).toBeTruthy();
  });

  it("counts the kinds separately, because they are different amounts of work", async () => {
    readinessResult = {
      data: [
        ROW("m-1", { device_tested_at: iso(1) }),
        ROW("m-2", { emergency_contact_count: 2 }),
        ROW("m-3", { emergency_contact_count: 2 }),
        ROW("m-4"),
      ],
      error: null,
    };
    membersResult = {
      data: ["m-1", "m-2", "m-3", "m-4"].map((id) => MEMBER(id)),
      error: null,
    };
    await renderQueue();
    await waitFor(() => expect(screen.queryAllByTestId("readiness-queue-row").length).toBe(4));
    expect(screen.getByTestId("readiness-count-contacts").textContent).toContain("1");
    expect(screen.getByTestId("readiness-count-pendant").textContent).toContain("2");
    expect(screen.getByTestId("readiness-count-both").textContent).toContain("1");
  });

  it("does not show a count for a kind nobody is in", async () => {
    readinessResult = { data: [ROW("m-b", { device_tested_at: iso(1) })], error: null };
    membersResult = { data: [MEMBER("m-b")], error: null };
    await renderQueue();
    await screen.findByTestId("readiness-count-contacts");
    expect(screen.queryByTestId("readiness-count-pendant")).toBeNull();
    expect(screen.queryByTestId("readiness-count-both")).toBeNull();
  });

  it("marks a row it could not read as such, rather than guessing a kind", async () => {
    // A row with no counts is "we do not know". Calling it "no contacts" would be inventing a
    // fact from a missing projection, and this queue is worked by phone off exactly that fact.
    readinessResult = {
      data: [{ member_id: "m-b", monitoring_ready: false, paid_since: iso(3) }],
      error: null,
    };
    membersResult = { data: [MEMBER("m-b")], error: null };
    await renderQueue();
    expect(await screen.findByTestId("readiness-gap-unknown")).toBeTruthy();
    expect(screen.getByText(/not a state/i)).toBeTruthy();
  });

  it("no longer claims the queue is only about contacts, or only about readiness", async () => {
    /*
      TWICE NOW. The title first said "Paid — no emergency contacts" and the empty state said
      every paid member had one — true of one condition out of two once D4 made readiness two.
      Item 8 then added a THIRD reason to be on this list, a failed renewal payment, which is
      not a readiness condition at all — so "not monitoring-ready" became too narrow in its
      turn.

      Asserted as what the copy must COVER rather than as its exact words, so the next reason
      added here fails this test for the right reason: an empty state that does not mention it.
    */
    await renderQueue();
    await screen.findByTestId("readiness-queue-empty");

    expect(screen.getByText(/needs a call/i)).toBeTruthy();

    const empty = screen.getByTestId("readiness-queue-empty").textContent ?? "";
    expect(empty, "the empty state must account for contacts").toMatch(/somebody to call/i);
    expect(empty, "…for the pendant test").toMatch(/has been tested/i);
    expect(empty, "…and for the payment").toMatch(/payment/i);
  });
});

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

/**
 * ITEM 8 — the second axis. A renewal payment that failed.
 *
 * P4 decided it: Stripe retries, monitoring CONTINUES, and staff are told, because somebody has
 * to ring the member before the retries run out or a life-safety subscription lapses quietly.
 * Before this the only surface a `past_due` reached was a status badge on a page somebody would
 * have to already be looking at (WIRING_REGISTER absence row A2).
 */
describe("attention queue — a failed payment is a reason to be on it", () => {
  const READY_ROW = (id: string, over: Record<string, unknown> = {}) => ({
    member_id: id,
    monitoring_ready: false,
    emergency_contact_count: 0,
    device_tested_at: null,
    paid_since: iso(3),
    ...over,
  });

  it("asks for past_due subscriptions, oldest failed renewal first", async () => {
    await renderQueue();
    await waitFor(() => expect(pastDueFilters["select"]).toBeDefined());
    expect(pastDueFilters["eq:status"]).toBe("past_due");
    expect(pastDueFilters["select"]).toContain("renewal_date");
    expect(pastDueFilters["order"]).toBe("renewal_date:true");
  });

  it("lists a member whose payment failed even though they are monitoring-ready", async () => {
    // The whole point: readiness and payment are different axes. This member has contacts and a
    // tested pendant, and would appear on no readiness queue at all.
    pastDueResult = { data: [{ member_id: "m-p", renewal_date: iso(5) }], error: null };
    membersResult = { data: [MEMBER("m-p")], error: null };

    await renderQueue();
    await waitFor(() => expect(screen.queryAllByTestId("readiness-queue-row").length).toBe(1));
    expect(screen.getByTestId("readiness-gap-payment")).toBeTruthy();
    expect(screen.getByTestId("readiness-count-payment").textContent).toContain("1");
    // Not labelled with a readiness gap it does not have.
    expect(screen.queryByTestId("readiness-gap-contacts")).toBeNull();
    expect(screen.queryByTestId("readiness-gap-both")).toBeNull();
  });

  it("says what the call is for, and that the service stays on", async () => {
    // P4. An operator who suspends a member for an expired card has turned off a life-safety
    // service over a billing problem.
    pastDueResult = { data: [{ member_id: "m-p", renewal_date: iso(2) }], error: null };
    membersResult = { data: [MEMBER("m-p")], error: null };

    await renderQueue();
    await screen.findByTestId("readiness-gap-payment");
    expect(screen.getByText(/new card/i)).toBeTruthy();
    expect(screen.getByText(/do not suspend/i)).toBeTruthy();
  });

  it("shows a member on BOTH axes once, with both reasons", async () => {
    // One phone call. Two rows would mean phoning them twice, and the queue's own header says
    // both kinds are worked by phone for exactly that reason.
    readinessResult = { data: [READY_ROW("m-x")], error: null };
    pastDueResult = { data: [{ member_id: "m-x", renewal_date: iso(30) }], error: null };
    membersResult = { data: [MEMBER("m-x")], error: null };

    await renderQueue();
    await waitFor(() => expect(screen.queryAllByTestId("readiness-queue-row").length).toBe(1));
    expect(screen.getByTestId("readiness-gap-both")).toBeTruthy();
    expect(screen.getByTestId("readiness-gap-payment")).toBeTruthy();
  });

  it("keeps the LONGER wait when a member is on both, so they do not drop down the list", async () => {
    readinessResult = { data: [READY_ROW("m-x", { paid_since: iso(2) })], error: null };
    pastDueResult = { data: [{ member_id: "m-x", renewal_date: iso(40) }], error: null };
    membersResult = { data: [MEMBER("m-x")], error: null };

    await renderQueue();
    await screen.findByTestId("readiness-queue-row");
    // 40 days, not 2: adding the payment axis must not make a long-waiting member look newer.
    expect(screen.getByTestId("readiness-queue-longest").textContent).toContain("40");
  });

  it("does NOT list a past_due subscription whose member is not active", async () => {
    // A suspended member is not this queue's problem, on either axis.
    pastDueResult = { data: [{ member_id: "m-gone", renewal_date: iso(5) }], error: null };
    membersResult = { data: [], error: null };

    await renderQueue();
    expect(await screen.findByTestId("readiness-queue-empty")).toBeTruthy();
  });

  it("a failed past_due read is an ERROR, not a quietly shorter queue", async () => {
    // READINESS_MODEL §1-A: a half-read queue rendered as a whole one is a false all-clear —
    // and this is the worse half, because a missing payment row is a member about to lose cover.
    pastDueResult = { data: null, error: { message: "subscriptions unreadable" } };
    readinessResult = { data: [], error: null };

    await renderQueue();
    expect(await screen.findByTestId("readiness-queue-error")).toBeTruthy();
    expect(screen.queryByTestId("readiness-queue-empty")).toBeNull();
  });
});
