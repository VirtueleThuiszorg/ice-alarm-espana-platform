/**
 * CARDS NOBODY MAY EDIT HERE — locked with a reason, not with a button that does nothing.
 *
 * Once every other card on the member record shows a padlock until somebody presses Edit, a
 * card with NO padlock and no button reads as "editable, and the control is missing". Two of
 * them are not editable by anybody on any screen: a subscription's plan and price are whatever
 * the payment webhook last recorded (golden rule 4), and an imported CRM profile is a record
 * of what the import saw.
 *
 * The wrong fixes are both tempting. An `Edit` button that unlocks nothing is the dead-button
 * pattern this codebase keeps finding. A silently-unlocked-looking card is the one that gets
 * typed into. `MEMBER_UX_RULES` R7 settled the same argument for fields: a lock with a reason
 * is fine, a lock without one is the complaint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

let subscription: Record<string, unknown> | null = null;
let crmProfile: Record<string, unknown> | null = null;
let importRow: Record<string, unknown> | null = null;
let importBatch: Record<string, unknown> | null = null;
const navigate = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const rows: Record<string, unknown> = {};
  const chain = (table: string) => {
    const data = () => {
      if (table === "subscriptions") return subscription;
      if (table === "crm_profiles") return crmProfile;
      if (table === "crm_import_rows") return importRow;
      if (table === "crm_import_batches") return importBatch;
      if (table === "members") return { id: "m1", first_name: "Mary", last_name: "Quinn", email: "m@e.es", phone: "6", nie_dni: null, address_line_2: null, preferred_language: "en" };
      return rows[table] ?? null;
    };
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.order = self;
    q.limit = self;
    q.maybeSingle = async () => ({ data: data(), error: null });
    q.single = async () => ({ data: data(), error: null });
    q.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
    return q;
  };
  return { supabase: { from: (t: string) => chain(t), functions: { invoke: async () => ({ data: null, error: null }) } } };
});

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, def?: unknown) => (typeof def === "string" ? def : key) }),
}));

vi.mock("sonner", () => ({ toast: { error: () => {}, success: () => {} } }));

// Not the subject: each has its own suite.
vi.mock("@/components/admin/member-detail/MemberActionsCard", () => ({
  MemberActionsCard: () => <div data-testid="member-actions" />,
}));
vi.mock("@/components/admin/member-detail/SendPaymentLinkDialog", () => ({
  SendPaymentLinkDialog: () => <div data-testid="send-payment-link" />,
}));
vi.mock("@/components/admin/member-detail/CourtesyCallsCard", () => ({
  CourtesyCallsCard: () => <div data-testid="courtesy-card" />,
}));
vi.mock("@/components/admin/member-detail/MemberUpdateRequestModal", () => ({
  MemberUpdateRequestModal: () => null,
}));

import { EditableCard } from "@/components/EditableCard";
import { SubscriptionTab } from "@/components/admin/member-detail/SubscriptionTab";
import { CRMTab } from "@/components/admin/member-detail/CRMTab";

beforeEach(() => {
  navigate.mockClear();
  subscription = {
    id: "s1",
    plan_type: "standard",
    billing_frequency: "monthly",
    amount: 34.5,
    status: "active",
    start_date: "2026-01-01",
    renewal_date: "2026-10-01",
    has_pendant: true,
    registration_fee_paid: true,
    payment_method: "card",
    stripe_subscription_id: "sub_1",
    mollie_subscription_id: null,
  };
  crmProfile = {
    updated_at: "2026-05-01T00:00:00Z",
    stage: "customer",
    status: "active",
    referral_source: "partner",
    tags: ["vip"],
    groups: [],
  };
  importRow = { row_index: 3, import_status: "imported", raw: { name: "Mary" }, batch_id: "b1" };
  importBatch = { id: "b1", filename: "export.csv", source: "ice", created_at: "2026-04-01" };
});
afterEach(cleanup);

describe("the subscription details card", () => {
  it("is locked with no Edit button at all", async () => {
    render(<SubscriptionTab memberId="m1" memberName="Mary Quinn" />);
    await waitFor(() => expect(screen.getByTestId("subscription-card-fields")).toBeTruthy());

    expect((screen.getByTestId("subscription-card-fields") as HTMLFieldSetElement).disabled).toBe(
      true,
    );
    expect(screen.getByTestId("subscription-card-lock")).toBeTruthy();
    /*
      NOTHING ON A LOCKED CARD CAN PUT IT INTO EDIT MODE. A disabled Edit button would still be
      a button somebody presses twice — and this assertion is also what stands behind the one
      remaining `!locked` invariant in EditableCard, which no mutation can reach while no such
      control exists. If a second way in is ever added, it belongs here first.
    */
    expect(screen.queryByTestId("subscription-card-edit")).toBeNull();
    expect(screen.queryByTestId("subscription-card-save")).toBeNull();
    expect(screen.queryByTestId("subscription-card-cancel")).toBeNull();
    expect(screen.queryByTestId("subscription-card-discard")).toBeNull();
  });

  it("says WHY, and where it does change", async () => {
    render(<SubscriptionTab memberId="m1" memberName="Mary Quinn" />);
    await waitFor(() => expect(screen.getByTestId("subscription-card-locked-reason")).toBeTruthy());
    const reason = screen.getByTestId("subscription-card-locked-reason").textContent ?? "";
    expect(reason).toMatch(/payment path/i);
    // Not a dead end: it names what to use instead.
    expect(reason).toMatch(/actions below/i);
    // And that card is still there to use.
    expect(screen.getByTestId("member-actions")).toBeTruthy();
  });

  it("still shows the figures — locked is not hidden", async () => {
    render(<SubscriptionTab memberId="m1" memberName="Mary Quinn" />);
    await waitFor(() => expect(screen.getByTestId("subscription-card-fields")).toBeTruthy());
    expect(screen.getByText("€34.50")).toBeTruthy();
    expect(screen.getByText("standard")).toBeTruthy();
  });
});

