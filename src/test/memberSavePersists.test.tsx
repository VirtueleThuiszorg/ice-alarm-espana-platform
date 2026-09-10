/**
 * SAVE, THEN READ IT BACK — the half of "locked until Edit" that the other suites do not cover.
 *
 * `memberLockedUntilEdit.test.tsx` proves Save WRITES: it asserts the update payload. That is
 * not the same claim as the brief's — *"after Save the value persists on reload"* — and the
 * gap between them is a real bug class:
 *
 *   · a form that writes a column nothing reads back (a rename on one side only);
 *   · a card that re-locks showing the value it had BEFORE the save, because it reset itself
 *     from stale props rather than from what came back;
 *   · a save that appears to work and is gone the next time anybody opens the record.
 *
 * So the fake here is not a stub that records calls: it holds a row, applies the update to it,
 * and serves the updated row to the next read. That is the minimum needed for "persists" to
 * mean anything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configure, render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

configure({ getElementError: (message) => new Error(message ?? "element not found") });

/** THE ROW, which survives between renders exactly as a database row would. */
let stored: Record<string, unknown>;
let updates = 0;
/** Reads of the member row, so "the page re-reads after saving" is a countable claim. */
let reads = 0;

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.order = self;
    q.limit = self;
    q.single = async () => {
      if (table === "members") reads += 1;
      return { data: table === "members" ? { ...stored } : null, error: null };
    };
    q.maybeSingle = async () => ({ data: null, error: null });
    q.update = (payload: Record<string, unknown>) => ({
      eq: async () => {
        if (table === "members") {
          updates += 1;
          // What a database does: keep it. Anything the form did not send stays as it was.
          stored = { ...stored, ...payload };
        }
        return { error: null };
      },
    });
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

vi.mock("@/components/admin/member-detail/MedicalTab", () => ({ MedicalTab: () => <div /> }));
vi.mock("@/components/admin/member-detail/ContactsTab", () => ({ ContactsTab: () => <div /> }));
vi.mock("@/components/admin/member-detail/DeviceTab", () => ({ DeviceTab: () => <div /> }));
vi.mock("@/components/admin/member-detail/SubscriptionTab", () => ({ SubscriptionTab: () => <div /> }));
vi.mock("@/components/admin/member-detail/PaymentsTab", () => ({ PaymentsTab: () => <div /> }));
vi.mock("@/components/admin/member-detail/MessagesTab", () => ({ MessagesTab: () => <div /> }));
vi.mock("@/components/admin/member-detail/NotesTab", () => ({ NotesTab: () => <div /> }));
vi.mock("@/components/admin/member-detail/ActivityTab", () => ({ ActivityTab: () => <div /> }));
vi.mock("@/components/admin/member-detail/AlertsTab", () => ({ AlertsTab: () => <div /> }));
vi.mock("@/components/admin/member-detail/TasksTab", () => ({ TasksTab: () => <div /> }));
vi.mock("@/components/admin/member-detail/CRMTab", () => ({ CRMTab: () => <div /> }));
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

const fields = () => screen.getByTestId("profile-card-fields") as HTMLFieldSetElement;
const field = (name: string) =>
  fields().querySelector(`input[name="${name}"]`) as HTMLInputElement;

/** Open the record as a fresh visit would — a new mount, reading whatever the row now says. */
async function openRecord() {
  render(<MemberDetailPage />, { wrapper });
  await waitFor(() => expect(screen.getByTestId("profile-card-fields")).toBeTruthy());
}

beforeEach(() => {
  updates = 0;
  reads = 0;
  stored = {
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
});
afterEach(cleanup);

describe("a saved value survives", () => {
  it("is on the card after Save, not the value it had before", async () => {
    await openRecord();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.click(screen.getByTestId("profile-card-save"));

    // Re-locked, and showing what was saved — not what the props said a moment ago.
    await waitFor(() => expect(fields().disabled).toBe(true));
    expect(field("city").value).toBe("Estepona");
    expect(stored.city).toBe("Estepona");
  });

  it("is still there when the record is opened again — the reload", async () => {
    await openRecord();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.change(field("nie_dni"), { target: { value: "X1234567A" } });
    fireEvent.click(screen.getByTestId("profile-card-save"));
    await waitFor(() => expect(fields().disabled).toBe(true));

    // A fresh mount, reading the row back: this is the claim the brief actually makes.
    cleanup();
    await openRecord();
    expect(field("city").value).toBe("Estepona");
    expect(field("nie_dni").value).toBe("X1234567A");
    expect(fields().disabled).toBe(true);
  });

  it("writes the whole card, so a field nobody touched is not blanked", async () => {
    await openRecord();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.click(screen.getByTestId("profile-card-save"));
    await waitFor(() => expect(fields().disabled).toBe(true));

    cleanup();
    await openRecord();
    // The failure this catches: a save that sends only the dirty field and a form that
    // rebuilt itself from an empty default for everything else.
    expect(field("first_name").value).toBe("Mary");
    expect(field("postal_code").value).toBe("29601");
    expect(field("address_line_1").value).toBe("Calle Mayor 1");
  });

  it("the page re-reads the record after a save, so the rest of it is not stale", async () => {
    /*
      The card shows the form's own state, so it looks right whether or not anything re-read.
      Everything ELSE on the page — the name in the header, the badges, the missing-info count
      — is built from the fetched row, and without the re-read they keep showing the record as
      it was before the save until somebody reloads.
    */
    await openRecord();
    const before = reads;
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.click(screen.getByTestId("profile-card-save"));

    await waitFor(() => expect(reads).toBeGreaterThan(before));
  });

  it("does not ask about discarding when there is nothing left to discard", async () => {
    /*
      After a save the form must be told that what it holds IS the record now. Left dirty, the
      very next Edit → Cancel throws up "Discard your changes?" over an edit the operator
      already saved — and a warning that cries wolf is a warning people click through.
    */
    await openRecord();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.click(screen.getByTestId("profile-card-save"));
    await waitFor(() => expect(fields().disabled).toBe(true));

    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.click(screen.getByTestId("profile-card-cancel"));
    await waitFor(() => expect(fields().disabled).toBe(true));
    expect(screen.queryByTestId("profile-card-discard")).toBeNull();
  });

  it("a discarded edit changes nothing, and nothing is written", async () => {
    await openRecord();
    fireEvent.click(screen.getByTestId("profile-card-edit"));
    fireEvent.change(field("city"), { target: { value: "Estepona" } });
    fireEvent.click(screen.getByTestId("profile-card-cancel"));
    await waitFor(() => expect(screen.getByTestId("profile-card-discard")).toBeTruthy());
    fireEvent.click(screen.getByTestId("profile-card-discard"));
    await waitFor(() => expect(fields().disabled).toBe(true));

    expect(updates).toBe(0);
    expect(stored.city).toBe("Marbella");

    cleanup();
    await openRecord();
    expect(field("city").value).toBe("Marbella");
  });
});
