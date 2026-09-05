/**
 * Staff-initiated member creation — the thing that promised and never delivered, TWICE.
 *
 * First a ten-step wizard ending in "Member registered successfully" that contained NO DATA
 * ACCESS AT ALL: an operator could take a full set of personal details over the phone, walk
 * every step, be told the member existed, and nothing was written anywhere. Then an honest
 * "not available" notice while the payer-vs-member decision was open.
 *
 * So the load-bearing assertion here is not "it renders". It is that CLICKING CREATE ACTUALLY
 * WRITES A ROW, and that when the write fails the operator is told nothing was saved rather
 * than being congratulated. Tested by rendering and clicking, not by reading the source.
 *
 * See PAYER_MODEL.md and src/test/addMemberWizardHonesty.test.ts (which pinned the stub).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ── mocks ──────────────────────────────────────────────────────────────────

interface Call { table: string; op: string; payload: unknown }
const calls: Call[] = [];
let memberInsertFails = false;
let payerInsertFails = false;

function builder(table: string) {
  const chain: Record<string, unknown> = {};
  let lastPayload: unknown = null;
  chain.insert = (payload: unknown) => {
    lastPayload = payload;
    calls.push({ table, op: "insert", payload });
    return chain;
  };
  chain.select = () => chain;
  chain.single = () => {
    const fails = (table === "members" && memberInsertFails) || (table === "payers" && payerInsertFails);
    if (fails) return Promise.resolve({ data: null, error: { message: `${table} write refused` } });
    return Promise.resolve({ data: { id: `${table}-id-1` }, error: null });
  };
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res);
  void lastPayload;
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => builder(table) },
}));

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

let isStaff = true;
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isStaff }) }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

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

async function renderWizard() {
  const Page = (await import("@/pages/admin/AddMemberWizard")).default;
  return render(<Page />);
}

const MEMBER = {
  "First name": "Ana", "Last name": "Alpha", Email: "ana@example.com", Phone: "+34600000001",
  "Date of birth": "1950-01-01", Address: "Calle A 1", City: "Albox", Province: "Almeria",
  "Postal code": "04800",
};

function fillMember() {
  for (const [label, value] of Object.entries(MEMBER)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

const clickText = (re: RegExp) => fireEvent.click(screen.getByText(re));

beforeEach(() => {
  calls.length = 0;
  navigate.mockReset(); toastSuccess.mockReset(); toastError.mockReset();
  memberInsertFails = false; payerInsertFails = false; isStaff = true;
});
afterEach(() => cleanup());

describe("add member — clicking create actually writes a row", () => {
  it("inserts into members, which the wizard it replaces never did", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/); // -> payer
    clickText(/^Next$/); // -> review
    clickText(/Create member record/);

    await waitFor(() => expect(calls.some((c) => c.table === "members")).toBe(true));
    const insert = calls.find((c) => c.table === "members")!.payload as Record<string, unknown>;
    expect(insert.first_name).toBe("Ana");
    expect(insert.email).toBe("ana@example.com");
  });

  it("creates the member INACTIVE — payment activates, nothing else (golden rule 4)", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/); clickText(/^Next$/);
    clickText(/Create member record/);

    await waitFor(() => expect(calls.some((c) => c.table === "members")).toBe(true));
    const insert = calls.find((c) => c.table === "members")!.payload as Record<string, unknown>;
    expect(insert.status).toBe("inactive");
    expect(insert.status).not.toBe("active");
  });

  it("writes NO subscription — staff cannot activate by creating one", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/); clickText(/^Next$/);
    clickText(/Create member record/);

    await waitFor(() => expect(calls.some((c) => c.table === "members")).toBe(true));
    expect(calls.some((c) => c.table === "subscriptions")).toBe(false);
  });

  it("logs who created the member, so a row from nowhere can be traced to a call", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/); clickText(/^Next$/);
    clickText(/Create member record/);

    await waitFor(() => expect(calls.some((c) => c.table === "activity_logs")).toBe(true));
    const log = calls.find((c) => c.table === "activity_logs")!.payload as Record<string, unknown>;
    expect(log.action).toBe("member_created_by_staff");
  });

  it("hands the operator to the member record, on the contacts tab", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/); clickText(/^Next$/);
    clickText(/Create member record/);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(navigate.mock.calls[0][0]).toMatch(/\/admin\/members\/members-id-1\?tab=contacts/);
  });
});

describe("add member — a failed write is never a success", () => {
  it("tells the operator NOTHING WAS SAVED, and does not navigate away", async () => {
    // The exact defect the old wizard had: a success message with no row behind it.
    memberInsertFails = true;
    await renderWizard();
    fillMember();
    clickText(/^Next$/); clickText(/^Next$/);
    clickText(/Create member record/);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toMatch(/Nothing was saved/);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a failed PAYER write aborts before any member is created — no orphan", async () => {
    payerInsertFails = true;
    await renderWizard();
    fillMember();
    clickText(/^Next$/);
    fireEvent.click(screen.getByLabelText(/Somebody else pays/));
    fireEvent.change(screen.getByLabelText(/Payer's full name/), { target: { value: "Paula" } });
    fireEvent.change(screen.getByLabelText(/Payer's email/), { target: { value: "p@example.com" } });
    clickText(/^Next$/);
    clickText(/Create member record/);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // The order is the mitigation: there is no transaction across two client calls, so a payer
    // failure must not leave a member behind.
    expect(calls.some((c) => c.table === "members")).toBe(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("add member — the payer is billing only", () => {
  it("records the payer when asked, and links it to no subscription", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/);
    fireEvent.click(screen.getByLabelText(/Somebody else pays/));
    fireEvent.change(screen.getByLabelText(/Payer's full name/), { target: { value: "Paula Payer" } });
    fireEvent.change(screen.getByLabelText(/Payer's email/), { target: { value: "paula@example.com" } });
    clickText(/^Next$/);
    clickText(/Create member record/);

    await waitFor(() => expect(calls.some((c) => c.table === "payers")).toBe(true));
    const p = calls.find((c) => c.table === "payers")!.payload as Record<string, unknown>;
    expect(p.full_name).toBe("Paula Payer");
    expect(calls.some((c) => c.table === "subscriptions")).toBe(false);
  });

  it("writes NO payer when the operator does not ask for one", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/); clickText(/^Next$/);
    clickText(/Create member record/);
    await waitFor(() => expect(calls.some((c) => c.table === "members")).toBe(true));
    expect(calls.some((c) => c.table === "payers")).toBe(false);
  });

  it("says on screen that paying grants no access to medical, location or alerts", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/);
    expect(screen.getByText(/gives no access to their medical information/i)).toBeTruthy();
  });
});

describe("add member — it does not collect or claim what it should not", () => {
  it("collects NO medical information and NO emergency contacts", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/); clickText(/^Next$/);
    // Those belong to the second stage; collecting them here would rebuild the deleted wizard.
    expect(screen.queryByLabelText(/blood type/i)).toBeNull();
    expect(screen.queryByLabelText(/allerg/i)).toBeNull();
    expect(screen.queryByLabelText(/emergency contact/i)).toBeNull();
  });

  it("does not claim to have emailed anybody — email is not deliverable", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/); clickText(/^Next$/);
    const review = screen.getByTestId("add-member-review").textContent ?? "";
    expect(review).toMatch(/Sends nothing/i);
    expect(review).not.toMatch(/we've emailed|we have emailed|email sent/i);
  });

  it("states on the review step that the member is NOT active", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/); clickText(/^Next$/);
    expect(screen.getByTestId("add-member-review").textContent).toMatch(/INACTIVE/);
  });

  it("offers no status control at all — activation is not a form field", async () => {
    await renderWizard();
    fillMember();
    clickText(/^Next$/); clickText(/^Next$/);
    expect(screen.queryByLabelText(/status/i)).toBeNull();
    expect(screen.queryByText(/^active$/i)).toBeNull();
  });
});

describe("add member — staff only", () => {
  it("refuses a non-staff caller", async () => {
    isStaff = false;
    await renderWizard();
    expect(screen.getByText(/Staff only/)).toBeTruthy();
    expect(screen.queryByText(/Create member record/)).toBeNull();
  });
});
