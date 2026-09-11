// @vitest-environment jsdom
//
// RECORDING WHEN SANTANDER TAKES A LEGACY MEMBER'S MONEY.
//
// Three properties carry this file:
//
//   1. THE CARD IS ABSENT for anyone Stripe bills. An empty field on a record is a question, and
//      "what day does Santander take this Stripe member's money" has no answer — asking it would
//      be asking staff to invent one.
//   2. THE DAY IS NOT CLAMPED. Typing 31 stores 31, and the next debit is computed from it. The
//      alternative — storing whatever day the next debit happens to land on — turns a 31st member
//      into a 28th member the first February that comes round.
//   3. A FAILED AUDIT ROW IS SAID OUT LOUD. The change is real and unrecorded, which is the one
//      state the audit row exists to prevent; `logActivity` in src/lib/auditLog.ts swallows its
//      errors on purpose and this path must not.
//
// Who may write it is NOT asserted here and is not decided here: the card renders for anyone who
// can see the record, and `guard_member_billing_self_write()` refuses whoever may not — proven
// against real PostgreSQL in scripts/rls/isolation.sql, which a browser cannot see.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Write = { table: string; op: string; payload: Record<string, unknown> };
const writes: Write[] = [];
let updateError: { message: string } | null = null;
let logError: { message: string } | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.update = (payload: Record<string, unknown>) => {
        writes.push({ table, op: "update", payload });
        return {
          eq: () => Promise.resolve({ error: updateError }),
        };
      };
      chain.insert = (payload: Record<string, unknown>) => {
        writes.push({ table, op: "insert", payload });
        return Promise.resolve({ error: table === "activity_logs" ? logError : null });
      };
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      return chain;
    },
  },
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { id: "staff-lee", role: "admin" } }),
}));

const toasts: string[] = [];
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => toasts.push(`success:${m}`),
    error: (m: string) => toasts.push(`error:${m}`),
    warning: (m: string) => toasts.push(`warning:${m}`),
  },
}));

import { LegacyBillingDateCard } from "@/components/admin/member-detail/LegacyBillingDateCard";

function renderCard(opts: {
  billingSource?: string | null;
  billingDay?: number | null;
  nextRenewal?: string | null;
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LegacyBillingDateCard
        memberId="m-1"
        billingSource={opts.billingSource ?? "legacy"}
        billingDay={opts.billingDay ?? null}
        nextRenewal={opts.nextRenewal ?? null}
      />
    </QueryClientProvider>,
  );
}

/** Put the card into edit mode — everything on a member record is locked until somebody says so. */
function startEditing() {
  const card = screen.getByTestId("legacy-billing-date-card");
  const button = Array.from(card.querySelectorAll("button")).find((b) =>
    /edit|add/i.test(b.textContent ?? ""),
  );
  if (!button) throw new Error("no Edit/Add button on the card");
  fireEvent.click(button);
}

function save() {
  const card = screen.getByTestId("legacy-billing-date-card");
  const button = Array.from(card.querySelectorAll("button")).find((b) =>
    /save/i.test(b.textContent ?? ""),
  );
  if (!button) throw new Error("no Save button on the card");
  fireEvent.click(button);
}

beforeEach(() => {
  writes.length = 0;
  toasts.length = 0;
  updateError = null;
  logError = null;
});
afterEach(cleanup);

describe("who gets asked for a Santander date", () => {
  it("renders for a legacy member", () => {
    renderCard({ billingSource: "legacy" });
    expect(screen.getByTestId("legacy-billing-date-card")).toBeTruthy();
  });

  it("is ABSENT for a Stripe member", () => {
    renderCard({ billingSource: "stripe" });
    expect(screen.queryByTestId("legacy-billing-date-card")).toBeNull();
  });

  it("is ABSENT when nothing bills them", () => {
    renderCard({ billingSource: "none" });
    expect(screen.queryByTestId("legacy-billing-date-card")).toBeNull();
  });

  it("says a date is needed when there is none, rather than showing a dash", () => {
    renderCard({ billingSource: "legacy", billingDay: null });
    expect(screen.getByTestId("legacy-billing-date-card").textContent).toContain(
      "Needs a billing date",
    );
  });
});

