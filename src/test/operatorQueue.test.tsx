/**
 * WP6 G8 — the operator's queue, and the one fact the reply screen never showed.
 *
 * Most of *"queue with Open/Waiting/Resolved, priority, assignee"* already existed on
 * `call-centre/MessagesPage`. What did not is the question an operator actually works from:
 * **which of these is waiting on us?** "Open" does not answer it — a thread stays open after we
 * reply — so a list of open threads mixes the ones with somebody waiting at the other end into
 * the ones already answered.
 *
 * The second half is the context panel. An operator answering "my pendant is beeping" from a
 * member whose pendant has never been tested is having a different conversation from one
 * answering the same words from a covered member, and nothing on this screen said which.
 * Its `unknown` case is the one that matters most: a failed read must never render as ready.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { stripComments } from "./helpers/stripComments";
import {
  compareQueue,
  operatorQueue,
  priorityRank,
  waitingOn,
  type QueueConversation,
} from "@/lib/operatorQueue";
import { readinessGapFromView } from "@/lib/readinessGap";

// ── the readiness double ────────────────────────────────────────────────────────────────────
let viewRow: Record<string, unknown> | null = null;
let viewFails = false;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve(
              viewFails ? { data: null, error: new Error("boom") } : { data: viewRow, error: null },
            ),
        }),
      }),
    }),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => (typeof fallback === "string" ? fallback : _k),
    i18n: { language: "en" },
  }),
}));

afterEach(cleanup);

const conv = (over: Partial<QueueConversation>): QueueConversation => ({
  id: "c1",
  status: "open",
  priority: "normal",
  last_message_at: "2026-09-07T10:00:00Z",
  last_message_sender: "member",
  ...over,
});

// ── 1. who is waiting ───────────────────────────────────────────────────────────────────────
describe("who a conversation is waiting on", () => {
  it("is US when the member spoke last", () => {
    expect(waitingOn(conv({ last_message_sender: "member" }))).toBe("us");
  });

  it("is THE MEMBER when we spoke last", () => {
    expect(waitingOn(conv({ last_message_sender: "staff" }))).toBe("member");
  });

  it("is US for a thread with no messages — which is what an Isabella-only conversation is", () => {
    // Since G7 those show in this list with an empty `messages` table behind them, and they are
    // exactly the ones an operator should pick up.
    expect(waitingOn(conv({ last_message_sender: null }))).toBe("us");
  });

  it("counts an INTERNAL NOTE as us speaking, not as a reply to the member", () => {
    expect(waitingOn(conv({ last_message_sender: "staff_internal" }))).toBe("member");
  });

  it("is NOBODY once an operator has settled it", () => {
    expect(waitingOn(conv({ status: "resolved" }))).toBe("nobody");
    expect(waitingOn(conv({ status: "closed" }))).toBe("nobody");
  });
});

// ── 2. the order ────────────────────────────────────────────────────────────────────────────
describe("the order the queue is worked in", () => {
  it("puts urgent before normal", () => {
    expect(priorityRank("urgent")).toBeLessThan(priorityRank("normal"));
    expect(priorityRank("normal")).toBeLessThan(priorityRank("low"));
  });

  it("treats an unset or unknown priority as normal — never urgent, never last", () => {
    expect(priorityRank(null)).toBe(priorityRank("normal"));
    expect(priorityRank("whatever")).toBe(priorityRank("normal"));
  });

  it("puts the LONGEST WAIT first, which is the opposite of the list's default", () => {
    const old = conv({ id: "old", last_message_at: "2026-09-07T08:00:00Z" });
    const recent = conv({ id: "recent", last_message_at: "2026-09-07T12:00:00Z" });
    expect([recent, old].sort(compareQueue).map((c) => c.id)).toEqual(["old", "recent"]);
  });

  it("puts priority above age — an urgent message from ten minutes ago outranks an old normal one", () => {
    const oldNormal = conv({ id: "old", last_message_at: "2026-09-01T08:00:00Z" });
    const newUrgent = conv({ id: "urgent", priority: "urgent", last_message_at: "2026-09-07T12:00:00Z" });
    expect([oldNormal, newUrgent].sort(compareQueue).map((c) => c.id)).toEqual(["urgent", "old"]);
  });

  it("drops everything that is not waiting on us", () => {
    const queue = operatorQueue([
      conv({ id: "answered", last_message_sender: "staff" }),
      conv({ id: "resolved", status: "resolved" }),
      conv({ id: "waiting" }),
    ]);
    expect(queue.map((c) => c.id)).toEqual(["waiting"]);
  });
});

// ── 3. the context panel ────────────────────────────────────────────────────────────────────
const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

async function renderPanel() {
  const { MemberContextPanel } = await import("@/components/messaging/MemberContextPanel");
  return render(<MemberContextPanel memberId="m1" />, { wrapper });
}

describe("what the operator is told about the member before they reply", () => {
  it("says a member is ready when the view says so", async () => {
    viewRow = { monitoring_ready: true, emergency_contact_count: 2, device_tested_at: "2026-09-01" };
    viewFails = false;
    await renderPanel();
    expect(await screen.findByText(/Monitoring ready/i)).toBeInTheDocument();
  });

  it("names the gap and the work when they are not", async () => {
    viewRow = { monitoring_ready: false, emergency_contact_count: 1, device_tested_at: null };
    viewFails = false;
    await renderPanel();
    expect(await screen.findByText(/Pendant not tested/i)).toBeInTheDocument();
    expect(screen.getByText(/have them press the pendant/i)).toBeInTheDocument();
  });

  it("A FAILED READ IS NOT READY — it says so, and does not go quiet", async () => {
    viewFails = true;
    await renderPanel();
    expect(await screen.findByText(/Could not be read/i)).toBeInTheDocument();
    expect(screen.queryByText(/Monitoring ready/i)).toBeNull();
  });

  it("a member with no row in the view is unknown, not ready", async () => {
    viewRow = null;
    viewFails = false;
    await renderPanel();
    await waitFor(() => expect(screen.getByText(/Could not be read/i)).toBeInTheDocument());
  });
});

// ── 4. the shared derivation ────────────────────────────────────────────────────────────────
describe("the view is the authority on WHETHER", () => {
  it("beats the two detail columns when they disagree", () => {
    // A ready member whose contact count has not caught up must not be shown a warning.
    expect(readinessGapFromView({
      monitoring_ready: true, emergency_contact_count: 0, device_tested_at: null,
    })).toBe("none");
  });

  it("falls through to the detail columns when the view says not ready", () => {
    expect(readinessGapFromView({
      monitoring_ready: false, emergency_contact_count: 0, device_tested_at: null,
    })).toBe("both");
  });

  it("a missing row is unknown", () => {
    expect(readinessGapFromView(null)).toBe("unknown");
  });
});

// ── 5. as wired ─────────────────────────────────────────────────────────────────────────────
describe("the operator screen, as shipped", () => {
  const src = stripComments(
    readFileSync(join(process.cwd(), "src/pages/call-centre/MessagesPage.tsx"), "utf8"),
  );

  it("shows the context panel on a member conversation", () => {
    expect(src).toContain("<MemberContextPanel");
  });

  it("offers the queue, and counts it from the same function that orders it", () => {
    expect(src).toContain("operatorQueue(");
    expect(src).toContain('waitingOn(c) === "us"');
    expect(src).toContain('value="queue"');
  });

  it("selects the sender of the last message, or `waitingOn` has nothing to read", () => {
    // The column LIST is not the contract — `created_at` joined it when the preview fix landed.
    // What must hold is that the last-message query asks for `sender_type` at all.
    expect(src).toMatch(/\.select\("content[^"]*sender_type[^"]*"\)/);
    expect(src).toContain("last_message_sender: lastMsg?.sender_type");
  });

  it("does not re-derive readiness from source tables", () => {
    // READINESS_MODEL.md §2: the view is the answer. A third opinion about whether a member is
    // monitored is the false all-clear this whole model exists to prevent.
    expect(src).not.toContain('from("emergency_contacts")');
    expect(src).not.toContain("device_tested_at");
  });
});
