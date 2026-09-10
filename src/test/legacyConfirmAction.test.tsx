// @vitest-environment jsdom
//
// "Confirm as legacy member" — the one activation on this platform that is not a payment.
//
// Two properties carry this file:
//
//   1. THE CONTROL IS ABSENT unless the member is `pending_review` + `billing_source = 'legacy'`.
//      `confirm_legacy_member()` refuses anything else, and a control that exists only to be
//      refused teaches staff that the screen is unreliable.
//   2. IT CALLS THE RPC, never an UPDATE. A plain `UPDATE members SET status = 'active'` is
//      refused by the guard trigger for an admin as much as for an operator — the RPC is the
//      only route in, and the reason it exists is that it records who decided.
//
// Permission is deliberately NOT asserted here, because it is deliberately not decided here:
// the card renders for anyone who can see the record and the database refuses whoever may not
// act. Who may act is proven in `scripts/rls/isolation.sql` against real PostgreSQL — 13
// assertions — because a browser cannot see RLS at all.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type RpcCall = { fn: string; args: Record<string, unknown> };
const rpcCalls: RpcCall[] = [];
const tableWrites: { table: string; op: string; payload: unknown }[] = [];
let rpcError: { message: string } | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(
        rpcError
          ? { data: null, error: rpcError }
          : { data: [{ member_id: args._member_id, status: "active", billing_source: "legacy" }], error: null },
      );
    },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const op of ["insert", "update", "upsert", "delete"]) {
        chain[op] = (payload: unknown) => {
          tableWrites.push({ table, op, payload });
          return chain;
        };
      }
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = () => Promise.resolve({ data: null, error: null });
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      chain.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f);
      return chain;
    },
  },
}));

const toasts: string[] = [];
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => toasts.push(`success:${m}`),
    error: (m: string) => toasts.push(`error:${m}`),
  },
}));

import { ConfirmLegacyMemberCard } from "@/components/admin/member-detail/ConfirmLegacyMemberCard";

function renderCard(status: string | null, billingSource: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConfirmLegacyMemberCard
        memberId="m-1"
        memberName="Arthur Pennington"
        status={status}
        billingSource={billingSource}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcCalls.length = 0;
  tableWrites.length = 0;
  toasts.length = 0;
  rpcError = null;
});
afterEach(cleanup);

describe("when the control is offered", () => {
  it("renders for a member the import left pending_review + legacy", () => {
    renderCard("pending_review", "legacy");
    expect(screen.getByTestId("confirm-legacy-open")).toBeTruthy();
  });

  it("is ABSENT for a member already confirmed", () => {
    renderCard("active", "legacy");
    expect(screen.queryByTestId("confirm-legacy-member-card")).toBeNull();
  });

  it("is ABSENT for a Stripe member", () => {
    // Confirming one would tell the platform to stop chasing a payment it is owed.
    renderCard("active", "stripe");
    expect(screen.queryByTestId("confirm-legacy-member-card")).toBeNull();
  });

  it("is ABSENT for an inactive member", () => {
    // Confirming one would be reactivating a cancelled client.
    renderCard("inactive", "legacy");
    expect(screen.queryByTestId("confirm-legacy-member-card")).toBeNull();
  });

  it("is ABSENT when pending_review but NOT legacy", () => {
    // Both columns, not either. pending_review alone says nothing about how they pay.
    renderCard("pending_review", "stripe");
    expect(screen.queryByTestId("confirm-legacy-member-card")).toBeNull();
  });

  it("says the member is not yet monitored, which is the fact that makes it urgent", () => {
    renderCard("pending_review", "legacy");
    expect(screen.getByTestId("confirm-legacy-member-card").textContent).toContain(
      "not counted as monitored",
    );
  });
});

describe("pressing it", () => {
  it("demands a reason before it will submit", async () => {
    renderCard("pending_review", "legacy");
    fireEvent.click(screen.getByTestId("confirm-legacy-open"));
    const submit = await waitFor(() => screen.getByTestId("confirm-legacy-submit"));
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("confirm-legacy-reason"), {
      target: { value: "pays by standing order" },
    });
    expect((screen.getByTestId("confirm-legacy-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  it("will not submit whitespace as a reason", async () => {
    renderCard("pending_review", "legacy");
    fireEvent.click(screen.getByTestId("confirm-legacy-open"));
    await waitFor(() => screen.getByTestId("confirm-legacy-reason"));
    fireEvent.change(screen.getByTestId("confirm-legacy-reason"), { target: { value: "   " } });
    expect((screen.getByTestId("confirm-legacy-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls the RPC with the member and the reason, and writes no UPDATE", async () => {
    renderCard("pending_review", "legacy");
    fireEvent.click(screen.getByTestId("confirm-legacy-open"));
    await waitFor(() => screen.getByTestId("confirm-legacy-reason"));
    fireEvent.change(screen.getByTestId("confirm-legacy-reason"), {
      target: { value: "pays Mary by standing order" },
    });
    fireEvent.click(screen.getByTestId("confirm-legacy-submit"));

    await waitFor(() => expect(rpcCalls.length).toBe(1));
    expect(rpcCalls[0].fn).toBe("confirm_legacy_member");
    expect(rpcCalls[0].args._member_id).toBe("m-1");
    expect(rpcCalls[0].args._reason).toBe("pays Mary by standing order");
    // The load-bearing negative: an UPDATE would be refused by the guard trigger, and would
    // record nobody's name even if it were not.
    expect(tableWrites.filter((w) => w.table === "members")).toEqual([]);
  });

  it("shows the DATABASE's refusal, not a generic failure", async () => {
    // "admin or supervisor only" is what tells an operator to fetch a supervisor. "Could not
    // confirm" tells them to press it again.
    rpcError = { message: "confirm_legacy_member: admin or supervisor only (role call_centre)" };
    renderCard("pending_review", "legacy");
    fireEvent.click(screen.getByTestId("confirm-legacy-open"));
    await waitFor(() => screen.getByTestId("confirm-legacy-reason"));
    fireEvent.change(screen.getByTestId("confirm-legacy-reason"), { target: { value: "cash" } });
    fireEvent.click(screen.getByTestId("confirm-legacy-submit"));

    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(toasts[0]).toContain("admin or supervisor only");
  });

  it("does not carry the last attempt's reason into the next dialog", async () => {
    // A sentence attached to the wrong event is worse in an audit log than no sentence at all.
    renderCard("pending_review", "legacy");
    fireEvent.click(screen.getByTestId("confirm-legacy-open"));
    await waitFor(() => screen.getByTestId("confirm-legacy-reason"));
    fireEvent.change(screen.getByTestId("confirm-legacy-reason"), { target: { value: "typed" } });
    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getByTestId("confirm-legacy-open"));
    const reopened = await waitFor(() => screen.getByTestId("confirm-legacy-reason"));
    expect((reopened as HTMLTextAreaElement).value).toBe("");
  });
});
