/**
 * A TAB CLICK IS THE ONE WAY OUT THE BROWSER CANNOT WARN ABOUT.
 *
 * `EditableCard` already guards Cancel (an in-app confirm) and leaving the app (the browser's
 * own `beforeunload`). Neither sees a tab change — and Radix unmounts the inactive panel, so
 * clicking "Medical" half-way through editing the address DESTROYED the edit, silently, inside
 * the app, where the browser has nothing to say.
 *
 * ASSERTED THROUGH THE REAL PAGE. The defect lives between two components that do not know
 * about each other — a card inside a panel and a trigger in the tab list — so a synthetic
 * harness proves the wrong thing. This presses the actual trigger with the actual card behind
 * it. (The first version of this suite did use a harness; it hung the runner on a render loop
 * of its own making and told me nothing about the page.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configure, render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

/*
  NO DOM DUMPS ON A FAILED QUERY. This page renders the whole member record; RTL's default
  error formatter pretty-prints the entire tree on EVERY `waitFor` retry, which on a DOM this
  size pegs the event loop hard enough that the test timeout itself cannot fire — the suite
  hangs instead of failing. The message alone says everything the assertion is about.
*/
configure({ getElementError: (message) => new Error(message ?? "element not found") });

/**
 * Radix activates a tab on POINTER DOWN, not on click. `fireEvent.click` alone leaves the tab
 * where it was — which looked exactly like "the guard blocked it" and would have made this
 * whole suite pass for the wrong reason.
 */
function clickTab(name: string) {
  const trigger = screen.getByRole("tab", { name });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.mouseDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
}

const MEMBER = {
  id: "m1",
  first_name: "Mary",
  last_name: "Quinn",
  email: "mary@example.com",
  phone: "600111222",
  status: "active",
  photo_url: null,
  address_line_1: "Calle Mayor 1",
  address_line_2: null,
  city: "Marbella",
  province: "Málaga",
  postal_code: "29601",
  country: "Spain",
  preferred_language: "en",
  date_of_birth: "1938-04-05",
  nie_dni: null,
  special_instructions: null,
};

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.order = self;
    q.limit = self;
    q.update = () => ({ eq: async () => ({ error: null }) });
    q.single = async () => ({ data: table === "members" ? MEMBER : null, error: null });
    q.maybeSingle = async () => ({ data: null, error: null });
    q.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
    return q;
  };
  return {
    supabase: {
      from: (t: string) => chain(t),
      auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    },
  };
});

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "m1" }),
  useNavigate: () => () => {},
  useLocation: () => ({ pathname: "/admin/members/m1" }),
  useSearchParams: () => [new URLSearchParams("")],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, def?: unknown) => (typeof def === "string" ? def : key) }),
}));

vi.mock("sonner", () => ({ toast: { error: () => {}, success: () => {} } }));
vi.mock("@/lib/auditLog", () => ({ logMemberActivity: async () => {} }));

/*
  EVERYTHING EXCEPT ProfileTab: this is about the tab LIST and one dirty card behind it.

  `vi.mock` with a LITERAL path, one call each — not a loop over `vi.doMock`. `doMock` is not
  hoisted, so a loop of them runs AFTER the static import below has already pulled in the real
  components; the first version of this file did that and hung the runner inside one of the
  heavy tabs instead of failing.
*/
vi.mock("@/components/admin/member-detail/MedicalTab", () => ({ MedicalTab: () => <div data-testid="stub-MedicalTab" /> }));
vi.mock("@/components/admin/member-detail/ContactsTab", () => ({ ContactsTab: () => <div data-testid="stub-ContactsTab" /> }));
vi.mock("@/components/admin/member-detail/DeviceTab", () => ({ DeviceTab: () => <div data-testid="stub-DeviceTab" /> }));
vi.mock("@/components/admin/member-detail/SubscriptionTab", () => ({ SubscriptionTab: () => <div data-testid="stub-SubscriptionTab" /> }));
vi.mock("@/components/admin/member-detail/PaymentsTab", () => ({ PaymentsTab: () => <div data-testid="stub-PaymentsTab" /> }));
vi.mock("@/components/admin/member-detail/MessagesTab", () => ({ MessagesTab: () => <div data-testid="stub-MessagesTab" /> }));
vi.mock("@/components/admin/member-detail/NotesTab", () => ({ NotesTab: () => <div data-testid="stub-NotesTab" /> }));
vi.mock("@/components/admin/member-detail/ActivityTab", () => ({ ActivityTab: () => <div data-testid="stub-ActivityTab" /> }));
vi.mock("@/components/admin/member-detail/AlertsTab", () => ({ AlertsTab: () => <div data-testid="stub-AlertsTab" /> }));
vi.mock("@/components/admin/member-detail/TasksTab", () => ({ TasksTab: () => <div data-testid="stub-TasksTab" /> }));
vi.mock("@/components/admin/member-detail/CRMTab", () => ({ CRMTab: () => <div data-testid="stub-CRMTab" /> }));
vi.mock("@/components/admin/member-detail/MemberHeader", () => ({
  MemberHeader: () => <div data-testid="stub-header" />,
}));
vi.mock("@/components/admin/member-detail/PartnerAttributionCard", () => ({
  PartnerAttributionCard: () => null,
}));

