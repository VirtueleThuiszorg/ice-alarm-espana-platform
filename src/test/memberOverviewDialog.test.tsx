/**
 * THE OVERVIEW BUTTON, PRESSED — the half `memberOverview.test.ts` cannot see.
 *
 * That suite proves what belongs on the sheet. This one proves the sheet can be reached: a
 * builder nothing renders is a well-tested function with no button, which is exactly the state
 * this page was already in on several of its controls.
 *
 * Three properties are asserted here and nowhere else, because each is a property of the
 * WIRING rather than of the data:
 *   1. The button is in the header, beside Edit, and opening it shows the record.
 *   2. Nothing is queried until it is opened — six reads on every page load, for a dialog most
 *      visits never open, is the cost of getting the `enabled` gate wrong, and it is invisible.
 *   3. The dialog is READ-ONLY. Not "we did not add a form": no field on it can take a value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// ── fakes ───────────────────────────────────────────────────────────────────
type Row = Record<string, unknown> | Array<Record<string, unknown>> | null;
let rows: Record<string, Row> = {};
let errors: Record<string, { message: string } | null> = {};
let reads: string[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const answer = () => ({ data: rows[table] ?? null, error: errors[table] ?? null });
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.order = self;
    q.limit = self;
    q.maybeSingle = async () => answer();
    q.then = (resolve: (v: unknown) => unknown) => resolve(answer());
    return q;
  };
  return {
    supabase: {
      from: (table: string) => {
        reads.push(table);
        return chain(table);
      },
    },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, def?: unknown, opts?: Record<string, unknown>) => {
      const vars = (typeof def === "object" ? def : opts) as Record<string, unknown> | undefined;
      let out = typeof def === "string" ? def : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(String(v));
      }
      return out;
    },
  }),
}));

/*
  The header also carries the Missing-info badge, which reads on mount ON PURPOSE — a count
  nobody can see until they click is not a warning. It is faked at the hook boundary here so
  the "queries nothing until it is opened" assertion below is about the OVERVIEW and not about
  the badge beside it. The badge's own reads are covered in memberMissingInfo.test.tsx.
*/
vi.mock("@/hooks/useMemberMissingInfo", () => ({
  useMemberMissingInfo: () => ({ data: { missing: [], count: 0 }, isLoading: false }),
  useMembersMissingCounts: () => ({ data: {}, isLoading: false }),
  useMemberMissingInfoRealtime: () => {},
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));

import { MemberHeader } from "@/components/admin/member-detail/MemberHeader";

const MEMBER = {
  id: "m1",
  first_name: "Mary",
  last_name: "Quinn",
  email: "mary@example.com",
  phone: "600111222",
  address_line_1: "Calle Mayor 1",
  address_line_2: null,
  city: "Marbella",
  province: "Málaga",
  status: "active",
  nie_dni: null,
  preferred_language: "en",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderHeader() {
  return render(
    <MemberHeader
      member={MEMBER}
      subscription={null}
      hasDevice={false}
      onEdit={() => {}}
      onSuspend={() => {}}
      onDelete={() => {}}
    />,
    { wrapper },
  );
}

beforeEach(() => {
  reads = [];
  errors = {};
  toastError.mockClear();
  rows = {
    members: {
      first_name: "Mary",
      last_name: "Quinn",
      // Blank on purpose: the row must not appear at all.
      nie_dni: "",
      address_line_1: "Calle Mayor 1",
      city: "Marbella",
      phone: "600111222",
    },
    medical_information: { blood_type: "O+", allergies: ["Penicillin"] },
    emergency_contacts: [{ contact_name: "Ann Quinn", relationship: "Daughter", phone: "600333444" }],
    devices: { imei: "351111111111111" },
    member_monitoring_readiness: { device_tested_at: "2026-08-01T10:00:00Z" },
    subscriptions: { plan_type: "standard", status: "active", payer_id: null },
  };
});

afterEach(cleanup);

describe("Overview — reachable from the header", () => {
  it("puts an Overview button beside Edit and shows the record when pressed", async () => {
    renderHeader();
    const trigger = screen.getByTestId("member-overview-trigger");
    expect(trigger).toHaveTextContent("Overview");

    fireEvent.click(trigger);

    await waitFor(() => expect(screen.getByTestId("member-overview-section-identity")).toBeTruthy());
    expect(screen.getByText("Calle Mayor 1")).toBeTruthy();
    expect(screen.getByText("O+")).toBeTruthy();
    expect(screen.getByText("Penicillin")).toBeTruthy();
    expect(screen.getByText(/Ann Quinn/)).toBeTruthy();
    expect(screen.getByText("351111111111111")).toBeTruthy();
    // Empty in the fixture, so it is not on the sheet — not a dash, not a label with a gap.
    expect(screen.queryByText("NIE / DNI")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("queries nothing until it is opened", async () => {
    renderHeader();
    expect(reads).toEqual([]);
    fireEvent.click(screen.getByTestId("member-overview-trigger"));
    await waitFor(() => expect(reads).toContain("members"));
    expect(reads).toContain("medical_information");
    expect(reads).toContain("emergency_contacts");
    expect(reads).toContain("member_monitoring_readiness");
  });

  it("is read-only: nothing on it takes a value", async () => {
    const { baseElement } = renderHeader();
    fireEvent.click(screen.getByTestId("member-overview-trigger"));
    await waitFor(() => expect(screen.getByTestId("member-overview-section-identity")).toBeTruthy());
    const dialog = baseElement.querySelector('[role="dialog"]')!;
    expect(dialog.querySelectorAll("input, textarea, select, [contenteditable=true]").length).toBe(0);
  });

  it("one unreadable table costs its own section, not the whole sheet", async () => {
    errors = { medical_information: { message: "permission denied" } };
    renderHeader();
    fireEvent.click(screen.getByTestId("member-overview-trigger"));
    await waitFor(() => expect(screen.getByTestId("member-overview-section-identity")).toBeTruthy());
    expect(screen.queryByTestId("member-overview-section-medical")).toBeNull();
    // The name and the address — the reason somebody opened it — are still there.
    expect(screen.getByText("Calle Mayor 1")).toBeTruthy();
  });

  it("copies the sheet as plain text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderHeader();
    fireEvent.click(screen.getByTestId("member-overview-trigger"));
    await waitFor(() => expect(screen.getByTestId("member-overview-section-identity")).toBeTruthy());

    fireEvent.click(screen.getByText("Copy as text"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("Mary Quinn — member record");
    expect(copied).toContain("Name: Mary Quinn");
    expect(copied).toContain("Blood group: O+");
    expect(copied).not.toContain("NIE / DNI");
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
  });

  it("a refused clipboard says what to do instead of failing silently", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderHeader();
    fireEvent.click(screen.getByTestId("member-overview-trigger"));
    await waitFor(() => expect(screen.getByTestId("member-overview-section-identity")).toBeTruthy());
    fireEvent.click(screen.getByText("Copy as text"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/copy/i);
  });

  it("prints the sheet from its own document, not the app chrome", async () => {
    renderHeader();
    fireEvent.click(screen.getByTestId("member-overview-trigger"));
    await waitFor(() => expect(screen.getByTestId("member-overview-section-identity")).toBeTruthy());

    // jsdom logs "Not implemented: window.print" here and carries on — that is the browser API
    // being absent, not the component failing, and stubbing it would test the stub.
    fireEvent.click(screen.getByText("Print"));

    // The frame is still in the document — the component removes it a second later, after the
    // print dialog has taken its snapshot.
    const frame = document.querySelector("iframe");
    expect(frame).toBeTruthy();
    const html = frame!.contentDocument!.documentElement.outerHTML;
    expect(html).toContain("Mary Quinn");
    expect(html).toContain("Blood group");
    // Its OWN document: none of the app around it comes with it.
    expect(html).not.toContain("member-overview-trigger");
    expect(html).not.toContain("Suspend Member");
    expect(toastError).not.toHaveBeenCalled();
  });
});
