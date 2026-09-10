/**
 * LIST CARDS: EDIT ARMS THE CONTROLS, DONE DISARMS THEM.
 *
 * Contacts, notes, tasks and devices are edited one row at a time — each write lands the
 * moment it is made, so there is nothing to batch and nothing to cancel. A `Save` on these
 * would be a button that saves nothing, which is the same lie as an `Edit` that unlocks
 * nothing.
 *
 * WHAT THE LOCK IS FOR HERE. "Add contact", "Delete note" and "Unassign pendant" were one
 * stray click away on a screen somebody reads down the phone, and deleting a member's only
 * emergency contact by accident is a life-safety event rather than a typo.
 *
 * WHAT MUST STAY LIVE WHILE LOCKED is asserted just as hard: ringing a contact, searching the
 * notes, opening the device page. A lock that stops people reading is a lock they turn off and
 * leave off.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

let contacts: Array<Record<string, unknown>> = [];
let notes: Array<Record<string, unknown>> = [];
let device: Record<string, unknown> | null = null;
const deleted: string[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const list = () => {
      if (table === "emergency_contacts") return contacts;
      if (table === "member_notes") return notes;
      return [];
    };
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.in = self;
    // Chainable: NotesTab orders twice (pinned, then created_at), and a fake that only
    // survives one `.order()` silently returns nothing.
    q.order = self;
    q.limit = self;
    q.maybeSingle = async () => ({ data: table === "devices" ? device : null, error: null });
    q.single = async () => ({ data: table === "devices" ? device : null, error: null });
    q.update = () => ({ eq: async () => ({ error: null }) });
    q.insert = async () => ({ error: null });
    q.delete = () => ({
      eq: async (_c: string, id: string) => {
        deleted.push(String(id));
        return { error: null };
      },
    });
    q.then = (r: (v: unknown) => unknown) => r({ data: list(), error: null });
    return q;
  };
  return {
    supabase: {
      from: (t: string) => chain(t),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
    },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, def?: unknown) => (typeof def === "string" ? def : key),
  }),
}));

vi.mock("sonner", () => ({ toast: { error: () => {}, success: () => {}, warning: () => {} } }));

vi.mock("@/components/admin/member-detail/PendantFulfilmentCard", () => ({
  PendantFulfilmentCard: () => <div data-testid="fulfilment" />,
}));
vi.mock("@/components/maps/LocationMap", () => ({ LocationMap: () => <div /> }));
vi.mock("@/hooks/useDeviceRealtime", () => ({ useDeviceRealtime: () => {} }));

import { ContactsTab } from "@/components/admin/member-detail/ContactsTab";
import { NotesTab } from "@/components/admin/member-detail/NotesTab";
import { DeviceTab } from "@/components/admin/member-detail/DeviceTab";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const fieldsOf = (id: string) => screen.getByTestId(`${id}-fields`) as HTMLFieldSetElement;

beforeEach(() => {
  deleted.length = 0;
  contacts = [
    {
      id: "c1",
      contact_name: "Ann Quinn",
      relationship: "Daughter",
      phone: "600333444",
      email: "ann@example.com",
      is_primary: true,
      speaks_spanish: false,
      notes: null,
      priority_order: 1,
    },
  ];
  notes = [
    {
      id: "n1",
      content: "Prefers afternoon calls",
      note_type: "general",
      is_pinned: false,
      created_at: "2026-09-01T10:00:00Z",
      staff: { first_name: "Ana", last_name: "R" },
    },
  ];
  device = null;
});
afterEach(cleanup);

describe("emergency contacts", () => {
  it("opens locked: Add and the row's Edit/Delete are all inert", async () => {
    render(<ContactsTab memberId="m1" />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("contacts-card-fields")).toBeTruthy());

    expect(fieldsOf("contacts-card").disabled).toBe(true);
    expect(screen.getByText("Add Contact").closest("button")!.matches(":disabled")).toBe(true);
    // The row actions live in the same fieldset, so one stray click cannot delete the only
    // person we can ring for this member.
    const rowButtons = fieldsOf("contacts-card").querySelectorAll("button");
    expect(rowButtons.length).toBeGreaterThan(1);
    for (const b of rowButtons) expect(b.matches(":disabled")).toBe(true);
    expect(deleted).toHaveLength(0);
  });

  it("ringing them still works while locked — a lock that stops reading gets left off", async () => {
    render(<ContactsTab memberId="m1" />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("contacts-card-fields")).toBeTruthy());
    // Anchors are not form controls: a disabled fieldset does not touch them, which is exactly
    // what is wanted for tel: and WhatsApp.
    const links = fieldsOf("contacts-card").querySelectorAll("a[href]");
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect([...links].some((a) => (a.getAttribute("href") ?? "").startsWith("tel:"))).toBe(true);
  });

  it("Edit arms them, Done disarms them again — and there is no Save to press", async () => {
    render(<ContactsTab memberId="m1" />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("contacts-card-fields")).toBeTruthy());

    fireEvent.click(screen.getByTestId("contacts-card-edit"));
    expect(fieldsOf("contacts-card").disabled).toBe(false);
    expect(screen.getByText("Add Contact").closest("button")!.matches(":disabled")).toBe(false);
    // Nothing is pending, so a Save would save nothing and a Cancel would cancel nothing.
    expect(screen.queryByTestId("contacts-card-save")).toBeNull();
    expect(screen.queryByTestId("contacts-card-cancel")).toBeNull();

    fireEvent.click(screen.getByTestId("contacts-card-done"));
    expect(fieldsOf("contacts-card").disabled).toBe(true);
  });

  it("says what Edit is for, while locked", async () => {
    render(<ContactsTab memberId="m1" />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("contacts-card-manage-hint")).toBeTruthy());
    expect(screen.getByTestId("contacts-card-manage-hint").textContent).toMatch(/add, change or remove/i);
    // And it goes away once the controls are armed — it was an instruction, not a caption.
    fireEvent.click(screen.getByTestId("contacts-card-edit"));
    expect(screen.queryByTestId("contacts-card-manage-hint")).toBeNull();
  });
});

describe("notes", () => {
  it("locks Add and the row actions, but never the search", async () => {
    render(<NotesTab memberId="m1" />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("notes-card-fields")).toBeTruthy());

    expect(fieldsOf("notes-card").disabled).toBe(true);
    expect(screen.getByText("Add Note").closest("button")!.matches(":disabled")).toBe(true);

    /*
      Searching is the commonest thing anybody does on this card — finding the note with the
      daughter's number. Inside the fieldset it would be dead while locked, so it lives in the
      header instead.
    */
    const search = screen.getByLabelText("Search notes") as HTMLInputElement;
    expect(search.matches(":disabled")).toBe(false);
    fireEvent.change(search, { target: { value: "afternoon" } });
    expect(search.value).toBe("afternoon");
    expect(screen.getByText("Prefers afternoon calls")).toBeTruthy();

    fireEvent.change(search, { target: { value: "nothing matches this" } });
    expect(screen.queryByText("Prefers afternoon calls")).toBeNull();
  });
});

