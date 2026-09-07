/**
 * WP2 increment 5b — the two transitions nobody presses, and the one that makes a member ready.
 *
 * 5a put the ladder on `/admin/orders`. It could not be climbed from the bottom: nothing wrote
 * `allocated`, nothing wrote `programmed`, and `tested` — the half of monitoring readiness that
 * has never been true for any member — was reachable only from a row in a table of orders.
 *
 * THE ONE THAT MATTERS MOST HERE is not a transition at all. `member_monitoring_readiness`
 * reaches a pendant through `orders → order_items → devices`, and `DeviceTab.assignDevice` wrote
 * only `devices.member_id`. A pendant allocated by hand was invisible to readiness: that member
 * could never be recorded as protected however many test calls anybody made. Several assertions
 * below exist only to stop that being reintroduced quietly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Row = Record<string, unknown>;

let orderItemRows: Row[] = [];
let orderRow: Row | null = null;
let deviceRows: Row[] = [];
/** Every `.update()`, with the row it was aimed at — which row is chosen is the point of
 *  several assertions, and a mock that forgets it cannot prove any of them. */
let writes: { table: string; payload: Row; target: [string, unknown] | null }[] = [];
let failWrite: Record<string, string | null> = {};
let readError: Record<string, unknown> = {};

function chain(result: { data: unknown; error: unknown }, table: string) {
  const c: Record<string, unknown> = {};
  const p = Promise.resolve(result);
  c.select = () => c;
  c.eq = () => c;
  c.in = () => c;
  c.is = () => c;
  c.order = () => c;
  c.limit = () => c;
  c.maybeSingle = () => Promise.resolve(result);
  c.single = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
  c.update = (payload: Row) => {
    const write: { table: string; payload: Row; target: [string, unknown] | null } = {
      table,
      payload,
      target: null,
    };
    writes.push(write);
    const err = failWrite[table] ? { message: failWrite[table] } : null;
    return {
      eq: (col: string, val: unknown) => {
        write.target = [col, val];
        return Promise.resolve({ error: err });
      },
    };
  };
  return c;
}

function resultFor(table: string): { data: unknown; error: unknown } {
  if (readError[table]) return { data: null, error: readError[table] };
  if (table === "order_items") return { data: orderItemRows, error: null };
  if (table === "orders") return { data: orderRow, error: null };
  if (table === "devices") return { data: deviceRows, error: null };
  if (table === "staff") return { data: { first_name: "Marta", last_name: "Ruiz" }, error: null };
  return { data: null, error: null };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => chain(resultFor(table), table),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
  },
}));

const toasts: { level: string; text: string }[] = [];
vi.mock("sonner", () => ({
  toast: {
    success: (t: string) => toasts.push({ level: "success", text: String(t) }),
    error: (t: string) => toasts.push({ level: "error", text: String(t) }),
    warning: (t: string) => toasts.push({ level: "warning", text: String(t) }),
    info: (t: string) => toasts.push({ level: "info", text: String(t) }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ staffRole: "admin" }) }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _k: string,
      fallback?: string | Record<string, unknown>,
      opts?: Record<string, unknown>,
    ) => {
      if (typeof fallback !== "string") return _k;
      const vars = (opts ?? {}) as Record<string, unknown>;
      return fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""));
    },
    i18n: { language: "en" },
  }),
}));

const ORDER = (over: Row = {}): Row => ({
  id: "o1",
  order_number: "ICE-0001",
  member_id: "m1",
  fulfilment_state: "delivered",
  fulfilment_state_reason: null,
  status: "delivered",
  tested_at: null,
  tested_by: null,
  ...over,
});

const ITEM = (over: Row = {}): Row => ({
  id: "oi1",
  order_id: "o1",
  device_id: "d1",
  created_at: "2026-09-01T00:00:00Z",
  item_type: "pendant",
  orders: { id: "o1", member_id: "m1", fulfilment_state: "paid", order_number: "ICE-0001" },
  ...over,
});

