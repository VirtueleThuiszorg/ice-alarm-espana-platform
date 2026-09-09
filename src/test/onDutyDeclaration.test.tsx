/**
 * On duty is a DECLARATION, and logging out is not going off duty (Lee's dashboard notes,
 * 9 Sep, item 7).
 *
 * Two things are proven here, and they are different in kind:
 *
 *   1. THE HEARTBEAT is an observation — `staff_presence` says whether a browser of theirs is
 *      alive right now. Every 30s while on duty, and stopped when off.
 *   2. THE DUTY FLAG is a declaration — `staff.is_on_call` is what `sos-escalation-runner`
 *      selects on (`status = 'active' AND is_on_call = true`) before it rings a MOBILE. A
 *      closed tab is not evidence about a mobile, so logging out no longer clears it. It warns
 *      instead, and the operator chooses.
 *
 * WHAT THE OLD BEHAVIOUR COST, both ways round: a supervisor on call from their phone was
 * silently taken off the escalation ladder by tidying up their browser, and an operator who
 * meant to hand over was never told they had not. Neither is visible in a unit test of the
 * toggle, which is why these tests drive the header itself.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act, fireEvent, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/** Every write the mocked client made, in order, so "what did it send" is answerable. */
type Write = { table: string; op: "update" | "upsert"; payload: unknown; eqs: [string, unknown][] };
let writes: Write[] = [];
let staffRow: Record<string, unknown> | null = null;
let updateError: unknown = null;

function builder(table: string) {
  const chain: Record<string, unknown> = {};
  let current: Write | null = null;
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => {
    current?.eqs.push([col, val]);
    return chain;
  };
  chain.maybeSingle = () => Promise.resolve({ data: staffRow, error: null });
  chain.update = (payload: unknown) => {
    current = { table, op: "update", payload, eqs: [] };
    writes.push(current);
    return chain;
  };
  chain.upsert = (payload: unknown) => {
    writes.push({ table, op: "upsert", payload, eqs: [] });
    return Promise.resolve({ data: null, error: null });
  };
  chain.then = (res: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, error: updateError }).then(res);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "en" },
  }),
}));

const signOut = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-1", email: "op@icealarm.es" }, signOut }),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

const logActivity = vi.fn();
vi.mock("@/hooks/useStaffActivityLog", () => ({
  useLogStaffActivity: () => ({ mutate: logActivity }),
}));