describe("the CRM cards", () => {
  it("both are locked, each with its own reason", async () => {
    render(<CRMTab memberId="m1" />);
    await waitFor(() => expect(screen.getByTestId("crm-profile-card-fields")).toBeTruthy());

    for (const card of ["crm-profile-card", "crm-import-card"]) {
      expect((screen.getByTestId(`${card}-fields`) as HTMLFieldSetElement).disabled).toBe(true);
      expect(screen.queryByTestId(`${card}-edit`)).toBeNull();
      expect(screen.getByTestId(`${card}-locked-reason`).textContent).toBeTruthy();
    }
    expect(screen.getByTestId("crm-profile-card-locked-reason").textContent).toMatch(
      /would not change the source/i,
    );
    expect(screen.getByTestId("crm-import-card-locked-reason").textContent).toMatch(/history/i);
  });

  it("locking the import card does not lock the way OUT of it", async () => {
    render(<CRMTab memberId="m1" />);
    await waitFor(() => expect(screen.getByTestId("crm-import-card-fields")).toBeTruthy());
    // A disabled fieldset makes every button inside it inert, so the navigation lives in the
    // header. Pressing it must still work.
    const viewBatch = screen.getByText("View Batch").closest("button")!;
    expect(viewBatch.matches(":disabled")).toBe(false);
    viewBatch.click();
    expect(navigate).toHaveBeenCalledWith("/admin/crm-import/batches");
  });
});


describe("a locked card ignores an outside request to edit", () => {
  /*
    THIS IS THE TEST THE INVARIANT WAS WAITING FOR.

    `EditableCard` carries one line — `const editing = !locked && wantsEdit` — that no mutation
    could kill while nothing outside the component could set `wantsEdit`. `editSignal` is now
    exactly that: the member header uses it to open the profile card, and a locked card must
    refuse it. Flip the `!locked &&` and this fails, which is what a guard is supposed to do.
  */
  it("stays locked when the signal is bumped", () => {
    const { rerender } = render(
      <EditableCard
        testId="locked-probe"
        mode="locked"
        title="Set by the payment path"
        lockedReason="Nothing on this screen changes it."
        editSignal={0}
      >
        <input aria-label="probe" />
      </EditableCard>,
    );
    const fieldset = () => screen.getByTestId("locked-probe-fields") as HTMLFieldSetElement;
    expect(fieldset().disabled).toBe(true);

    rerender(
      <EditableCard
        testId="locked-probe"
        mode="locked"
        title="Set by the payment path"
        lockedReason="Nothing on this screen changes it."
        editSignal={1}
      >
        <input aria-label="probe" />
      </EditableCard>,
    );

    expect(fieldset().disabled).toBe(true);
    expect(screen.getByLabelText("probe").matches(":disabled")).toBe(true);
    // And no Done/Save/Cancel appeared with it.
    expect(screen.queryByTestId("locked-probe-done")).toBeNull();
    expect(screen.queryByTestId("locked-probe-save")).toBeNull();
  });
});