describe("writing the date", () => {
  it("fills in the next debit from the day, so one number is typed", async () => {
    renderCard({});
    startEditing();
    fireEvent.change(screen.getByTestId("legacy-billing-day"), { target: { value: "15" } });
    const date = screen.getByTestId("legacy-next-renewal") as HTMLInputElement;
    expect(date.value).toMatch(/^\d{4}-\d{2}-15$/);
  });

  it("keeps 31 as 31 — the day is never clamped in storage", async () => {
    renderCard({});
    startEditing();
    fireEvent.change(screen.getByTestId("legacy-billing-day"), { target: { value: "31" } });
    save();
    await waitFor(() => expect(writes.some((w) => w.table === "members")).toBe(true));
    const update = writes.find((w) => w.table === "members");
    expect(update?.payload.legacy_billing_day).toBe(31);
    // Whatever month it is, the stored date is a real date — never 31 February.
    const stored = String(update?.payload.legacy_next_renewal);
    expect(Number.isNaN(new Date(stored).getTime())).toBe(false);
  });

  it("records the change in activity_logs with the old value and the new", async () => {
    renderCard({ billingDay: 4, nextRenewal: "2026-10-04" });
    startEditing();
    fireEvent.change(screen.getByTestId("legacy-billing-day"), { target: { value: "9" } });
    save();
    await waitFor(() => expect(writes.some((w) => w.table === "activity_logs")).toBe(true));
    const log = writes.find((w) => w.table === "activity_logs");
    expect(log?.payload.entity_type).toBe("member");
    expect(log?.payload.entity_id).toBe("m-1");
    expect(log?.payload.staff_id).toBe("staff-lee");
    expect((log?.payload.old_values as Record<string, unknown>).legacy_billing_day).toBe(4);
    expect((log?.payload.new_values as Record<string, unknown>).legacy_billing_day).toBe(9);
  });

  it("clearing the day clears the date too — a date with no day is a date nobody can check", async () => {
    renderCard({ billingDay: 15, nextRenewal: "2026-09-15" });
    startEditing();
    fireEvent.change(screen.getByTestId("legacy-billing-day"), { target: { value: "" } });
    save();
    await waitFor(() => expect(writes.some((w) => w.table === "members")).toBe(true));
    const update = writes.find((w) => w.table === "members");
    expect(update?.payload.legacy_billing_day).toBeNull();
    expect(update?.payload.legacy_next_renewal).toBeNull();
  });

  it("refuses a day that is not a day of the month, and writes NOTHING", async () => {
    renderCard({});
    startEditing();
    fireEvent.change(screen.getByTestId("legacy-billing-day"), { target: { value: "45" } });
    save();
    await waitFor(() => expect(toasts.some((t) => t.startsWith("error:"))).toBe(true));
    expect(writes.length).toBe(0);
  });

  it("says what the database said when the write is refused", async () => {
    updateError = { message: "new row violates check constraint" };
    renderCard({});
    startEditing();
    fireEvent.change(screen.getByTestId("legacy-billing-day"), { target: { value: "12" } });
    save();
    await waitFor(() =>
      expect(toasts.some((t) => t.includes("violates check constraint"))).toBe(true),
    );
    // The audit row is not written when the change did not happen.
    expect(writes.some((w) => w.table === "activity_logs")).toBe(false);
  });

  // The state the audit row exists to prevent: the change is real and nobody can find out who
  // made it. `logActivity` swallows this by design; this path must not.
  it("says so OUT LOUD when the change was saved but could not be logged", async () => {
    logError = { message: "activity_logs insert refused" };
    renderCard({});
    startEditing();
    fireEvent.change(screen.getByTestId("legacy-billing-day"), { target: { value: "12" } });
    save();
    await waitFor(() => expect(toasts.some((t) => t.startsWith("warning:"))).toBe(true));
    expect(toasts.find((t) => t.startsWith("warning:"))).toContain("by hand");
    expect(writes.some((w) => w.table === "members")).toBe(true);
  });
});