vi.mock("@/hooks/useStaffShifts", () => ({ useOnShiftNow: () => ({ data: [] }) }));
vi.mock("@/hooks/useAdminIdeas", () => ({ useAdminIdeas: () => ({ uncompleteCount: 0 }) }));
vi.mock("@/components/notifications/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/chat/StaffHeaderChatButton", () => ({ StaffHeaderChatButton: () => null }));
vi.mock("@/components/admin/IdeasNotepad", () => ({ IdeasNotepad: () => null }));
vi.mock("@/components/LanguageSelector", () => ({ LanguageSelector: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const { CallCentreHeader } = await import("@/components/layout/CallCentreHeader");
// NOT mocked: the header mounts the real heartbeat, so these tests run the same pairing
// production does. The two are told apart by TABLE — `staff` is the declaration, `staff_presence`
// the observation — which is the distinction the whole item is about.
const { useStaffHeartbeat, HEARTBEAT_INTERVAL_MS } = await import("@/hooks/useStaffHeartbeat");

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const STAFF = {
  id: "s-1",
  first_name: "Cara",
  last_name: "Ruiz",
  email: "op@icealarm.es",
  role: "call_centre",
};

/**
 * A click, wrapped so React flushes the state update it causes.
 *
 * `@testing-library/user-event` is not a dependency here and this does not warrant adding one:
 * every control under test is a plain button, and the thing being asserted is what the click
 * WRITES, not how a pointer behaves on the way to it.
 */
const click = async (el: Element) => {
  await act(async () => {
    fireEvent.click(el);
  });
};

/**
 * Render the header and WAIT FOR THE STAFF ROW to arrive.
 *
 * Not optional: `handleToggleDuty` and `handleSignOut` both return early while `staffInfo` is
 * undefined, so a click fired on the first paint does nothing at all — and a test that clicked
 * then asserted "no write happened" would pass for the wrong reason. Six of these tests failed
 * exactly that way before this helper existed.
 */
async function renderHeader(expected: "true" | "false") {
  const result = render(<CallCentreHeader />, { wrapper });
  // The operator's first name, which renders only once the row is in hand. Waiting on
  // `data-on-duty` alone is NOT enough: it reads "false" both before the row arrives and after
  // an off-duty row arrives, so the off-duty tests clicked into the void and passed or failed
  // for reasons unrelated to what they claim.
  await waitFor(() => expect(screen.getByText(STAFF.first_name)).toBeTruthy());
  expect(duty().getAttribute("data-on-duty")).toBe(expected);
  return result;
}

const staffWrites = () => writes.filter((w) => w.table === "staff");
const presenceWrites = () => writes.filter((w) => w.table === "staff_presence");
const duty = () => screen.getByTestId("duty-toggle");

beforeEach(() => {
  writes = [];
  updateError = null;
  staffRow = { ...STAFF, is_on_call: false };
  signOut.mockClear();
  navigate.mockClear();
  logActivity.mockClear();
});
afterEach(() => cleanup());

// ── the declaration ─────────────────────────────────────────────────────────
describe("the Start Shift toggle", () => {
  it("writes is_on_call = true against the operator's own staff row", async () => {
    await renderHeader("false");

    await click(duty());

    await waitFor(() => expect(staffWrites()).toHaveLength(1));
    expect(staffWrites()[0].payload).toEqual({ is_on_call: true });
    expect(staffWrites()[0].eqs).toEqual([["id", "s-1"]]);
  });

  it("writes is_on_call = false to end the shift", async () => {
    staffRow = { ...STAFF, is_on_call: true };
    await renderHeader("true");

    await click(duty());
    await waitFor(() => expect(staffWrites()[0].payload).toEqual({ is_on_call: false }));
  });

  it("records the change in the staff activity log", async () => {
    await renderHeader("false");
    await click(duty());
    await waitFor(() =>
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ staffId: "s-1", action: "shift.started" }),
      ),
    );
  });

  it("says which state it is in as text, not only as a colour", async () => {
    staffRow = { ...STAFF, is_on_call: true };
    await renderHeader("true");
    expect(duty()).toHaveTextContent("On Duty");
    // A live region, so the change is announced rather than merely re-rendered.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("You are on duty");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });
});

// ── logging out ─────────────────────────────────────────────────────────────
describe("logging out while on duty", () => {
  it("WARNS instead of signing straight out, and touches nothing yet", async () => {
    staffRow = { ...STAFF, is_on_call: true };
    await renderHeader("true");

    await click(screen.getByTitle("Log Out"));

    await waitFor(() => expect(screen.getByTestId("duty-logout-warning")).toBeTruthy());
    expect(signOut).not.toHaveBeenCalled(); // <-- load-bearing
    expect(staffWrites()).toEqual([]); // <-- load-bearing: no silent end of shift
  });

  it("names the consequence — the ladder keeps calling", async () => {
    staffRow = { ...STAFF, is_on_call: true };
    await renderHeader("true");
    await click(screen.getByTitle("Log Out"));

    const dialog = await waitFor(() => screen.getByTestId("duty-logout-warning"));
    expect(dialog.textContent).toMatch(/does not end your shift/i);
    expect(dialog.textContent).toMatch(/escalation ladder/i);
    expect(dialog.textContent).toMatch(/mobile/i);
  });

  it("\"End shift and log out\" ends the shift and then signs out", async () => {
    staffRow = { ...STAFF, is_on_call: true };
    await renderHeader("true");
    await click(screen.getByTitle("Log Out"));
    await click(await screen.findByText("End shift and log out"));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(staffWrites()[0].payload).toEqual({ is_on_call: false });
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "shift.ended", details: expect.objectContaining({ method: "sign_out" }) }),
    );
    expect(navigate).toHaveBeenCalledWith("/staff/login");
  });

  it("\"Stay on duty and log out\" LEAVES the declaration standing", async () => {
    // The point of the whole item: duty survives logout/login, because the ladder rings a
    // mobile and a browser tab says nothing about one.
    staffRow = { ...STAFF, is_on_call: true };
    await renderHeader("true");
    await click(screen.getByTitle("Log Out"));
    await click(await screen.findByText("Stay on duty and log out"));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(staffWrites()).toEqual([]); // <-- load-bearing
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "shift.kept_on_logout" }),
    );
  });

  it("does not warn an operator who is off duty", async () => {
    await renderHeader("false");

    await click(screen.getByTitle("Log Out"));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(screen.queryByTestId("duty-logout-warning")).toBeNull();
  });

  it("a failed end-of-shift write still lets the operator out", async () => {
    // Being unable to update a flag must never trap somebody in a session.
    staffRow = { ...STAFF, is_on_call: true };
    updateError = { message: "permission denied" };
    await renderHeader("true");
    await click(screen.getByTitle("Log Out"));
    await click(await screen.findByText("End shift and log out"));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});