async function renderCard(memberId = "m1") {
  const { PendantFulfilmentCard } = await import(
    "@/components/admin/member-detail/PendantFulfilmentCard"
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PendantFulfilmentCard memberId={memberId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  writes = [];
  failWrite = {};
  readError = {};
  toasts.length = 0;
  orderItemRows = [ITEM()];
  orderRow = ORDER();
  deviceRows = [{ id: "d1" }];
});
afterEach(() => cleanup());

describe("allocation links the order line — the readiness join depends on it", () => {
  it("writes order_items.device_id and moves the order to allocated", async () => {
    const { linkDeviceToPendantOrder } = await import("@/lib/allocatePendant");
    orderItemRows = [ITEM({ device_id: null })];

    const outcome = await linkDeviceToPendantOrder("m1", "d9");

    expect(outcome).toEqual({ kind: "moved", orderId: "o1", orderNumber: "ICE-0001" });
    expect(writes[0]).toEqual({
      table: "order_items",
      payload: { device_id: "d9" },
      target: ["id", "oi1"],
    });
    expect(writes[1]).toEqual({
      table: "orders",
      payload: { fulfilment_state: "allocated" },
      target: ["id", "o1"],
    });
  });

  it("fills the pendant line that has no device, not just the newest", async () => {
    // The newest line is the one that already has a device on it. Overwriting that would
    // detach a pendant somebody is already using.
    orderItemRows = [
      ITEM({ id: "newest", device_id: "d-existing", created_at: "2026-09-05T00:00:00Z" }),
      ITEM({ id: "empty", device_id: null, created_at: "2026-09-01T00:00:00Z" }),
    ];
    const { linkDeviceToPendantOrder } = await import("@/lib/allocatePendant");
    await linkDeviceToPendantOrder("m1", "d9");
    expect(writes[0].table).toBe("order_items");
    // The row it aimed at is the assertion. `newest` already carries a device.
    expect(writes[0].target).toEqual(["id", "empty"]);
  });

  it("reports a member with no pendant order rather than silently succeeding", async () => {
    // This is the readiness dead-end: no order line means no path from readiness to the
    // device, so the member can never be recorded as protected.
    orderItemRows = [];
    const { linkDeviceToPendantOrder } = await import("@/lib/allocatePendant");
    expect(await linkDeviceToPendantOrder("m1", "d9")).toEqual({ kind: "no_pendant_order" });
    expect(writes).toEqual([]);
  });

  it("does NOT move an order that is already past paid", async () => {
    // One step at a time is the trigger's rule. An order at `dispatched` whose device is being
    // replaced does not fall back to `allocated` as a side-effect — that is a correction, with
    // a role and a reason.
    orderItemRows = [
      ITEM({ orders: { id: "o1", member_id: "m1", fulfilment_state: "dispatched", order_number: "ICE-0001" } }),
    ];
    const { linkDeviceToPendantOrder } = await import("@/lib/allocatePendant");
    const outcome = await linkDeviceToPendantOrder("m1", "d9");
    expect(outcome).toEqual({ kind: "linked_no_transition", orderId: "o1", state: "dispatched" });
    expect(writes.map((w) => w.table)).toEqual(["order_items"]);
  });

  it("surfaces a failed link instead of swallowing it", async () => {
    failWrite = { order_items: "permission denied" };
    const { linkDeviceToPendantOrder } = await import("@/lib/allocatePendant");
    expect(await linkDeviceToPendantOrder("m1", "d9")).toEqual({
      kind: "failed",
      message: "permission denied",
    });
  });
});

describe("finishing the checklist IS the `programmed` transition", () => {
  it("moves allocated → programmed", async () => {
    orderItemRows = [
      ITEM({ orders: { id: "o1", fulfilment_state: "allocated", order_number: "ICE-0001" } }),
    ];
    const { markOrderProgrammed } = await import("@/lib/allocatePendant");
    expect(await markOrderProgrammed("d1")).toEqual({
      kind: "moved",
      orderId: "o1",
      orderNumber: "ICE-0001",
    });
    expect(writes).toEqual([
      { table: "orders", payload: { fulfilment_state: "programmed" }, target: ["id", "o1"] },
    ]);
  });

  it("refuses to skip from paid, rather than walking the order up two rungs", async () => {
    // `paid → programmed` is a skip the trigger refuses. Walking it up would assert an
    // allocation nothing here has checked.
    orderItemRows = [
      ITEM({ orders: { id: "o1", fulfilment_state: "paid", order_number: "ICE-0001" } }),
    ];
    const { markOrderProgrammed } = await import("@/lib/allocatePendant");
    expect(await markOrderProgrammed("d1")).toEqual({
      kind: "linked_no_transition",
      orderId: "o1",
      state: "paid",
    });
    expect(writes).toEqual([]);
  });

  it("is wired to the LAST step, not to a button", async () => {
    // The brief: "completing the checklist IS the transition, not a separate button." A button
    // would let staff assert a pendant is configured without configuring it.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/hooks/useDeviceProvisioning.ts", "utf8");
    expect(src).toContain("allCompleted ? await markOrderProgrammed(deviceId) : null");
    const checklist = readFileSync(
      "src/components/admin/devices/ProvisioningChecklist.tsx",
      "utf8",
    );
    expect(checklist).not.toContain("programmed");
  });

  it("nothing in src/ offers `programmed` or `allocated` as a staff button", async () => {
    const { STAFF_MOVABLE_STATES } = await import("@/lib/fulfilmentState");
    expect(STAFF_MOVABLE_STATES).not.toContain("programmed");
    expect(STAFF_MOVABLE_STATES).not.toContain("allocated");
  });
});

describe("the member record is where a test call is recorded", () => {
  it("offers 'Test call completed' on a delivered order", async () => {
    orderRow = ORDER({ fulfilment_state: "delivered" });
    await renderCard();
    expect(await screen.findByTestId("record-test-call")).toBeTruthy();
    expect(screen.getByText("Test call completed")).toBeTruthy();
  });

  it("the click writes only the new state — never tested_at or tested_by", async () => {
    // The whole content of `tested` is that a NAMED OPERATOR answered. A browser-supplied
    // actor is an assertion, not evidence, so the trigger resolves it from auth.uid().
    orderRow = ORDER({ fulfilment_state: "delivered" });
    await renderCard();
    fireEvent.click(await screen.findByTestId("record-test-call"));
    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes[0]).toEqual({
      table: "orders",
      payload: { fulfilment_state: "tested" },
      target: ["id", "o1"],
    });
  });

  it("does not offer it before the pendant is with the member", async () => {
    for (const state of ["paid", "allocated", "programmed", "dispatched"]) {
      orderRow = ORDER({ fulfilment_state: state });
      const view = await renderCard();
      expect(await screen.findByTestId("pendant-not-yet-testable")).toBeTruthy();
      expect(screen.queryByTestId("record-test-call")).toBeNull();
      view.unmount();
    }
  });

  it("shows the evidence once it is tested, and offers no second recording", async () => {
    orderRow = ORDER({
      fulfilment_state: "tested",
      tested_at: "2026-09-06T10:00:00Z",
      tested_by: "s1",
    });
    await renderCard();
    const evidence = await screen.findByTestId("pendant-tested-evidence");
    expect(evidence.textContent).toContain("Marta Ruiz");
    expect(screen.queryByTestId("record-test-call")).toBeNull();
  });

  it("shows how far along the order is, as rungs rather than a bar", async () => {
    // `cancelled` is not 0% of anything, so a progress bar would have to invent a number.
    orderRow = ORDER({ fulfilment_state: "dispatched" });
    await renderCard();
    await waitFor(() =>
      expect(screen.getByTestId("fulfilment-rung-dispatched").dataset.reached).toBe("yes"),
    );
    expect(screen.getByTestId("fulfilment-rung-paid").dataset.reached).toBe("yes");
    expect(screen.getByTestId("fulfilment-rung-tested").dataset.reached).toBe("no");
  });
});

