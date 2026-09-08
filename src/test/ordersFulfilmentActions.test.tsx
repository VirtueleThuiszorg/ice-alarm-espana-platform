/**
 * WP2 increment 5 — the staff screen that moves a fulfilment state.
 *
 * `fulfilmentStateContract.test.ts` proves the module agrees with the trigger. This proves the
 * SCREEN uses the module: that the actions offered are the ones a human really performs, that
 * the write contains what the trigger wants and nothing it stamps itself, and that a correction
 * cannot be sent without a reason the trigger will accept.
 *
 * Why that last one matters enough to render for: the trigger refuses a correction whose reason
 * is blank OR unchanged from the one already on the row. Both refusals arrive as a
 * `RAISE EXCEPTION` written for a developer. A dialog that can send either is a dialog that
 * teaches operators the screen is unreliable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Row = Record<string, unknown>;

let orderRows: Row[] = [];
/** Every `.update()` payload, in the order it was sent, with the table it went to. */
let writes: { table: string; payload: Row }[] = [];
let updateError: unknown = null;

/** Every filter the orders query applied, so "does the condition filter both columns" is
 *  provable rather than assumed. */
let queryFilters: Record<string, unknown> = {};

function selectChain(result: { data: unknown; count?: number; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const p = Promise.resolve(result);
  chain.select = () => chain;
  chain.or = () => chain;
  chain.eq = (col: string, val: unknown) => {
    queryFilters[`eq:${col}`] = val;
    return chain;
  };
  chain.neq = (col: string, val: unknown) => {
    queryFilters[`neq:${col}`] = val;
    return chain;
  };
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.single = () => Promise.resolve({ data: null, error: null });
  chain.order = () => chain;
  chain.range = () => chain;
  chain.in = () => chain;
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
  return chain;
}

function tableApi(table: string) {
  const api = selectChain(
    table === "orders"
      ? { data: orderRows, count: orderRows.length, error: null }
      : { data: null, error: null },
  ) as Record<string, unknown>;
  api.update = (payload: Row) => {
    writes.push({ table, payload });
    return {
      eq: () => Promise.resolve({ error: updateError }),
    };
  };
  api.insert = () => ({
    select: () => ({ single: () => Promise.resolve({ data: { id: "c1" }, error: null }) }),
  });
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => tableApi(table),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
  },
}));

let staffRole: string | null = "call_centre";
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ staffRole }),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

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
  created_at: new Date().toISOString(),
  total_amount: 199,
  status: "delivered",
  fulfilment_state: "delivered",
  fulfilment_state_reason: null,
  tracking_number: null,
  member: { id: "m1", first_name: "Ana", last_name: "Alfa", email: "a@example.com" },
  ...over,
});

async function renderOrders() {
  const Page = (await import("@/pages/admin/OrdersPage")).default;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  );
}

/** Open the row's action menu. */
async function openMenu() {
  const triggers = await screen.findAllByRole("button");
  const menu = triggers[triggers.length - 1];
  fireEvent.pointerDown(
    menu,
    new PointerEvent("pointerdown", { bubbles: true, ctrlKey: false, button: 0 }),
  );
  return menu;
}

beforeEach(() => {
  queryFilters = {};
  writes = [];
  updateError = null;
  staffRole = "call_centre";
  orderRows = [ORDER()];
  toastError.mockReset();
});
afterEach(() => cleanup());