// ── the heartbeat ───────────────────────────────────────────────────────────
describe("useStaffHeartbeat — presence, every 30 seconds", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  it("pings immediately when on duty, opening the session once", async () => {
    renderHook(() => useStaffHeartbeat("s-1", true));
    await flush();

    expect(presenceWrites()).toHaveLength(1);
    const first = presenceWrites()[0];
    expect(first.op).toBe("upsert");
    expect(first.payload).toMatchObject({ staff_id: "s-1", is_online: true });
    expect((first.payload as Record<string, unknown>).session_started_at).toBeTruthy();
  });

  it("pings again every 30s, and does NOT restamp session_started_at", async () => {
    // The defect this pins: `session_started_at` was sent with every ping, so it always equalled
    // `last_heartbeat_at` and "on duty since" read as zero seconds, forever.
    renderHook(() => useStaffHeartbeat("s-1", true));
    await flush();

    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    });
    await flush();
    expect(presenceWrites()).toHaveLength(2);
    const second = presenceWrites()[1];
    expect(second.op).toBe("update");
    expect(second.payload).toMatchObject({ is_online: true });
    expect(second.payload).not.toHaveProperty("session_started_at");

    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2);
    });
    await flush();
    expect(presenceWrites()).toHaveLength(4);
  });

  it("STOPS when the operator goes off duty, and marks them offline", async () => {
    const { rerender } = renderHook(({ on }: { on: boolean }) => useStaffHeartbeat("s-1", on), {
      initialProps: { on: true },
    });
    await flush();
    const during = presenceWrites().length;

    rerender({ on: false });
    await flush();
    const offline = presenceWrites().at(-1)!;
    expect(offline.op).toBe("update");
    expect(offline.payload).toEqual({ is_online: false });

    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
    });
    await flush();
    // Nothing beyond the single offline write — the interval is gone, not merely ignored.
    expect(presenceWrites()).toHaveLength(during + 1); // <-- load-bearing
  });

  it("writes nothing at all without a staff id", async () => {
    renderHook(() => useStaffHeartbeat(null, true));
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2);
    });
    await flush();
    expect(presenceWrites()).toEqual([]);
  });

  it("marks offline when the tab goes away", async () => {
    const { unmount } = renderHook(() => useStaffHeartbeat("s-1", true));
    await flush();
    unmount();
    await flush();
    expect(presenceWrites().at(-1)!.payload).toEqual({ is_online: false });
  });

  it("stamps a NEW session when the operator comes back on duty", async () => {
    const { rerender } = renderHook(({ on }: { on: boolean }) => useStaffHeartbeat("s-1", on), {
      initialProps: { on: true },
    });
    await flush();
    rerender({ on: false });
    await flush();
    rerender({ on: true });
    await flush();

    const upserts = presenceWrites().filter((w) => w.op === "upsert");
    expect(upserts).toHaveLength(2); // one per duty period, not one per ping
  });

  it("presence is never confused with duty — it writes only staff_presence", async () => {
    renderHook(() => useStaffHeartbeat("s-1", true));
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    });
    await flush();
    expect(staffWrites()).toEqual([]); // <-- load-bearing: it cannot end a shift
  });
});