describe("the three answers that are not a state", () => {
  it("a pendant on no order is called out, because that member can never become ready", async () => {
    orderItemRows = [];
    deviceRows = [{ id: "d1" }];
    await renderCard();
    expect(await screen.findByTestId("pendant-not-on-order")).toBeTruthy();
    expect(screen.queryByTestId("record-test-call")).toBeNull();
  });

  it("a failed read is loud, and is NOT rendered as 'not tested'", async () => {
    // A false all-clear is the failure mode this whole readiness model exists to avoid
    // (READINESS_MODEL.md §1-A).
    readError = { devices: { message: "connection reset" } };
    await renderCard();
    const err = await screen.findByTestId("pendant-fulfilment-error");
    expect(err.textContent).toContain("NOT the same as");
    expect(screen.queryByTestId("pendant-not-on-order")).toBeNull();
    expect(screen.queryByTestId("pendant-not-yet-testable")).toBeNull();
  });

  it("renders nothing at all for a member with no pendant", async () => {
    // DeviceTab already says this in full; a second card repeating it would push the thing
    // they came to read further down the page.
    deviceRows = [];
    await renderCard();
    await waitFor(() => expect(screen.queryByTestId("pendant-fulfilment-card")).toBeNull());
  });
});

describe("assignDevice reports what happened to the ORDER", () => {
  it("warns rather than succeeding silently when there is no pendant order", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/admin/member-detail/DeviceTab.tsx", "utf8");
    // Source-level, because the alternative is rendering the whole member device tab to prove
    // a toast. What must be true is that the outcome is REPORTED, not dropped.
    expect(src).toContain("linkDeviceToPendantOrder(memberId, selectedDeviceId)");
    expect(src).toContain("reportAllocationOutcome(outcome)");
    expect(src).toContain("no_pendant_order");
    expect(src).toContain("orderLinkFailed");
  });

  it("links the order line AFTER the device row is written", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/admin/member-detail/DeviceTab.tsx", "utf8");
    const deviceWrite = src.indexOf('status: "allocated",');
    const link = src.indexOf("linkDeviceToPendantOrder(memberId");
    // The assignment is what the staff member asked for. A failure in the bookkeeping that
    // follows must not undo it.
    expect(deviceWrite).toBeGreaterThan(-1);
    expect(link).toBeGreaterThan(deviceWrite);
  });
});
