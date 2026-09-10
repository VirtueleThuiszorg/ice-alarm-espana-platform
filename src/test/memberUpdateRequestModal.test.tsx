/**
 * THE LINK ON SCREEN — asserted by rendering, because "always shown" is a claim about pixels.
 *
 * The failure this replaces: the dialog closed on success and the URL went with it. Staff had
 * created a one-shot link they could not see, for a member who, more often than not, was going
 * to be read it over the phone rather than sent it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

let invoked: Array<{ name: string; body: unknown }> = [];
let rows: Record<string, unknown> = {};
let response: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const answer = () => ({ data: rows[table] ?? null, error: null });
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.in = self;
    q.limit = self;
    q.order = self;
    q.maybeSingle = async () => answer();
    q.then = (r: (v: unknown) => unknown) => r(answer());
    return q;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      functions: {
        invoke: async (name: string, opts: { body: unknown }) => {
          invoked.push({ name, body: opts.body });
          return response;
        },
      },
    },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, def?: unknown) => (typeof def === "string" ? def : key),
  }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

import { MemberUpdateRequestModal } from "@/components/admin/member-detail/MemberUpdateRequestModal";

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

const LINK = "https://icealarm.es/member-update?token=abc123";

beforeEach(() => {
  invoked = [];
  rows = {
    members: { id: "m1", first_name: "Mary", last_name: "Quinn", email: "mary@example.com" },
    medical_information: {},
    emergency_contacts: [],
    devices: null,
    member_monitoring_readiness: null,
    subscriptions: null,
  };
  toastError.mockClear();
  toastSuccess.mockClear();
  response = {
    data: {
      updateLink: LINK,
      delivery: [
        { channel: "sms", to: null, outcome: "skipped_channel_off" },
        { channel: "email", to: "mary@example.com", outcome: "failed", detail: "bounced" },
      ],
    },
    error: null,
  };
});
afterEach(cleanup);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function open(preselectedFields?: string[]) {
  return render(
    <MemberUpdateRequestModal
      open
      onOpenChange={() => {}}
      member={MEMBER}
      preselectedFields={preselectedFields}
    />,
    { wrapper },
  );
}

async function send() {
  await waitFor(() => expect(screen.getByText("Send Update Request")).toBeTruthy());
  fireEvent.click(screen.getByText("Send Update Request"));
  await waitFor(() => expect(screen.getByTestId("update-request-result")).toBeTruthy());
}

describe("the member's update link", () => {
  it("is shown even when every channel failed to deliver it", async () => {
    open(["nie_dni", "blood_type"]);
    await send();
    expect(screen.getByTestId<HTMLInputElement>("update-request-link").value).toBe(LINK);
    // And the truth about delivery beside it, not instead of it.
    expect(screen.getByText(/channel switched off/)).toBeTruthy();
    expect(screen.getByText(/could not be sent/)).toBeTruthy();
  });

  it("is copyable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    open(["nie_dni", "blood_type"]);
    await send();
    fireEvent.click(screen.getByLabelText("Copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK));
  });

  it("survives a clipboard refusal with something to do instead", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
    });
    open(["nie_dni", "blood_type"]);
    await send();
    fireEvent.click(screen.getByLabelText("Copy"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // Still on screen — a copy that failed is not a link that vanished.
    expect(screen.getByTestId("update-request-link")).toBeTruthy();
  });

  it("sends the ticked fields and the chosen recipient", async () => {
    open(["nie_dni", "blood_type"]);
    await send();
    expect(invoked[0].name).toBe("send-member-update-request");
    const body = invoked[0].body as { requestedFields: string[]; recipientEmail: string };
    expect(body.requestedFields.length).toBeGreaterThan(0);
    expect(body.recipientEmail).toBe("mary@example.com");
  });

  it("refuses to forward a field only WE can supply, whatever the caller ticked", async () => {
    // The dialog will not tick these, but this modal is the thing that talks to the endpoint,
    // and a token asking a member for their pendant's IMEI is a page they cannot complete.
    open(["nie_dni", "device_tested", "device_imei", "active_subscription"]);
    await send();
    const body = invoked[0].body as { requestedFields: string[] };
    expect(body.requestedFields).toEqual(["nie_dni"]);
  });

  it("a refused request shows the failure and no link", async () => {
    response = { data: null, error: { message: "boom" } };
    open(["nie_dni"]);
    await waitFor(() => expect(screen.getByText("Send Update Request")).toBeTruthy());
    fireEvent.click(screen.getByText("Send Update Request"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByTestId("update-request-link")).toBeNull();
  });
});