describe("the fulfilment state is on the screen at all", () => {
  it("renders the fulfilment state as its own column, beside orders.status", () => {
    // Two columns because FULFILMENT_MODEL.md §3 keeps orders.status for the commission path.
    // A single column would mean one of the two truths is invisible.
    orderRows = [ORDER({ status: "delivered", fulfilment_state: "tested" })];
    return renderOrders().then(async () => {
      expect(await screen.findByText("Tested")).toBeTruthy();
      expect(screen.getByText("Fulfilment")).toBeTruthy();
    });
  });

  it("flags an order whose two columns are out of step", async () => {
    // "Mark as shipped" moves orders.status and leaves fulfilment behind. That drift is how an
    // order ends up invisible to whichever filter somebody used, so it is shown, not hidden.
    orderRows = [ORDER({ status: "pending", fulfilment_state: "dispatched" })];
    await renderOrders();
    expect(await screen.findByTestId("fulfilment-drift")).toBeTruthy();
  });

  it("does NOT flag `tested`, which orders.status cannot express", async () => {
    // `tested` maps to no order_status. Calling that drift would put a permanent warning on
    // every fully-fulfilled order — the readiness state we most want staff to reach.
    orderRows = [ORDER({ status: "delivered", fulfilment_state: "tested" })];
    await renderOrders();
    await screen.findByText("Tested");
    expect(screen.queryByTestId("fulfilment-drift")).toBeNull();
  });
});

