/**
 * FOUR CONTROLS THAT USED TO BE FOUR TOASTS.
 *
 * `MessagesTab` carried SMS, WhatsApp, Email and Log Call, and each was
 * `onClick={() => toast.info("… coming soon")}`. A control that announces its own absence is
 * worse than no control: it occupies the place a working one would, so nobody adds the working
 * one, and an operator finds out at the moment they need to text a member.
 *
 * Asserted by pressing them. A source scan cannot tell a wired button from a toast.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

let invoked: Array<{ name: string; body: Record<string, unknown> }> = [];
let inserted: Array<{ table: string; payload: Record<string, unknown> }> = [];
let invokeError: Error | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.order = self;
    q.maybeSingle = async () => ({ data: null, error: null });
    q.single = async () => ({ data: { id: "i1" }, error: null });
    q.insert = (payload: Record<string, unknown>) => {
      inserted.push({ table, payload });
      return {
        select: () => ({ single: async () => ({ data: { id: "i1" }, error: null }) }),
      };
    };
    return q;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      functions: {
        invoke: async (name: string, opts: { body: Record<string, unknown> }) => {
          invoked.push({ name, body: opts.body });
          return { data: invokeError ? null : { ok: true }, error: invokeError };
        },
      },
      auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    },
  };
});

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { id: "s1", first_name: "Ana", last_name: "R", role: "admin" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, def?: unknown) => (typeof def === "string" ? def : key) }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

import { MemberQuickContact, waLink, waNumber } from "@/components/admin/member-detail/MemberQuickContact";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderIt(overrides: Partial<{ phone: string | null; email: string | null }> = {}) {
  return render(
    <MemberQuickContact
      memberId="m1"
      memberName="Mary Quinn"
      phone={overrides.phone === undefined ? "600 111 222" : overrides.phone}
      email={overrides.email === undefined ? "mary@example.com" : overrides.email}
      draft="Your pendant test is due"
    />,
    { wrapper },
  );
}

beforeEach(() => {
  invoked = [];
  inserted = [];
  invokeError = null;
  toastError.mockClear();
  toastSuccess.mockClear();
});
afterEach(cleanup);

describe("the quick-contact controls", () => {
  it("SMS goes through twilio-sms and lands on the member's history", async () => {
    renderIt();
    fireEvent.click(screen.getByTestId("quick-sms"));
    await waitFor(() => expect(screen.getByTestId("quick-confirm")).toBeTruthy());
    // Prefilled from what the operator already typed in the reply box.
    expect(screen.getByLabelText("Message")).toHaveValue("Your pendant test is due");
    fireEvent.click(screen.getByTestId("quick-confirm"));

    await waitFor(() => expect(invoked.length).toBe(1));
    expect(invoked[0].name).toBe("twilio-sms");
    expect(invoked[0].body).toMatchObject({ to: "600 111 222", recipientType: "member" });
    // The dead reader gets a row: ActivityTab reads member_interactions.
    await waitFor(() => expect(inserted.some((i) => i.table === "member_interactions")).toBe(true));
    expect(inserted[0].payload).toMatchObject({ member_id: "m1", interaction_type: "sms_sent" });
  });

  it("Email goes through send-email, attributed to this member", async () => {
    renderIt();
    fireEvent.click(screen.getByTestId("quick-email"));
    await waitFor(() => expect(screen.getByTestId("quick-confirm")).toBeTruthy());
    fireEvent.click(screen.getByTestId("quick-confirm"));

    await waitFor(() => expect(invoked.length).toBe(1));
    expect(invoked[0].name).toBe("send-email");
    expect(invoked[0].body).toMatchObject({
      to: "mary@example.com",
      module: "member",
      related_entity_id: "m1",
    });
    await waitFor(() =>
      expect(inserted.some((i) => i.payload.interaction_type === "email_sent")).toBe(true),
    );
  });

  it("WhatsApp opens the operator's own client and does NOT claim a delivery", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    renderIt();
    fireEvent.click(screen.getByTestId("quick-whatsapp"));
    await waitFor(() => expect(screen.getByTestId("quick-confirm")).toBeTruthy());
    fireEvent.click(screen.getByTestId("quick-confirm"));

    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(String(open.mock.calls[0][0])).toContain("https://wa.me/34600111222?text=");
    // Nothing went through an endpoint of ours, and the wording says so.
    expect(invoked).toHaveLength(0);
    expect(String(toastSuccess.mock.calls[0][0])).toMatch(/opened/i);
    expect(String(toastSuccess.mock.calls[0][0])).not.toMatch(/\bsent\b/i);
    vi.unstubAllGlobals();
  });

  it("Log Call writes one row with the operator's note, and sends nothing", async () => {
    renderIt();
    fireEvent.click(screen.getByTestId("quick-call"));
    await waitFor(() => expect(screen.getByTestId("quick-confirm")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("What was the call about?"), {
      target: { value: "No answer, will try tomorrow" },
    });
    fireEvent.click(screen.getByTestId("quick-confirm"));

    await waitFor(() => expect(inserted.length).toBe(1));
    expect(inserted[0].payload).toMatchObject({
      interaction_type: "call_outbound",
      description: "No answer, will try tomorrow",
    });
    expect(invoked).toHaveLength(0);
  });

  it("says so plainly when there is nowhere to send it", async () => {
    renderIt({ phone: null });
    fireEvent.click(screen.getByTestId("quick-sms"));
    await waitFor(() => expect(screen.getByTestId("quick-missing-address")).toBeTruthy());
    expect((screen.getByTestId("quick-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the transport's own refusal, not a generic failure", async () => {
    // An Error, as supabase-js hands back for a relay/fetch failure. `functionError` unwraps a
    // FunctionsHttpError's body for the other case; either way the SERVER's sentence is what
    // must reach the operator, because "Twilio not configured" is an action and "Failed" is not.
    invokeError = new Error("Twilio not configured");
    renderIt();
    fireEvent.click(screen.getByTestId("quick-sms"));
    await waitFor(() => expect(screen.getByTestId("quick-confirm")).toBeTruthy());
    fireEvent.click(screen.getByTestId("quick-confirm"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toContain("Twilio not configured");
    // Nothing is logged for a message that never left.
    expect(inserted).toHaveLength(0);
  });
});

describe("the WhatsApp number", () => {
  it("assumes Spain for a nine-digit local number and leaves an international one alone", () => {
    expect(waNumber("600 111 222")).toBe("34600111222");
    expect(waNumber("+34 600 111 222")).toBe("34600111222");
    expect(waNumber("+44 7700 900123")).toBe("447700900123");
  });

  it("refuses a number too short to be one", () => {
    expect(waNumber("600")).toBeNull();
    expect(waNumber(null)).toBeNull();
    expect(waLink("600", "hi")).toBeNull();
  });

  it("escapes the message into the link", () => {
    expect(waLink("600111222", "a&b c")).toBe("https://wa.me/34600111222?text=a%26b%20c");
  });
});
