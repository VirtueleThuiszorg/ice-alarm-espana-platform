/**
 * `usePendantOrderForMember` — the two answers it gives, and why they must stay separate.
 *
 * `order` is "the order this member's DEVICE sits on", reached `devices → order_items`. That is
 * the path `member_monitoring_readiness` takes, and `linkedToOrder: false` with a null `order` is
 * the readiness dead-end the hook exists to expose: a pendant assigned by hand, on no order,
 * which can never become monitoring-ready no matter how many test calls anybody makes.
 *
 * `memberPendantOrder` is "this member's pendant order, device or not", which is what their own
 * pendant page needs in the window between paying and the device arriving.
 *
 * THESE TESTS EXIST BECAUSE THE MUTATIONS SURVIVED. `myPendantPage.test.tsx` mocks this hook
 * wholesale, so two deliberate breakages went unnoticed: dropping the `item_type = 'pendant'`
 * filter (which would let a registration-fee line be picked as "the pendant order"), and folding
 * `memberPendantOrder` into `order` (which would quietly change what `PendantFulfilmentCard`
 * reads). A mocked dependency is an untested one.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/** Every `.eq()` a query made, per table, so the filters can be asserted. */
type Call = { table: string; eqs: [string, unknown][]; select: string };
let calls: Call[] = [];

let deviceRows: { id: string }[] = [];
/** `order_items` rows keyed by which query shape asked for them. */
let itemsByDevice: { order_id: string; created_at: string }[] = [];
let itemsByMember: { order_id: string; created_at: string }[] = [];
let orderRow: Record<string, unknown> | null = null;

function builder(table: string) {
  const call: Call = { table, eqs: [], select: "" };
  calls.push(call);

  const chain: Record<string, unknown> = {};
  chain.select = (cols: string) => {
    call.select = cols;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    call.eqs.push([col, val]);
    return chain;
  };
  chain.in = () => chain;
  const resolve = () => {
    if (table === "devices") return { data: deviceRows, error: null };
    if (table === "orders") return { data: orderRow, error: null };
    if (table === "staff") return { data: null, error: null };
    // order_items: which lookup is this? The member-side one filters on item_type.
    const isMemberSide = call.eqs.some(([c]) => c === "item_type");
    return { data: isMemberSide ? itemsByMember : itemsByDevice, error: null };
  };
  chain.order = () => Promise.resolve(resolve());
  chain.maybeSingle = () => Promise.resolve(resolve());
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(resolve()).then(res);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

import { usePendantOrderForMember } from "@/hooks/usePendantOrder";

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const ORDER = {
  id: "o1",
  order_number: "ICE-1",
  member_id: "m1",
  fulfilment_state: "dispatched",
  fulfilment_state_reason: null,
  status: "shipped",
  tested_at: null,
  tested_by: null,
};

beforeEach(() => {
  calls = [];
  deviceRows = [];
  itemsByDevice = [];
  itemsByMember = [];
  orderRow = ORDER;
});
afterEach(() => cleanup());

const itemQueries = () => calls.filter((c) => c.table === "order_items");

describe("the member-side pendant order", () => {
  it("filters on item_type = 'pendant' — a registration fee is not a thing you can post a device on", async () => {
    itemsByMember = [{ order_id: "o1", created_at: "2026-09-01" }];
    const { result } = renderHook(() => usePendantOrderForMember("m1"), { wrapper });
    await waitFor(() => expect(result.current.memberPendantOrder).not.toBeNull());

    const memberSide = itemQueries().filter((c) => c.eqs.some(([col]) => col === "item_type"));
    expect(memberSide.length).toBeGreaterThan(0);
    for (const q of memberSide) {
      expect(q.eqs).toContainEqual(["item_type", "pendant"]);
      // And scoped to this member, or it would read somebody else's order.
      expect(q.eqs).toContainEqual(["orders.member_id", "m1"]);
    }
  });

  it("finds the order even when the member has NO device yet", async () => {
    deviceRows = [];
    itemsByMember = [{ order_id: "o1", created_at: "2026-09-01" }];
    const { result } = renderHook(() => usePendantOrderForMember("m1"), { wrapper });
    await waitFor(() => expect(result.current.memberPendantOrder?.fulfilmentState).toBe("dispatched"));
    expect(result.current.hasDevice).toBe(false);
  });

  it("is null when the member has no pendant line at all", async () => {
    itemsByMember = [];
    const { result } = renderHook(() => usePendantOrderForMember("m1"), { wrapper });
    await waitFor(() => expect(result.current.memberPendantOrderLoading).toBe(false));
    expect(result.current.memberPendantOrder).toBeNull();
  });
});

describe("the device-side answer is left exactly as it was", () => {
  it("`order` stays NULL for a pendant on no order, even though memberPendantOrder is set", async () => {
    /*
      THE CONTRACT `PendantFulfilmentCard` READS. Folding the member-side lookup into `order`
      would make this non-null and the card would stop saying "this pendant is on no order" —
      which is the readiness dead-end, the thing the hook was written to surface.
    */
    deviceRows = [{ id: "d1" }];
    itemsByDevice = []; // the device is on no order line
    itemsByMember = [{ order_id: "o1", created_at: "2026-09-01" }];

    const { result } = renderHook(() => usePendantOrderForMember("m1"), { wrapper });
    await waitFor(() => expect(result.current.memberPendantOrder).not.toBeNull());

    expect(result.current.order).toBeNull();
    expect(result.current.linkedToOrder).toBe(false);
    expect(result.current.hasDevice).toBe(true);
  });

  it("and `order` is populated, with linkedToOrder true, when the device IS on a line", async () => {
    deviceRows = [{ id: "d1" }];
    itemsByDevice = [{ order_id: "o1", created_at: "2026-09-01" }];
    const { result } = renderHook(() => usePendantOrderForMember("m1"), { wrapper });
    await waitFor(() => expect(result.current.order).not.toBeNull());
    expect(result.current.linkedToOrder).toBe(true);
  });

  it("the device-side lookup does NOT filter on item_type — that path is keyed on the device", async () => {
    // Adding the filter there would hide a pendant sitting on a non-pendant line, which is
    // exactly the malformed data the readiness gap is about.
    deviceRows = [{ id: "d1" }];
    itemsByDevice = [{ order_id: "o1", created_at: "2026-09-01" }];
    const { result } = renderHook(() => usePendantOrderForMember("m1"), { wrapper });
    await waitFor(() => expect(result.current.order).not.toBeNull());

    const deviceSide = itemQueries().filter((c) => !c.eqs.some(([col]) => col === "item_type"));
    expect(deviceSide.length).toBeGreaterThan(0);
  });
});