describe("`awaiting_stock` on the screen it used to be invisible from — increment 6", () => {
  it("shows the condition beside the state, and the order still reads Paid", async () => {
    // §2: the order should still read `paid`. The reason it is stuck sits next to that rather
    // than replacing it.
    orderRows = [ORDER({ fulfilment_state: "paid", status: "awaiting_stock" })];
    await renderOrders();
    expect(await screen.findByTestId("fulfilment-condition-awaiting_stock")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
  });

  it("distinguishes 'needs a pendant' from 'awaiting stock'", async () => {
    orderRows = [ORDER({ fulfilment_state: "paid", status: "confirmed" })];
    await renderOrders();
    expect(await screen.findByTestId("fulfilment-condition-awaiting_allocation")).toBeTruthy();
    expect(screen.queryByTestId("fulfilment-condition-awaiting_stock")).toBeNull();
  });

  it("shows no condition once a device is allocated", async () => {
    orderRows = [ORDER({ fulfilment_state: "allocated", status: "processing" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    expect(screen.queryByTestId("fulfilment-condition-awaiting_stock")).toBeNull();
    expect(screen.queryByTestId("fulfilment-condition-awaiting_allocation")).toBeNull();
  });

  it("offers the REAL action — allocate on the member record — not a status nudge", async () => {
    /*
      The old menu offered `awaiting_stock → processing`, and orderStatus.ts said in its own
      comment that this "does not allocate a device". So the button told a staff member the
      order had moved on while the member still had no pendant reserved.
    */
    orderRows = [ORDER({ fulfilment_state: "paid", status: "awaiting_stock" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    expect(await screen.findByTestId("fulfilment-allocate-awaiting_stock")).toBeTruthy();
    // And the status nudge is gone from this row.
    expect(screen.queryByText(/mark as processing/i)).toBeNull();
  });

  it("offers it to an ORDINARY operator, not just a supervisor", async () => {
    // Without the condition in the guard, a call_centre operator saw no action at all on
    // exactly the order that needs one — the §1-B failure, one layer up.
    staffRole = "call_centre";
    orderRows = [ORDER({ fulfilment_state: "paid", status: "awaiting_stock" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    expect(await screen.findByTestId("fulfilment-allocate-awaiting_stock")).toBeTruthy();
    expect(screen.queryByTestId("fulfilment-correct")).toBeNull();
  });

  it("filters on BOTH columns, in the query", async () => {
    // A condition that only narrows the current twenty rows is a filter that lies about how
    // many orders are in that state.
    await renderOrders();
    await screen.findByText("ICE-0001");
    const trigger = screen.getByLabelText("Fulfilment");
    fireEvent.pointerDown(
      trigger,
      new window.PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Awaiting stock" }));
    await waitFor(() => expect(queryFilters["eq:fulfilment_state"]).toBe("paid"));
    expect(queryFilters["eq:status"]).toBe("awaiting_stock");
  });

  it("the 'needs a pendant' filter EXCLUDES the awaiting-stock rows", async () => {
    await renderOrders();
    await screen.findByText("ICE-0001");
    const trigger = screen.getByLabelText("Fulfilment");
    fireEvent.pointerDown(
      trigger,
      new window.PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Needs a pendant" }));
    await waitFor(() => expect(queryFilters["neq:status"]).toBe("awaiting_stock"));
    expect(queryFilters["eq:fulfilment_state"]).toBe("paid");
  });
});

describe("only the moves a human really performs are offered", () => {
  it("offers 'Test call completed' on a delivered order", async () => {
    orderRows = [ORDER({ fulfilment_state: "delivered" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    expect(await screen.findByTestId("fulfilment-advance-tested")).toBeTruthy();
    expect(screen.getByText("Test call completed")).toBeTruthy();
  });

  it("offers 'Collected for delivery' on a programmed order", async () => {
    orderRows = [ORDER({ fulfilment_state: "programmed", status: "processing" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    expect(await screen.findByTestId("fulfilment-advance-dispatched")).toBeTruthy();
  });

  it("offers NO fulfilment action on a paid order, because allocation is not a button", async () => {
    // `paid → allocated` is the act of assigning a device. A button here would claim a pendant
    // is reserved for this member when none is.
    orderRows = [ORDER({ fulfilment_state: "paid", status: "pending" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    // The menu is open once its first item is in the DOM. `t()` in this file returns
    // the key when a string has no inline fallback, and this one lives in the locale files.
    await screen.findByText("admin.orders.viewDetails");
    expect(screen.queryByTestId("fulfilment-advance-allocated")).toBeNull();
  });

  it("offers NO fulfilment action on an allocated order, because provisioning is not a button", async () => {
    // The brief: "completing the checklist IS the transition, not a separate button."
    orderRows = [ORDER({ fulfilment_state: "allocated", status: "processing" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    // The menu is open once its first item is in the DOM. `t()` in this file returns
    // the key when a string has no inline fallback, and this one lives in the locale files.
    await screen.findByText("admin.orders.viewDetails");
    expect(screen.queryByTestId("fulfilment-advance-programmed")).toBeNull();
  });

  it("offers nothing beyond `tested`", async () => {
    orderRows = [ORDER({ fulfilment_state: "tested" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    // The menu is open once its first item is in the DOM. `t()` in this file returns
    // the key when a string has no inline fallback, and this one lives in the locale files.
    await screen.findByText("admin.orders.viewDetails");
    for (const s of ["paid", "allocated", "programmed", "dispatched", "delivered", "tested"]) {
      expect(screen.queryByTestId(`fulfilment-advance-${s}`)).toBeNull();
    }
  });
});

describe("the write contains what the trigger wants, and nothing it stamps", () => {
  it("sends only the new state on an ordinary forward move", async () => {
    orderRows = [ORDER({ fulfilment_state: "delivered", status: "delivered" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    fireEvent.click(await screen.findByTestId("fulfilment-advance-tested"));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes[0].table).toBe("orders");
    expect(writes[0].payload).toEqual({ fulfilment_state: "tested" });
  });

  it("never sends tested_at or tested_by from the browser", async () => {
    // The whole content of `tested` is that a NAMED OPERATOR answered. A browser-supplied actor
    // is an assertion, not evidence — so the trigger resolves it from auth.uid() and refuses
    // the state outright when it cannot.
    orderRows = [ORDER({ fulfilment_state: "delivered" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    fireEvent.click(await screen.findByTestId("fulfilment-advance-tested"));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    for (const w of writes) {
      expect(Object.keys(w.payload)).not.toContain("tested_at");
      expect(Object.keys(w.payload)).not.toContain("tested_by");
      expect(Object.keys(w.payload)).not.toContain("programmed_by");
    }
  });

  it("does NOT send a reason on a forward move", async () => {
    // A reason left on the row for a move nobody questioned is the reason the NEXT correction
    // gets refused for reusing.
    orderRows = [ORDER({ fulfilment_state: "delivered" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    fireEvent.click(await screen.findByTestId("fulfilment-advance-tested"));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(Object.keys(writes[0].payload)).not.toContain("fulfilment_state_reason");
  });

  it("moves fulfilment first, then reconciles orders.status", async () => {
    // If the trigger refuses, nothing else must have happened. Reversed, a refused move to
    // `delivered` would already have created a €50 commission for a delivery the database
    // declined to record.
    orderRows = [ORDER({ fulfilment_state: "programmed", status: "processing" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    fireEvent.click(await screen.findByTestId("fulfilment-advance-dispatched"));

    await waitFor(() => expect(writes.length).toBeGreaterThanOrEqual(2));
    expect(writes[0].payload).toEqual({ fulfilment_state: "dispatched" });
    expect(writes[1].payload.status).toBe("shipped");
  });

  it("does not touch orders.status when the fulfilment state has no counterpart", async () => {
    // `tested` maps to nothing: an order in `tested` stays `delivered`, which is what the
    // commission path should see.
    orderRows = [ORDER({ fulfilment_state: "delivered", status: "delivered" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    fireEvent.click(await screen.findByTestId("fulfilment-advance-tested"));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes.every((w) => !("status" in w.payload))).toBe(true);
  });

  it("translates the trigger's refusal instead of showing the raw exception", async () => {
    updateError = new Error(
      "fulfilment_state=tested requires tested_by: the state means a named operator answered",
    );
    orderRows = [ORDER({ fulfilment_state: "delivered" })];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    fireEvent.click(await screen.findByTestId("fulfilment-advance-tested"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const [title, opts] = toastError.mock.calls[0] as [string, { description: string }];
    expect(title).toBe("We could not record who made the test call");
    expect(opts.description).not.toContain("tested_by");
  });
});

describe("D9 — who is offered a correction", () => {
  it("an ordinary call_centre operator is not", async () => {
    // `may_reverse_fulfilment()` is what stops them. This stops them being handed a dialog the
    // database will refuse, which is a different and equally important thing.
    staffRole = "call_centre";
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    // The menu is open once its first item is in the DOM. `t()` in this file returns
    // the key when a string has no inline fallback, and this one lives in the locale files.
    await screen.findByText("admin.orders.viewDetails");
    expect(screen.queryByTestId("fulfilment-correct")).toBeNull();
  });

  it.each(["call_centre_supervisor", "admin", "super_admin"])("%s is", async (role) => {
    staffRole = role;
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    expect(await screen.findByTestId("fulfilment-correct")).toBeTruthy();
  });
});

describe("the correction dialog cannot send what the trigger would refuse", () => {
  async function openCorrection(order: Row = ORDER()) {
    staffRole = "admin";
    orderRows = [order];
    await renderOrders();
    await screen.findByText("ICE-0001");
    await openMenu();
    fireEvent.click(await screen.findByTestId("fulfilment-correct"));
    return screen.findByTestId("fulfilment-correction-save");
  }

  /** Open the target Select and choose one option by its visible label. */
  async function chooseTarget(label: string) {
    const trigger = screen.getByLabelText("Move it to");
    fireEvent.pointerDown(
      trigger,
      new window.PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    const option = await screen.findByRole("option", { name: label });
    fireEvent.click(option);
  }

  it("will not save with no target and no reason", async () => {
    const save = await openCorrection();
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it("will not save a reason that repeats the one already on the order", async () => {
    // The trigger requires the reason to be DISTINCT FROM the old one: without that, a second
    // correction inherits the first one's sentence and the log explains a different event.
    const save = await openCorrection(
      ORDER({ fulfilment_state: "delivered", fulfilment_state_reason: "courier returned it" }),
    );
    // A target FIRST, so the disabled Save that follows is caused by the reason and not by the
    // empty target — otherwise this passes for the wrong reason and proves nothing.
    await chooseTarget("Dispatched");
    const box = screen.getByLabelText("What happened?");
    fireEvent.change(box, { target: { value: "  courier returned it  " } });
    expect(await screen.findByTestId("fulfilment-reason-repeated")).toBeTruthy();
    expect((save as HTMLButtonElement).disabled).toBe(true);

    // And it becomes saveable the moment the reason genuinely differs, so the assertion above
    // is about the repetition rather than about the dialog being permanently stuck.
    fireEvent.change(box, { target: { value: "returned a second time, box damaged" } });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  });

  it("warns about the commission before the click, not after the refusal", async () => {
    // The database cancels a pending commission in the same transaction, and REFUSES the move
    // once one is approved or paid. An operator who does not know that reads the refusal as the
    // screen being broken.
    await openCorrection(ORDER({ fulfilment_state: "delivered" }));
    expect(screen.queryByTestId("fulfilment-commission-warning")).toBeNull();
    await chooseTarget("Dispatched");
    expect(await screen.findByTestId("fulfilment-commission-warning")).toBeTruthy();
  });

  it("sends the target and the reason, and closes only on success", async () => {
    const save = await openCorrection(ORDER({ fulfilment_state: "delivered" }));
    await chooseTarget("Dispatched");
    fireEvent.change(screen.getByLabelText("What happened?"), {
      target: { value: "  courier returned it undelivered  " },
    });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes[0].payload).toEqual({
      fulfilment_state: "dispatched",
      // Trimmed: the trigger compares with btrim(), so an untrimmed reason that differs only in
      // whitespace would be accepted here and refused there.
      fulfilment_state_reason: "courier returned it undelivered",
    });
    await waitFor(() =>
      expect(screen.queryByTestId("fulfilment-correction-save")).toBeNull(),
    );
  });

  it("keeps the dialog open when the database refuses, with the reason still in it", async () => {
    // Retyping a sentence you have already written, because the screen threw it away, is how
    // corrections stop being recorded at all.
    updateError = new Error(
      "cannot move order out of delivered: its partner commission is already paid.",
    );
    const save = await openCorrection(ORDER({ fulfilment_state: "delivered" }));
    await chooseTarget("Dispatched");
    fireEvent.change(screen.getByLabelText("What happened?"), {
      target: { value: "delivered by mistake" },
    });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect((toastError.mock.calls[0] as [string, unknown])[0]).toBe(
      "The partner has already been paid for this delivery",
    );
    expect(screen.getByTestId("fulfilment-correction-save")).toBeTruthy();
    expect((screen.getByLabelText("What happened?") as HTMLTextAreaElement).value).toBe(
      "delivered by mistake",
    );
  });

  it("offers no ordinary forward move as a target: from `paid`, back or cancelled only", async () => {
    // A dialog that offered forward moves would be a second, reason-demanding way to do
    // ordinary work — and `tested` from `delivered` is exactly that.
    //
    // `Awaiting payment` IS offered from `paid`, and belongs here: it is backwards, and it is
    // how a supervisor undoes an order marked paid against a payment that turned out not to
    // have cleared. `Allocated` and everything past it stay out.
    await openCorrection(ORDER({ fulfilment_state: "paid", status: "pending" }));
    const trigger = screen.getByLabelText("Move it to");
    fireEvent.pointerDown(
      trigger,
      new window.PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Awaiting payment", "Cancelled"]);
  });

  it("from `awaiting_payment`, recording a payment is offered — and demands a reason", async () => {
    // The one route into `paid` outside the payment webhook: money that arrived another way,
    // with a supervisor saying so. The trigger refuses it without a NEW reason, so the dialog
    // is the right and only affordance.
    await openCorrection(ORDER({ fulfilment_state: "awaiting_payment", status: "pending" }));
    const trigger = screen.getByLabelText("Move it to");
    fireEvent.pointerDown(
      trigger,
      new window.PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Paid", "Cancelled"]);
  });

  it("does not offer `tested` when correcting a delivered order", async () => {
    await openCorrection(ORDER({ fulfilment_state: "delivered" }));
    const trigger = screen.getByLabelText("Move it to");
    fireEvent.pointerDown(
      trigger,
      new window.PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).not.toContain("Tested");
    expect(options.map((o) => o.textContent)).toContain("Cancelled");
  });
});
