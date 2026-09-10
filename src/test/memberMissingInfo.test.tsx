/**
 * THE COUNT, THE REASONS, AND THE PRESS THAT ASKS FOR IT.
 *
 * WHY A COUNT AT ALL. A record with eleven gaps looks exactly like a complete one from the
 * outside: twelve tabs, all of them rendering, none of them saying anything is absent. Before
 * this the only way to find out was to open a member and read all twelve, so nobody did it for
 * the members nobody had complained about.
 *
 * The properties asserted here are the ones a source scan cannot see: that the badge reads
 * BEFORE anybody opens anything, that what only we can do is shown and NOT tickable, that the
 * reason is on screen beside each item, and that the send hands the ticked keys to the
 * existing endpoint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

type Row = Record<string, unknown> | Array<Record<string, unknown>> | null;
let rows: Record<string, Row> = {};
let errors: Record<string, { message: string } | null> = {};
let invoked: Array<{ name: string; body: Record<string, unknown> }> = [];
let channels: string[] = [];
let reads: string[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const answer = () => ({ data: rows[table] ?? null, error: errors[table] ?? null });
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.in = self;
    q.order = self;
    q.limit = self;
    q.maybeSingle = async () => answer();
    q.then = (r: (v: unknown) => unknown) => r(answer());
    return q;
  };
  return {
    supabase: {
      from: (table: string) => {
        reads.push(table);
        return chain(table);
      },
      functions: {
        invoke: async (name: string, opts: { body: Record<string, unknown> }) => {
          invoked.push({ name, body: opts.body });
          return { data: { updateLink: "https://icealarm.es/member-update?token=t", delivery: [] }, error: null };
        },
      },
      channel: (name: string) => {
        channels.push(name);
        const ch = { on: () => ch, subscribe: () => ch };
        return ch;
      },
      removeChannel: () => {},
    },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, def?: unknown, opts?: Record<string, unknown>) => {
      const vars = (typeof def === "object" ? def : opts) as Record<string, unknown> | undefined;
      let out = typeof def === "string" ? def : key;
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(String(v));
      return out;
    },
  }),
}));

vi.mock("sonner", () => ({ toast: { error: () => {}, success: () => {} } }));

import { MemberMissingInfoDialog } from "@/components/admin/member-detail/MemberMissingInfoDialog";

const MEMBER = {
  id: "m1",
  first_name: "Mary",
  last_name: "Quinn",
  email: "mary@example.com",
  phone: "600111222",
  nie_dni: null,
  address_line_2: null,
  preferred_language: "en",
};

/** A member with a pendant plan, an active subscription, and several gaps. */
function fixture(overrides: Partial<Record<string, Row>> = {}) {
  return {
    members: {
      id: "m1",
      first_name: "Mary",
      last_name: "Quinn",
      email: "mary@example.com",
      phone: "600111222",
      date_of_birth: "1938-04-05",
      nie_dni: null,
      address_line_1: "Calle Mayor 1",
      city: "Marbella",
      province: "Málaga",
      postal_code: "29601",
    },
    medical_information: { blood_type: "O+", allergies: ["Penicillin"], medications: ["Aspirin"] },
    emergency_contacts: [{ phone: "600333444" }],
    devices: null,
    member_monitoring_readiness: { device_tested_at: null },
    subscriptions: { status: "active", has_pendant: true },
    ...overrides,
  } as Record<string, Row>;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderBadge = () => render(<MemberMissingInfoDialog member={MEMBER} />, { wrapper });

beforeEach(() => {
  rows = fixture();
  errors = {};
  invoked = [];
  channels = [];
  reads = [];
});
afterEach(cleanup);

describe("the missing-info badge", () => {
  it("counts before anybody opens anything", async () => {
    renderBadge();
    // nie_dni, doctor_name, doctor_phone, hospital_preference, device IMEI, pendant not tested.
    await waitFor(() =>
      expect(screen.getByTestId("member-missing-count").textContent).toBe("6"),
    );
  });

  it("says zero for a complete record rather than hiding", async () => {
    rows = fixture({
      members: {
        ...(fixture().members as Record<string, unknown>),
        nie_dni: "X1234567A",
      },
      medical_information: {
        blood_type: "O+",
        allergies: ["Penicillin"],
        medications: ["Aspirin"],
        doctor_name: "Dr Ruiz",
        doctor_phone: "952000000",
        hospital_preference: "Costa del Sol",
      },
      devices: { imei: "351111111111111" },
      member_monitoring_readiness: { device_tested_at: "2026-08-01T10:00:00Z" },
    });
    renderBadge();
    await waitFor(() =>
      expect(screen.getByTestId("member-missing-count").textContent).toBe("0"),
    );
  });

  it("counts a member with nobody to call, and one whose contact has no number", async () => {
    rows = fixture({ emergency_contacts: [] });
    renderBadge();
    // The six, plus "at least one emergency contact".
    await waitFor(() => expect(screen.getByTestId("member-missing-count").textContent).toBe("7"));
    cleanup();

    rows = fixture({ emergency_contacts: [{ phone: "  " }] });
    renderBadge();
    // Somebody to call, no number to call them on — a different gap, and still counted.
    await waitFor(() => expect(screen.getByTestId("member-missing-count").textContent).toBe("7"));
  });

  it("watches for the member's own answers so the count moves without a reload", () => {
    renderBadge();
    expect(channels).toContain("member-missing-m1");
  });
});

describe("the missing-info dialog", () => {
  async function openDialog() {
    renderBadge();
    await waitFor(() => expect(screen.getByTestId("member-missing-count")).toBeTruthy());
    fireEvent.click(screen.getByTestId("member-missing-trigger"));
    await waitFor(() => expect(screen.getByTestId("member-missing-nie_dni")).toBeTruthy());
  }

  it("says WHY each one is needed, not just what is absent", async () => {
    await openDialog();
    expect(screen.getByText(/Spanish identity number/)).toBeTruthy();
    expect(
      screen.getByText(/Until somebody has pressed it in their own home/),
    ).toBeTruthy();
  });

  it("groups them the way the record is grouped", async () => {
    await openDialog();
    expect(screen.getByTestId("member-missing-group-identity")).toBeTruthy();
    expect(screen.getByTestId("member-missing-group-medical")).toBeTruthy();
    expect(screen.getByTestId("member-missing-group-device")).toBeTruthy();
    // Nothing missing there, so no empty heading.
    expect(screen.queryByTestId("member-missing-group-address")).toBeNull();
  });

  it("pre-ticks what a member can supply and refuses to tick what only we can do", async () => {
    await openDialog();
    const ask = (key: string) =>
      screen.getByTestId(`member-missing-${key}`).querySelector("button[role=checkbox]")!;
    expect(ask("nie_dni").getAttribute("data-state")).toBe("checked");
    expect(ask("device_tested").getAttribute("data-state")).toBe("unchecked");
    expect(ask("device_tested").hasAttribute("disabled")).toBe(true);
    // And it is still LISTED — a pendant nobody has tested is the most dangerous gap there is.
    expect(screen.getByTestId("member-missing-device_tested")).toBeTruthy();
    expect(screen.getAllByText("Ours to do").length).toBeGreaterThan(0);
  });

  it("sends only the ticked, member-answerable keys to the existing endpoint", async () => {
    await openDialog();
    fireEvent.click(
      screen.getByTestId("member-missing-nie_dni").querySelector("button[role=checkbox]")!,
    );
    fireEvent.click(screen.getByTestId("member-missing-send"));
    await waitFor(() => expect(screen.getByText("Send Update Request")).toBeTruthy());
    fireEvent.click(screen.getByText("Send Update Request"));

    await waitFor(() => expect(invoked.length).toBeGreaterThan(0));
    expect(invoked[0].name).toBe("send-member-update-request");
    const fields = (invoked[0].body as { requestedFields: string[] }).requestedFields;
    expect(fields).toContain("doctor_name");
    // Un-ticked by the click above.
    expect(fields).not.toContain("nie_dni");
    // Never askable, whatever is ticked.
    expect(fields).not.toContain("device_tested");
    expect(fields).not.toContain("device_imei");
  });

  it("shows the link after sending, in the shared panel", async () => {
    await openDialog();
    fireEvent.click(screen.getByTestId("member-missing-send"));
    await waitFor(() => expect(screen.getByText("Send Update Request")).toBeTruthy());
    fireEvent.click(screen.getByText("Send Update Request"));
    await waitFor(() => expect(screen.getByTestId("update-request-link")).toBeTruthy());
    expect(screen.getByTestId<HTMLInputElement>("update-request-link").value).toContain(
      "member-update?token=",
    );
  });
});

describe("an unreadable table is not a full house of red badges", () => {
  it("a failed medical read contributes no gaps at all", async () => {
    errors = { medical_information: { message: "permission denied" } };
    renderBadge();
    // The six become three: the medical trio drops out rather than reporting as missing.
    await waitFor(() =>
      expect(screen.getByTestId("member-missing-count").textContent).toBe("3"),
    );
  });
});

describe("the members-list column", () => {
  it("counts a page of members in FIVE reads, not six per row", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useMembersMissingCounts } = await import("@/hooks/useMemberMissingInfo");
    reads = [];
    rows = {
      medical_information: [
        {
          member_id: "m1",
          blood_type: "O+",
          allergies: ["Penicillin"],
          medications: ["Aspirin"],
          doctor_name: "Dr Ruiz",
          doctor_phone: "952000000",
          hospital_preference: "Costa del Sol",
        },
      ],
      emergency_contacts: [{ member_id: "m1", phone: "600" }],
      devices: [{ member_id: "m1", imei: "351" }],
      member_monitoring_readiness: [{ member_id: "m1", device_tested_at: "2026-08-01" }],
      subscriptions: [{ member_id: "m1", status: "active", has_pendant: true }],
    };
    const list = [
      { id: "m1", first_name: "Mary", last_name: "Quinn", email: "a@b.es", phone: "6", date_of_birth: "1938-04-05", nie_dni: "X1", address_line_1: "c", city: "d", province: "e", postal_code: "f" },
      { id: "m2", first_name: "", last_name: "", email: "", phone: "" },
    ];
    const { result } = renderHook(() => useMembersMissingCounts(list), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());

    // m1 wants for nothing; m2 is missing most of it.
    expect(result.current.data!.m1).toBe(0);
    expect(result.current.data!.m2).toBeGreaterThan(5);
    // Five tables, once each — not five per member.
    expect(reads.filter((r) => r === "medical_information")).toHaveLength(1);
    expect(reads).toHaveLength(5);
  });

  it("a failed batch is 'not answered' for everyone, not 'empty' for everyone", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useMembersMissingCounts } = await import("@/hooks/useMemberMissingInfo");
    rows = { emergency_contacts: null, medical_information: null, devices: null, member_monitoring_readiness: null, subscriptions: null };
    errors = {
      medical_information: { message: "denied" },
      emergency_contacts: { message: "denied" },
      devices: { message: "denied" },
      member_monitoring_readiness: { message: "denied" },
      subscriptions: { message: "denied" },
    };
    const complete = [
      { id: "m1", first_name: "Mary", last_name: "Quinn", email: "a@b.es", phone: "6", date_of_birth: "1938-04-05", nie_dni: "X1", address_line_1: "c", city: "d", province: "e", postal_code: "f" },
    ];
    const { result } = renderHook(() => useMembersMissingCounts(complete), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    // Every unreadable source contributes nothing — a red badge down the whole list because a
    // query timed out is exactly the false alarm that teaches staff to ignore the column.
    expect(result.current.data!.m1).toBe(0);
  });
});