describe("the device tab", () => {
  it("locks Assign when there is no pendant", async () => {
    render(<DeviceTab memberId="m1" />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("device-assign-card-fields")).toBeTruthy());
    expect(fieldsOf("device-assign-card").disabled).toBe(true);
    expect(
      screen.getByText("Assign EV-07B Pendant").closest("button")!.matches(":disabled"),
    ).toBe(true);

    fireEvent.click(screen.getByTestId("device-assign-card-edit"));
    expect(
      screen.getByText("Assign EV-07B Pendant").closest("button")!.matches(":disabled"),
    ).toBe(false);
  });

  it("locks Unassign and the workflow marks, and leaves the links out of it", async () => {
    device = {
      id: "d1",
      imei: "351111111111111",
      status: "allocated",
      battery_level: 80,
      is_online: true,
      last_checkin_at: "2026-09-10T09:00:00Z",
      device_type: "pendant",
      configuration_status: "configured",
      management_mode: "api",
      provisioning_checklist: {},
    };
    render(<DeviceTab memberId="m1" />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("device-details-card-fields")).toBeTruthy());

    expect(fieldsOf("device-details-card").disabled).toBe(true);
    expect(screen.getByText("Unassign Device").closest("button")!.matches(":disabled")).toBe(true);
    // "Mark Live" says a pendant is in service and "Mark Faulty" takes it off the member —
    // both are protection changes, not list tidying.
    expect(fieldsOf("device-workflow-card").disabled).toBe(true);
    expect(screen.getByText("Mark Collected").closest("button")!.matches(":disabled")).toBe(true);

    // The SMS-commands link is an anchor: reading the device is not editing it.
    const sms = screen.getByText("SMS Commands").closest("a");
    expect(sms).toBeTruthy();
    expect(sms!.getAttribute("href")).toContain("/admin/devices/d1");

    fireEvent.click(screen.getByTestId("device-workflow-card-edit"));
    expect(screen.getByText("Mark Collected").closest("button")!.matches(":disabled")).toBe(false);
    // Each card arms on its own — unassign is still locked.
    expect(screen.getByText("Unassign Device").closest("button")!.matches(":disabled")).toBe(true);
  });
});