import MemberDetailPage from "@/pages/admin/MemberDetailPage";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function openRecord() {
  render(<MemberDetailPage />, { wrapper });
  await waitFor(() => expect(screen.getByTestId("profile-card-fields")).toBeTruthy());
}

const profileFields = () => screen.getByTestId("profile-card-fields") as HTMLFieldSetElement;

beforeEach(() => cleanup());
afterEach(cleanup);

describe("leaving a tab mid-edit", () => {
  it("switches freely when nothing is being edited", async () => {
    await openRecord();
    clickTab("Medical");
    await waitFor(() => expect(screen.getByTestId("stub-MedicalTab")).toBeTruthy());
    expect(screen.queryByTestId("leave-tab-confirm")).toBeNull();
  });

  it("switches freely when a card is OPEN but untouched", async () => {
    await openRecord();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    expect(profileFields().disabled).toBe(false);

    clickTab("Medical");
    await waitFor(() => expect(screen.getByTestId("stub-MedicalTab")).toBeTruthy());
    expect(screen.queryByTestId("leave-tab-confirm")).toBeNull();
  });

  it("ASKS when a card has been typed into, and staying keeps the edit", async () => {
    await openRecord();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(profileFields().querySelector('input[name="city"]')!, {
      target: { value: "Estepona" },
    });

    clickTab("Medical");
    await waitFor(() => expect(screen.getByTestId("leave-tab-confirm")).toBeTruthy());

    // Still on Profile, still editing, still holding what was typed.
    expect(screen.queryByTestId("stub-MedicalTab")).toBeNull();
    expect(
      (profileFields().querySelector('input[name="city"]') as HTMLInputElement).value,
    ).toBe("Estepona");

    fireEvent.click(screen.getByText("Keep editing"));
    await waitFor(() => expect(screen.queryByTestId("leave-tab-confirm")).toBeNull());
    expect(screen.queryByTestId("stub-MedicalTab")).toBeNull();
    expect(profileFields().disabled).toBe(false);
  });

  it("goes through when the operator says discard", async () => {
    await openRecord();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(profileFields().querySelector('input[name="city"]')!, {
      target: { value: "Estepona" },
    });

    clickTab("Medical");
    await waitFor(() => expect(screen.getByTestId("leave-tab-confirm")).toBeTruthy());
    fireEvent.click(screen.getByTestId("leave-tab-confirm"));

    await waitFor(() => expect(screen.getByTestId("stub-MedicalTab")).toBeTruthy());
  });

  it("a card that is DIRTY but closed does not block — only an open edit is at risk", async () => {
    /*
      `editing && isDirty`, not `isDirty`. A form can hold a dirty flag while its card is shut
      (a save that reset the values, a form whose defaults differ from what is rendered), and
      blocking navigation on that is a page nobody can leave for a reason nobody can see.
    */
    await openRecord();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(profileFields().querySelector('input[name="city"]')!, {
      target: { value: "Estepona" },
    });
    // Save re-locks the card. The form's own dirty flag is not what decides this.
    fireEvent.click(screen.getByTestId("profile-card-save"));
    await waitFor(() => expect(profileFields().disabled).toBe(true));

    clickTab("Medical");
    await waitFor(() => expect(screen.getByTestId("stub-MedicalTab")).toBeTruthy());
    expect(screen.queryByTestId("leave-tab-confirm")).toBeNull();
  });

  it("stops asking once the card is closed — the page does not stay stuck", async () => {
    await openRecord();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(profileFields().querySelector('input[name="city"]')!, {
      target: { value: "Estepona" },
    });
    fireEvent.click(screen.getByTestId("profile-card-cancel"));
    await waitFor(() => expect(screen.getByTestId("profile-card-discard")).toBeTruthy());
    fireEvent.click(screen.getByTestId("profile-card-discard"));
    await waitFor(() => expect(profileFields().disabled).toBe(true));

    clickTab("Medical");
    await waitFor(() => expect(screen.getByTestId("stub-MedicalTab")).toBeTruthy());
    expect(screen.queryByTestId("leave-tab-confirm")).toBeNull();
  });
});
